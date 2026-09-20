import { PgBoss } from "pg-boss";
import { expect, test } from "vitest";
import { AVAILABILITY_QUEUE, DIGEST_QUEUE, INVITE_EXPIRY_QUEUE, RECURRENCE_QUEUE, registerJobs } from "../../worker/jobs";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("the worker generates recurring Meetups and RSVP prompts through the real queue", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const first = await ana.createMeetup({
    activityId: (await ana.meetupChoices()).activities[0]!.id, startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/walk" }, capacity: 2, recurrence: { frequency: "weekly" },
  });
  const boss = new PgBoss({ connectionString: h.connectionString });
  await boss.start();
  try {
    await registerJobs(boss, { application: h.app, clock: h.clock, log: () => {} });
    await boss.send(RECURRENCE_QUEUE, {});
    await expect.poll(async () => (await ana.listMeetups()).map((meetup) => meetup.startsAt.toISOString()), { timeout: 15_000 }).toEqual([
      "2026-09-19T10:00:00.000Z", "2026-09-26T10:00:00.000Z",
    ]);
    expect(await ana.inbox()).toContainEqual(expect.objectContaining({ kind: "rsvp-prompt", meetupId: first.id }));
  } finally {
    await boss.stop({ graceful: true });
  }
});

test("the worker sends a daily email digest through the real queue", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo", email: "bo@example.test" });
  const meetup = await ana.createMeetup({
    activityId: (await ana.meetupChoices()).activities[0]!.id, startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, capacity: 3,
  });
  await bo.joinMeetup(meetup.id);
  h.email.reset();
  await bo.leaveMeetup(meetup.id);
  h.clock.set(new Date("2026-09-19T09:00:00Z"));

  const boss = new PgBoss({ connectionString: h.connectionString });
  await boss.start();
  try {
    await registerJobs(boss, { application: h.app, clock: h.clock, log: () => {} });
    await boss.send(DIGEST_QUEUE, {});
    await expect.poll(() => h.email.outbox, { timeout: 15_000 }).toEqual([
      expect.objectContaining({ to: "ana@example.test", subject: "Daily Meetup digest" }),
    ]);
  } finally {
    await boss.stop({ graceful: true });
  }
});

test("the worker expires pending Invites through the real queue", async () => {
  await h.app.bootstrap(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo", email: "bo@example.test" });
  const meetup = await host.createMeetup({
    activityId: (await host.meetupChoices()).activities[0]!.id, startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, capacity: 2, audience: { kind: "invite-only" },
  });
  await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  h.clock.set(meetup.startsAt);
  const boss = new PgBoss({ connectionString: h.connectionString });
  await boss.start();
  try {
    await registerJobs(boss, { application: h.app, clock: h.clock, log: () => {} });
    await boss.send(INVITE_EXPIRY_QUEUE, {});
    await expect.poll(async () => (await bo.viewMeetup(meetup.id))?.invite?.state, { timeout: 15_000 }).toBe("expired");
  } finally {
    await boss.stop({ graceful: true });
  }
});

test("the worker notices newly open Availability through the real queue", async () => {
  await h.app.bootstrap(ministryA);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", name: "Bo", email: "bo@example.test" });
  const input = {
    activityId: (await ana.meetupChoices()).activities[0]!.id, kind: "virtual" as const,
    startsAt: new Date("2026-09-18T10:00:00Z"), endsAt: new Date("2026-09-18T10:30:00Z"),
  };
  await ana.postAvailability(input);
  await bo.postAvailability(input);
  expect(await ana.inbox()).toEqual([]);
  h.clock.set(input.startsAt);
  const boss = new PgBoss({ connectionString: h.connectionString });
  await boss.start();
  try {
    await registerJobs(boss, { application: h.app, clock: h.clock, log: () => {} });
    await boss.send(AVAILABILITY_QUEUE, {});
    await expect.poll(async () => (await ana.inbox()).map((notice) => notice.kind), { timeout: 15_000 }).toEqual(["availability-overlap"]);
  } finally {
    await boss.stop({ graceful: true });
  }
});
