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

async function emailDelivery(mode: "immediate" | "digest") {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  const meetup = await createMeetup(ana);
  if (mode === "digest") {
    await bo.joinMeetup(meetup.id);
    await bo.leaveMeetup(meetup.id);
    h.clock.set(new Date("2026-09-19T09:00:00Z"));
  }
  h.email.reset();
  const drain = () => mode === "digest" ? h.app.sendDailyDigests() : h.app.deliverNotices();
  return { drain, start: mode === "digest" ? drain : () => bo.joinMeetup(meetup.id) };
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

test("a join keeps the place name on Telegram and carries the meeting URL by email", async () => {
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
    to: "ana@example.test", subject: "Meetup notice", text: "Bo joined your Meetup. coffee, 2026-09-18 09:30 UTC, https://meet.example/Finance/ana@example.test.",
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

test("non-urgent notices arrive on Telegram immediately while email batches into the next daily digest", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  const cy = await member("Cy");
  await linkTelegram(ana, "101");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  h.telegram.reset();
  h.email.reset();
  await bo.leaveMeetup(meetup.id);
  await cy.leaveMeetup(meetup.id);
  expect(h.telegram.outbox).toHaveLength(2);
  expect(h.email.outbox).toEqual([]);
  expect((await ana.inbox()).filter((notice) => notice.kind === "meetup-left")).toHaveLength(2);
  h.clock.set(new Date("2026-09-19T08:59:59Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  await Promise.all([h.app.sendDailyDigests(), h.app.sendDailyDigests()]);
  expect(h.email.outbox).toEqual([expect.objectContaining({
    to: "ana@example.test", subject: "Daily Meetup digest",
    text: "Bo left your Meetup. coffee, 2026-09-18 09:30 UTC, https://meet.example/Finance/ana@example.test.\n\nCy left your Meetup. coffee, 2026-09-18 09:30 UTC, https://meet.example/Finance/ana@example.test.",
  })]);
});

test("an edit to the time or Place emails participants immediately", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  h.email.reset();
  await ana.editMeetup(meetup.id, {
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: meetup.durationMinutes,
    place: meetup.place, capacity: meetup.capacity, description: meetup.description,
  });
  expect(h.email.outbox).toEqual([expect.objectContaining({
    to: "bo@example.test", subject: "Meetup notice",
    text: "The Host changed the time or Place of this Meetup. coffee, 2026-09-18 10:00 UTC, https://meet.example/Finance/ana@example.test.",
  })]);
});

test("a permanently failing channel backs off and dead-letters instead of retrying forever", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  h.telegram.failure = new Error("Telegram is unavailable");
  const meetup = await createMeetup(ana);
  await bo.joinMeetup(meetup.id);
  expect(h.email.outbox).toHaveLength(1);
  let now = new Date("2026-09-18T09:00:00Z").getTime();
  for (let attempt = 0; attempt < 20; attempt++) {
    now += 60_000;
    h.clock.set(new Date(now));
    await h.app.deliverNotices();
  }
  h.telegram.failure = undefined;
  now += 60_000;
  h.clock.set(new Date(now));
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toEqual([]);
});

test("a Telegram join commits and does not throw when answering the callback fails", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(bo, "102");
  const meetup = await createMeetup(ana);
  h.telegram.answerFailure = new Error("answering failed");
  await expect(h.app.handleTelegram({ kind: "join", chatId: "102", callbackId: "x", meetupId: meetup.id })).resolves.toBeUndefined();
  expect((await bo.viewMeetup(meetup.id))?.membership).toBe("participant");
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

test.each(["immediate", "digest"] as const)("a slow %s email is sent once while another worker drains notices", async (mode) => {
  const { start, drain } = await emailDelivery(mode);
  let resume = () => {};
  h.email.sendDelay = new Promise<void>((resolve) => { resume = resolve; });
  const first = start();
  try {
    await expect.poll(() => h.email.attempts).toHaveLength(1);
    for (let tick = 0; tick < 4; tick++) await h.clock.advance(20_000);
    h.email.sendDelay = undefined;
    await drain();
    expect(h.email.attempts).toHaveLength(1);
  } finally {
    resume();
    await first;
  }
  await h.clock.advance(60_000);
  await drain();
  expect(h.email.outbox).toHaveLength(1);
});

test.each(["immediate", "digest"] as const)("an expired %s email attempt cannot consume the replacement's retry budget", async (mode) => {
  const { start, drain } = await emailDelivery(mode);
  h.email.failure = new Error("SMTP is unavailable");
  await start();
  for (let attempt = 1; attempt < 13; attempt++) {
    await h.clock.advance(60_000);
    await drain();
  }
  expect(h.email.attempts).toHaveLength(13);
  await h.clock.advance(60_000);
  let failExpired = () => {};
  h.email.sendDelay = new Promise<void>((_, reject) => { failExpired = () => reject(new Error("Old SMTP connection failed")); });
  const expired = drain();
  try {
    await expect.poll(() => h.email.attempts).toHaveLength(14);
    h.clock.set(new Date(h.clock.now().getTime() + 61_000));
    h.email.sendDelay = undefined;
    await drain();
    expect(h.email.attempts).toHaveLength(15);
  } finally {
    failExpired();
    await expired;
  }
  h.email.failure = undefined;
  await h.clock.advance(60_000);
  await drain();
  expect(h.email.outbox).toHaveLength(1);
});

test("a Telegram join answers the callback before waiting for notice delivery", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await member();
  const bo = await member("Bo");
  await linkTelegram(ana, "101");
  await linkTelegram(bo, "102");
  const meetup = await createMeetup(ana);
  let resume = () => {};
  h.telegram.sendDelay = new Promise<void>((resolve) => { resume = resolve; });
  const callback = h.app.handleTelegram({ kind: "join", chatId: "102", callbackId: "slow-provider", meetupId: meetup.id });
  try {
    await expect.poll(() => h.telegram.answers, { timeout: 1_000 }).toEqual([
      { callbackId: "slow-provider", text: "You joined the Meetup." },
    ]);
  } finally {
    resume();
    await callback;
  }
  expect((await bo.viewMeetup(meetup.id))?.membership).toBe("participant");
  expect(h.telegram.outbox).toHaveLength(1);
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
