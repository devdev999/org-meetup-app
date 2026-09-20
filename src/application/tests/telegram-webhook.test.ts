import { expect, test } from "vitest";
import { createTelegramWebhook } from "../../adapters/telegram/webhook";
import { ministryA, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();
const secret = "test-webhook-secret";

function request(update: unknown, token = secret) {
  return new Request("https://meetups.example/api/telegram", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": token }, body: JSON.stringify(update),
  });
}

test("an authenticated Telegram webhook links a Member, joins a Meetup and replies through the port", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana Member", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo Member", email: "bo@example.test" });
  const link = await bo.beginTelegramLink();
  const code = new URL(link.url).searchParams.get("start");
  const webhook = createTelegramWebhook(h.app, secret);
  const start = { update_id: 1, message: { message_id: 1, from: { id: 102, is_bot: false }, chat: { id: 102, type: "private" }, text: `/start ${code}` } };
  expect((await webhook(request(start, "wrong"))).status).toBe(401);
  expect((await bo.notificationSettings()).telegramLinked).toBe(false);
  expect((await webhook(request(start))).status).toBe(200);
  expect((await bo.notificationSettings()).telegramLinked).toBe(true);
  const meetup = await ana.createMeetup({
    activityId: (await ana.meetupChoices()).activities[0]!.id, startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, capacity: 3,
  });
  const callback = { update_id: 2, callback_query: { id: "callback-1", from: { id: 102, is_bot: false }, message: { chat: { id: 102, type: "private" } }, data: `join:${meetup.id}` } };
  expect((await webhook(request(callback))).status).toBe(200);
  expect((await bo.viewMeetup(meetup.id))?.membership).toBe("participant");
  expect(h.telegram.answers).toEqual([{ callbackId: "callback-1", text: "You joined the Meetup." }]);
});

test("Telegram commands from group chats or another sender cannot bind an account", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const link = await ana.beginTelegramLink();
  const text = `/start ${new URL(link.url).searchParams.get("start")}`;
  const webhook = createTelegramWebhook(h.app, secret);
  for (const chat of [{ id: -123, type: "group" }, { id: 999, type: "private" }]) {
    expect((await webhook(request({ update_id: 3, message: { from: { id: 102, is_bot: false }, chat, text } }))).status).toBe(200);
  }
  expect((await ana.notificationSettings()).telegramLinked).toBe(false);
  expect(h.telegram.outbox).toEqual([]);
});

test("Telegram Invite buttons accept or decline only for the linked invitee and notify the Host", async () => {
  await h.app.bootstrap(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana Member", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo Member", email: "bo@example.test" });
  const cy = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "cy", name: "Cy Member", email: "cy@example.test" });
  for (const [actor, chatId] of [[host, "101"], [bo, "102"], [cy, "103"]] as const) {
    const link = await actor.beginTelegramLink();
    await h.app.handleTelegram({ kind: "link", chatId, code: new URL(link.url).searchParams.get("start")! });
  }
  h.telegram.reset();
  const meetup = await host.createMeetup({
    activityId: (await host.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/private-room" }, capacity: 2, audience: { kind: "invite-only" },
    description: "Private description",
  });
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  expect(h.telegram.outbox).toEqual([{
    chatId: "102", text: "Ana invited you to a Meetup. coffee, 2026-09-18 10:00 UTC, Online.", inviteId: invite.id,
  }]);
  const webhook = createTelegramWebhook(h.app, secret);
  const callback = (chatId: number, answer: string, inviteId: string) => request({
    update_id: 4, callback_query: { id: `${chatId}-${answer}`, from: { id: chatId, is_bot: false },
      message: { chat: { id: chatId, type: "private" } }, data: `${answer}:${inviteId}` },
  });
  await webhook(callback(103, "accept", invite.id));
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("pending");
  expect((await webhook(callback(102, "accept", invite.id))).status).toBe(200);
  expect(await bo.viewMeetup(meetup.id)).toMatchObject({ membership: "participant", invite: { state: "accepted" } });
  expect(h.telegram.answers.at(-1)).toEqual({ callbackId: "102-accept", text: "Invite accepted." });
  const cyInvite = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  await webhook(callback(103, "decline", cyInvite.id));
  expect((await cy.viewMeetup(meetup.id))?.invite?.state).toBe("declined");
  expect(h.telegram.answers.at(-1)).toEqual({ callbackId: "103-decline", text: "Invite declined." });
  expect(h.telegram.outbox.filter((message) => message.chatId === "101").map((message) => message.text)).toEqual([
    "Bo accepted your Invite. coffee, 2026-09-18 10:00 UTC, Online.",
    "Cy declined your Invite. coffee, 2026-09-18 10:00 UTC, Online.",
  ]);
  await bo.leaveMeetup(meetup.id);
  await webhook(callback(102, "accept", invite.id));
  expect(h.telegram.answers.at(-1)).toEqual({
    callbackId: "102-accept", text: "Your Invite was accepted, but you no longer have a place in this Meetup.",
  });
  expect((await bo.viewMeetup(meetup.id))?.membership).toBeNull();
});

