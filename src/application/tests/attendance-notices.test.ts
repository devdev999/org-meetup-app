import { expect, test } from "vitest";
import { createTelegramWebhook } from "../../adapters/telegram/webhook";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();

async function setup(kind: "meetup" | "event") {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo", email: "bo@example.test" });
  const link = await ana.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(link.url).searchParams.get("start")! });
  const occurrence = await createMeetupOrEvent(h, ana, {
    activityId: (await ana.meetupChoices()).activities.find((entry) => entry.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 3,
    place: { kind: "virtual", url: "https://meet.example/private-room" }, description: "Finance SQL",
  }, kind);
  await participationFor(bo, kind).join(occurrence.id);
  h.email.reset();
  h.telegram.reset();
  return { ana, bo, occurrence };
}

test.each(["meetup", "event"] as const)("the worker prompts the %s Host once after the end through the inbox and enabled channels", async (kind) => {
  const { ana, bo, occurrence } = await setup(kind);
  h.clock.set(new Date("2026-09-18T10:59:59.999Z"));
  await h.app.processAttendance();
  expect((await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toEqual([]);
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await Promise.all([h.app.processAttendance(), h.app.processAttendance()]);
  const prompts = (await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt");
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toMatchObject(kind === "meetup" ? { meetupId: occurrence.id } : { eventId: occurrence.id });
  expect((await bo.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toEqual([]);
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "unknown" });
  await h.app.deliverNotices();
  const label = kind === "meetup" ? "Meetup" : "Event";
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "ana@example.test", subject: `${label} notice`, text: `Confirm who came to this ${label}. coffee, 2026-09-18 10:00 UTC, https://meet.example/private-room.` })]);
  expect(h.telegram.outbox).toEqual([expect.objectContaining({ chatId: "101", text: `Confirm who came to this ${label}. coffee, 2026-09-18 10:00 UTC, Online.` })]);
  await h.app.processAttendance();
  await h.app.deliverNotices();
  expect(h.email.outbox).toHaveLength(1);
});

test.each(["confirmed", "expired"] as const)("an undelivered Attendance prompt is suppressed once it is %s", async (state) => {
  const { ana, occurrence } = await setup("meetup");
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await h.app.processAttendance();
  if (state === "confirmed") await ana.confirmAttendance(occurrence.id, []);
  else h.clock.set(new Date("2026-09-25T11:00:00Z"));
  await h.app.deliverNotices();
  expect(h.email.outbox).toEqual([]);
  expect(h.telegram.outbox.filter((message) => message.confirmAttendanceNoticeId)).toEqual([]);
  expect((await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toHaveLength(1);
  await h.app.processAttendance();
  expect((await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toHaveLength(1);
});

test.each([[false, true], [true, false], [false, false]])("Attendance prompt preferences keep Telegram %s and email %s independent", async (telegram, email) => {
  const { ana } = await setup("meetup");
  await ana.setNoticePreference({ kind: "attendance-prompt", telegram, email });
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await h.app.processAttendance();
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toHaveLength(telegram ? 1 : 0);
  expect(h.email.outbox).toHaveLength(email ? 1 : 0);
  expect((await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toHaveLength(1);
});

test("Attendance prompt retries do not resend a successful channel", async () => {
  await setup("event");
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await h.app.processAttendance();
  h.email.failure = new Error("email unavailable");
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toHaveLength(1);
  expect(h.email.outbox).toEqual([]);
  h.email.failure = undefined;
  h.clock.set(new Date("2026-09-18T11:01:00Z"));
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toHaveLength(1);
  expect(h.email.outbox).toHaveLength(1);
});

test.each(["meetup", "event"] as const)("the %s Attendance callback confirms everyone for its Host and cannot replay over an amendment", async (kind) => {
  const { ana, bo, occurrence } = await setup(kind);
  const boLink = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "102", code: new URL(boLink.url).searchParams.get("start")! });
  h.telegram.reset();
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await h.app.processAttendance();
  await h.app.deliverNotices();
  const notice = (await ana.inbox()).find((entry) => entry.kind === "attendance-prompt")!;
  expect(h.telegram.outbox).toEqual([expect.objectContaining({ chatId: "101", confirmAttendanceNoticeId: notice.id })]);
  const webhook = createTelegramWebhook(h.app, "attendance-secret");
  const callback = (senderId: number, chat = { id: senderId, type: "private" }, secret = "attendance-secret", noticeId = notice.id) => webhook(new Request("https://meetups.example/api/telegram", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ update_id: 100, callback_query: { id: `attendance-${senderId}`, from: { id: senderId, is_bot: false }, message: { chat }, data: `attendance:${noticeId}` } }),
  }));
  expect((await callback(101, undefined, "wrong")).status).toBe(401);
  await callback(101, { id: -1, type: "group" });
  await callback(101, { id: 102, type: "private" });
  await callback(102);
  await callback(101, undefined, undefined, "bad-id");
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "unknown" });
  expect((await callback(101)).status).toBe(200);
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "attended" });
  expect(await ana.attendance(occurrence.id)).toMatchObject({ outcome: "attended" });
  expect(h.telegram.answers.at(-1)?.text).toBe("Attendance recorded. Amend it in the app if needed.");
  await ana.confirmAttendance(occurrence.id, []);
  await callback(101);
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "no-show" });
  expect(await bo.connections()).toEqual([]);
});

