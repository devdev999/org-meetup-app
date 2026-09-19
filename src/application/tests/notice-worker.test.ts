import { PgBoss } from "pg-boss";
import { expect, test } from "vitest";
import { DIGEST_QUEUE, registerJobs } from "../../worker/jobs";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

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
  await ana.editMeetup(meetup.id, { ...meetup, startsAt: new Date("2026-09-18T11:00:00Z") });
  h.clock.set(new Date("2026-09-19T09:00:00Z"));

  const boss = new PgBoss({ connectionString: h.connectionString });
  await boss.start();
  try {
    await registerJobs(boss, { application: h.app, clock: h.clock, log: () => {} });
    await boss.send(DIGEST_QUEUE, {});
    await expect.poll(() => h.email.outbox, { timeout: 15_000 }).toEqual([
      expect.objectContaining({ to: "bo@example.test", subject: "Daily Meetup digest" }),
    ]);
  } finally {
    await boss.stop({ graceful: true });
  }
});
