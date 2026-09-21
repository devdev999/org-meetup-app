import type { PgBoss } from "pg-boss";
import { SystemClock } from "../adapters/clock/system";
import type { Application } from "../application/index";
import type { Clock } from "../application/ports";

/**
 * The worker's scheduled jobs. Each later ticket adds its own queue here
 * (recurrence generation, RSVP prompts, notice sending) and each handler
 * translates its job into one application call as the worker actor.
 */

export const HEARTBEAT_QUEUE = "heartbeat";
export const NOTICE_QUEUE = "notice-delivery";
export const DIGEST_QUEUE = "notice-digests";
export const INVITE_EXPIRY_QUEUE = "invite-expiry";
export const AVAILABILITY_QUEUE = "availability";
export const RECURRENCE_QUEUE = "recurrences";
export const ATTENDANCE_QUEUE = "attendance";
export const INTEREST_CLUSTERING_QUEUE = "interest-clustering";

/** Once a minute, so a running worker is visible in the logs. */
export const HEARTBEAT_CRON = "* * * * *";

export interface JobOptions {
  application?: Application;
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

  const application = options.application;
  if (application) {
    await boss.createQueue(INTEREST_CLUSTERING_QUEUE);
    await boss.schedule(INTEREST_CLUSTERING_QUEUE, "0 2 * * *", {}, { tz: "UTC" });
    await boss.work(INTEREST_CLUSTERING_QUEUE, async () => { await application.processInterestMerges(); });
    for (const [queue, run] of [
      [NOTICE_QUEUE, () => application.deliverNotices()],
      [DIGEST_QUEUE, () => application.sendDailyDigests()],
      [INVITE_EXPIRY_QUEUE, () => application.expireInvites()],
      [AVAILABILITY_QUEUE, () => application.processAvailability()],
      [RECURRENCE_QUEUE, () => application.processRecurrences()],
      [ATTENDANCE_QUEUE, () => application.processAttendance()],
    ] as const) {
      await boss.createQueue(queue);
      await boss.schedule(queue, "* * * * *");
      await boss.work(queue, async () => { await run(); });
    }
  }
}
