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
