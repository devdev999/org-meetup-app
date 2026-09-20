/**
 * One-shot database setup: apply migrations, then seed from configuration.
 * Runs before the web and worker processes start (see compose.yaml) and is
 * safe to run again.
 */
import { bootstrapConfig } from "../config/env";
import { applicationFromEnv, connectPool } from "../config/wiring";
import { runMigrations } from "./migrate";

const pool = connectPool();
try {
  await runMigrations(pool);
  console.log("setup: migrations applied");

  const application = applicationFromEnv(pool);
  await application.reconcileMemberLifecycles();
  console.log("setup: inactive Member lifecycle cleanup complete");

  const config = bootstrapConfig();
  if (config) {
    await application.bootstrap(config);
    console.log(`setup: Organisation "${config.organisation.slug}" and its Platform Admin are in place`);
  } else {
    console.log("setup: no BOOTSTRAP_ variables set, nothing seeded");
  }
} finally {
  await pool.end();
}
