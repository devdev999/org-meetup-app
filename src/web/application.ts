import type { Pool } from "pg";
import type { Application } from "../application/index";
import { applicationFromEnv, connectPool } from "../config/wiring";

/**
 * The web process's one application instance. Kept on globalThis so that
 * Next.js hot reloading in development does not open a new pool per reload.
 */
const shared = globalThis as unknown as { __orgMeetupPool?: Pool; __orgMeetupApplication?: Application };

export function application(): Application {
  if (!shared.__orgMeetupApplication) {
    const pool = connectPool();
    shared.__orgMeetupPool = pool;
    shared.__orgMeetupApplication = applicationFromEnv(pool);
  }
  return shared.__orgMeetupApplication;
}