test("Telegram posts Availability in two taps after choosing an Activity and a window", async () => {
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryA));
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test", building: "Harbour House" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo", email: "bo@example.test", building: "Harbour House" });
  const code = new URL((await ana.beginTelegramLink()).url).searchParams.get("start")!;
  await h.app.handleTelegram({ kind: "link", chatId: "101", code });
  h.telegram.reset();
  const webhook = createTelegramWebhook(h.app, secret);
  const callback = (data: string, id: string) => request({
    update_id: 10, callback_query: { id, from: { id: 101, is_bot: false }, message: { chat: { id: 101, type: "private" } }, data },
  });
  await webhook(request({ update_id: 9, message: { from: { id: 101, is_bot: false }, chat: { id: 101, type: "private" }, text: "/available" } }));
  const activity = h.telegram.outbox.at(-1)!.buttons!.flat().find((entry) => entry.text === "coffee")!;
  expect(activity.action.kind).toBe("availability-activity");
  h.telegram.answerFailure = new Error("Callback acknowledgement unavailable");
  await webhook(callback(`av-activity:${activity.action.activityId}`, "choose-activity"));
  h.telegram.answerFailure = undefined;
  expect((await bo.availability()).open).toEqual([]);
  const presets = h.telegram.outbox.at(-1)!.buttons!.flat();
  const window = presets.find((entry) => entry.text === "Now for 30 minutes at my Site")!;
  expect(window.action).toEqual({ kind: "availability-post", activityId: activity.action.activityId, issuedAt: new Date("2026-09-18T09:00:00Z"), minutes: 30, placeKind: "physical" });
  const windowData = `av-post:${activity.action.activityId}:tljyc0:p:30`;
  expect((await webhook(callback(windowData, "choose-window"))).status).toBe(200);
  expect((await bo.availability()).open).toEqual([expect.objectContaining({
    activity: { id: expect.any(String), name: "coffee" }, startsAt: new Date("2026-09-18T09:00:00Z"),
    endsAt: new Date("2026-09-18T09:30:00Z"), place: { kind: "physical", siteId: expect.any(String), siteName: "Harbour House" },
  })]);
  await webhook(callback(windowData, "choose-window"));
  expect((await bo.availability()).open).toHaveLength(1);
  expect(h.telegram.answers.at(-1)?.text).toBe("Availability posted.");
  const virtual = presets.find((entry) => entry.text === "Now for 60 minutes virtually")!;
  expect(virtual.action).toMatchObject({ kind: "availability-post", minutes: 60, placeKind: "virtual" });
  await webhook(callback(`av-post:${activity.action.activityId}:tljyc0:v:60`, "choose-virtual"));
  expect((await bo.availability()).open).toHaveLength(2);
  h.clock.set(new Date("2026-09-18T10:00:00Z"));
  await webhook(callback(windowData, "expired-window"));
  expect(h.telegram.answers.at(-1)).toEqual({ callbackId: "expired-window", text: "This Availability choice is unavailable. Send /available to choose again." });
  expect((await bo.availability()).open).toEqual([]);
});
