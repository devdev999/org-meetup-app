import { expect, test } from "vitest";
import type { MemberActions } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, signInAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

async function linkTelegram(actor: MemberActions, chatId: string) {
  const link = await actor.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId, code: new URL(link.url).searchParams.get("start")! });
  h.telegram.reset();
}

async function createMeetup(host: MemberActions) {
  const choices = await host.meetupChoices();
  return host.createMeetup({
    activityId: choices.activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T09:30:00Z"), durationMinutes: 60, capacity: 3,
    place: { kind: "virtual", url: "https://meet.example/Finance/ana@example.test" },
    description: "Learn SQL with the Finance Department",
  });
}

async function member(name = "Ana", organisation = "ministry-a") {
  return signInAndAcknowledgeAs(h, organisation, {
    sub: name, name: `${name} Member`, email: `${name.toLowerCase()}@example.test`,
  });
}

test("a Member links Telegram with a ten-minute code that can only be used once", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const link = await ana.beginTelegramLink();
  expect(link.expiresAt).toEqual(new Date("2026-09-18T09:10:00Z"));
  expect(link.url).toMatch(/^https:\/\/t.me\/meetups_test_bot\?start=[A-Za-z0-9_-]+$/);
  const code = new URL(link.url).searchParams.get("start")!;

  await h.app.handleTelegram({ kind: "link", chatId: "101", code });
  expect(await ana.notificationSettings()).toMatchObject({ telegramLinked: true });
  await ana.unlinkTelegram();
  await h.app.handleTelegram({ kind: "link", chatId: "102", code });
  expect(await ana.notificationSettings()).toMatchObject({ telegramLinked: false });

  const expired = await ana.beginTelegramLink();
  h.clock.set(expired.expiresAt);
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(expired.url).searchParams.get("start")! });
  expect(await ana.notificationSettings()).toMatchObject({ telegramLinked: false });
});

test("a join delivers an immediate notice through each enabled channel with minimal external content", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);

  expect(await ana.inbox()).toContainEqual(expect.objectContaining({ kind: "meetup-joined", meetupId: meetup.id }));
  expect(h.telegram.outbox).toEqual([{
    chatId: "101", text: "Bo joined your Meetup. coffee, 2026-09-18 09:30 UTC, Online.", joinMeetupId: meetup.id,
  }]);
  expect(h.email.outbox).toEqual([expect.objectContaining({
    to: "ana@example.test", subject: "Meetup notice", text: "Bo joined your Meetup. coffee, 2026-09-18 09:30 UTC, Online.",
  })]);
});

test("Members control each channel per notice kind, including urgent notices, without losing their inbox", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  await ana.setNoticePreference({ kind: "meetup-joined", telegram: false, email: true });
  await ana.setNoticePreference({ kind: "meetup-cancelled", telegram: true, email: false });
  expect((await ana.notificationSettings()).preferences).toEqual(expect.arrayContaining([
    { kind: "meetup-joined", telegram: false, email: true },
    { kind: "meetup-cancelled", telegram: true, email: false },
  ]));
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  expect(h.telegram.outbox).toEqual([]);
  expect(h.email.outbox).toHaveLength(1);
  await ana.cancelMeetup(meetup.id);
  expect(h.telegram.outbox).toEqual([{ chatId: "101", text: "The Host cancelled this Meetup. coffee, 2026-09-18 09:30 UTC, Online." }]);
  expect(h.email.outbox.map((notice) => notice.to)).toEqual(["ana@example.test", "bo@example.test"]);
  expect((await ana.inbox()).map((notice) => notice.kind)).toEqual(["meetup-cancelled", "meetup-joined"]);
  expect((await bo.inbox()).map((notice) => notice.kind)).toEqual(["meetup-cancelled"]);
});

