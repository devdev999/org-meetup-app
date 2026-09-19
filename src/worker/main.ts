/**
 * The worker process: runs scheduled and queued jobs from pg-boss, whose
 * queue lives in Postgres (ADR 0005). One instance is enough; several share
 * the work safely.
 */
import { PgBoss } from "pg-boss";
import { databaseUrl } from "../config/env";
import { applicationFromEnv, connectPool } from "../config/wiring";
import { registerJobs } from "./jobs";

const boss = new PgBoss({ connectionString: databaseUrl() });
const pool = connectPool();
boss.on("error", (error) => console.error("worker: queue error", error));

await boss.start();
await registerJobs(boss, { application: applicationFromEnv(pool) });
console.log("worker: started, heartbeat and notice jobs scheduled every minute");

async function shutdown(signal: string): Promise<void> {
  console.log(`worker: ${signal} received, stopping`);
  await boss.stop({ graceful: true, timeout: 10_000 });
  await pool.end();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
