import type { PgBoss } from "pg-boss";
import { SystemClock } from "../adapters/clock/system";
import type { Clock } from "../application/ports";

/**
 * The worker's scheduled jobs. Each later ticket adds its own queue here
 * (recurrence generation, RSVP prompts, notice sending) and each handler
 * translates its job into one application call as the worker actor.
 */

export const HEARTBEAT_QUEUE = "heartbeat";

/** Once a minute, so a running worker is visible in the logs. */
export const HEARTBEAT_CRON = "* * * * *";

export interface JobOptions {
  log?: (line: string) => void;
  clock?: Clock;
}

export async function registerJobs(boss: PgBoss, options: JobOptions = {}): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const clock = options.clock ?? new SystemClock();

  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, HEARTBEAT_CRON);
  await boss.work(HEARTBEAT_QUEUE, async (jobs) => {
    for (const job of jobs) {
      log(`worker: heartbeat ${job.id} at ${clock.now().toISOString()}`);
    }
  });
}