test("non-urgent Telegram notices arrive immediately while email batches once in the next daily digest", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(bo, "102");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  h.email.reset();
  await ana.editMeetup(meetup.id, { ...meetup, startsAt: new Date("2026-09-18T10:00:00Z") });
  await ana.editMeetup(meetup.id, { ...meetup, startsAt: new Date("2026-09-18T11:00:00Z") });
  expect(h.telegram.outbox).toHaveLength(2);
  expect(h.email.outbox).toEqual([]);
  expect(await bo.inbox()).toHaveLength(2);
  h.clock.set(new Date("2026-09-19T08:59:59Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  await Promise.all([h.app.sendDailyDigests(), h.app.sendDailyDigests()]);
  expect(h.email.outbox).toEqual([expect.objectContaining({
    to: "bo@example.test", subject: "Daily Meetup digest",
    text: "The Host changed the time or Place of this Meetup. coffee, 2026-09-18 10:00 UTC, Online.\n\nThe Host changed the time or Place of this Meetup. coffee, 2026-09-18 11:00 UTC, Online.",
  })]);
});

test("a Telegram button joins as the linked Member and answers with the result", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(bo, "102");
  const meetup = await createMeetup(ana);
  await h.app.handleTelegram({ kind: "join", chatId: "102", callbackId: "answer-1", meetupId: meetup.id });
  expect((await bo.viewMeetup(meetup.id))?.membership).toBe("participant");
  expect(h.telegram.answers).toEqual([{ callbackId: "answer-1", text: "You joined the Meetup." }]);
  await h.app.handleTelegram({ kind: "join", chatId: "102", callbackId: "answer-2", meetupId: meetup.id });
  expect(await ana.inbox()).toHaveLength(1);
  await h.app.handleTelegram({ kind: "join", chatId: "999", callbackId: "answer-3", meetupId: meetup.id });
  expect(h.telegram.answers.at(-1)).toEqual({ callbackId: "answer-3", text: "Link Telegram from notification settings in the app first." });
});

test("a failed delivery leaves the inbox intact and concurrent worker retries do not resend successful channels", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  h.telegram.failure = new Error("Telegram is unavailable");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  expect(await ana.inbox()).toHaveLength(1);
  expect(h.email.outbox).toHaveLength(1);
  expect(h.telegram.outbox).toEqual([]);
  h.telegram.failure = undefined;
  h.clock.set(new Date("2026-09-18T09:01:00Z"));
  await Promise.all([h.app.deliverNotices(), h.app.deliverNotices()]);
  expect(h.telegram.outbox).toHaveLength(1);
  expect(h.email.outbox).toHaveLength(1);
});

test("disabling a channel before a retry or digest prevents delivery and keeps the notices", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  h.telegram.failure = new Error("Telegram is unavailable");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  await ana.setNoticePreference({ kind: "meetup-joined", telegram: false, email: false });
  await bo.leaveMeetup(meetup.id);
  await ana.setNoticePreference({ kind: "meetup-left", telegram: false, email: false });
  h.telegram.failure = undefined;
  h.email.reset();
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  await h.app.deliverNotices();
  await h.app.sendDailyDigests();
  expect(h.telegram.outbox).toEqual([]);
  expect(h.email.outbox).toEqual([]);
  expect(await ana.inbox()).toHaveLength(2);
});

test("link codes and Telegram callbacks preserve Organisation boundaries", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);
  const ana = await member();
  const other = await member("Bo", "ministry-b");
  const old = await ana.beginTelegramLink();
  const current = await ana.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(old.url).searchParams.get("start")! });
  expect((await ana.notificationSettings()).telegramLinked).toBe(false);
  await Promise.all(["101", "102"].map((chatId) => h.app.handleTelegram({ kind: "link", chatId, code: new URL(current.url).searchParams.get("start")! })));
  expect((await ana.notificationSettings()).telegramLinked).toBe(true);
  const boundChat = h.telegram.outbox.find((message) => message.text.startsWith("Telegram is linked"))!.chatId;
  const otherLink = await other.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: boundChat, code: new URL(otherLink.url).searchParams.get("start")! });
  expect((await other.notificationSettings()).telegramLinked).toBe(false);
  await linkTelegram(other, "201");
  const meetup = await createMeetup(ana);
  await h.app.handleTelegram({ kind: "join", chatId: "201", callbackId: "foreign", meetupId: meetup.id });
  expect((await ana.viewMeetup(meetup.id))?.participantCount).toBe(1);
  expect(h.telegram.answers.at(-1)?.text).toContain("unavailable");
  expect(await other.inbox()).toEqual([]);
});

test("notification settings and Telegram links require acknowledgement and an Active Member", async () => {
  const adminPerson = { name: "Admin", email: "admin@example.test" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const adminMember = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "admin", ...adminPerson });
  const ana = await signInAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const operations = [
    () => ana.notificationSettings(), () => ana.beginTelegramLink(), () => ana.unlinkTelegram(),
    () => ana.setNoticePreference({ kind: "meetup-joined", telegram: false, email: false }),
  ];
  for (const operation of operations) await expect(operation()).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await ana.acknowledgeAdminVisibilityNotice();
  const link = await ana.beginTelegramLink();
  const admin = await adminMember.organisationAdmin();
  const roster = [adminPerson, ministryA.platformAdmin].map((person) => ({ ...person, department: null, site: null }));
  await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);
  for (const operation of operations) await expect(operation()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(link.url).searchParams.get("start")! });
  expect(h.telegram.outbox.at(-1)?.text).toContain("cannot be used");
});
