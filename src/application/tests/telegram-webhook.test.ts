import { expect, test } from "vitest";
import { createTelegramWebhook } from "../../adapters/telegram/webhook";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
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
