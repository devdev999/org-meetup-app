import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ControllableClock } from "../../adapters/clock/controllable";
import { createTestDatabase, type TestDatabase } from "../../testing/test-database";
import { HEARTBEAT_QUEUE, registerJobs } from "../jobs";

/**
 * Wiring smoke test: one job execution through the real queue in Postgres.
 * The cron schedule itself is pg-boss's; this proves the worker's queue,
 * schedule and handler are registered and a heartbeat runs end to end.
 */

let database: TestDatabase;
let boss: PgBoss;

beforeAll(async () => {
  database = await createTestDatabase();
  boss = new PgBoss({ connectionString: database.connectionString });
  await boss.start();
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await database.dispose();
});

test("a heartbeat put on the queue is executed by the worker, stamped by the clock", async () => {
  const beats: string[] = [];
  const clock = new ControllableClock(new Date("2026-09-18T09:00:00.000Z"));
  await registerJobs(boss, { log: (line) => beats.push(line), clock });

  const jobId = await boss.send(HEARTBEAT_QUEUE, {});

  await until(() => beats.some((line) => line.includes(String(jobId))), 15_000);
  expect(beats.find((line) => line.includes(String(jobId)))).toBe(
    `worker: heartbeat ${jobId} at 2026-09-18T09:00:00.000Z`,
  );
});

async function until(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the heartbeat to run");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