test("returning to a previous Event Host issues a new prompt and keeps the older button unusable", async () => {
  const { ana, bo, occurrence } = await setup("event");
  const adminClaims = { sub: "admin", email: "admin@example.test", name: "Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminClaims });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminClaims)).organisationAdmin();
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await h.app.processAttendance();
  const old = (await ana.inbox()).find((notice) => notice.kind === "attendance-prompt")!;
  await admin.reassignEventHost(occurrence.id, (await bo.profile()).memberId);
  await h.app.processAttendance();
  expect((await bo.inbox()).filter((notice) => notice.kind === "attendance-prompt")).toHaveLength(1);
  await admin.reassignEventHost(occurrence.id, (await ana.profile()).memberId);
  await h.app.processAttendance();
  const prompts = (await ana.inbox()).filter((notice) => notice.kind === "attendance-prompt");
  expect(prompts).toHaveLength(2);
  await h.app.handleTelegram({ kind: "confirm-attendance", chatId: "101", callbackId: "old", noticeId: old.id });
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "unknown" });
  await h.app.handleTelegram({ kind: "confirm-attendance", chatId: "101", callbackId: "new", noticeId: prompts[0]!.id });
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "attended" });
});

test("Attendance confirmations and amendments notify Participants without exposing outcomes or duplicating unchanged records", async () => {
  const { ana, bo, occurrence } = await setup("event");
  const link = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "102", code: new URL(link.url).searchParams.get("start")! });
  h.telegram.reset();
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  const anaId = (await ana.profile()).memberId;
  const boId = (await bo.profile()).memberId;
  await ana.confirmAttendance(occurrence.id, [anaId, boId]);
  await ana.confirmAttendance(occurrence.id, [boId, anaId, boId]);
  expect((await bo.inbox()).filter((notice) => notice.kind === "attendance-confirmed")).toHaveLength(1);
  expect(h.telegram.outbox.filter((message) => message.chatId === "102")).toEqual([{
    chatId: "102", text: "The Host recorded Attendance for this Event. coffee, 2026-09-18 10:00 UTC, Online.",
  }]);
  expect(h.email.outbox).toEqual([]);
  await ana.confirmAttendance(occurrence.id, [anaId]);
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "no-show" });
  expect((await bo.inbox()).filter((notice) => notice.kind === "attendance-confirmed")).toHaveLength(2);
  expect(h.telegram.outbox.filter((message) => message.chatId === "102").at(-1)).toEqual({
    chatId: "102", text: "The Host amended Attendance for this Event. coffee, 2026-09-18 10:00 UTC, Online.",
  });
});
