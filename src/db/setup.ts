/**
 * One-shot database setup: migrate, clean up inactive Members and initialize the first Platform Admin.
 * Runs before the web and worker processes start (see compose.yaml) and is
 * safe to run again.
 */
import { firstPlatformAdminConfig } from "../config/env";
import { applicationFromEnv, connectPool } from "../config/wiring";
import { runMigrations } from "./migrate";

const pool = connectPool();
try {
  await runMigrations(pool);
  console.log("setup: migrations applied");

  const application = applicationFromEnv(pool);
  await application.initializeDeploymentSettings();
  await application.reconcileMemberLifecycles();
  console.log("setup: inactive Member lifecycle cleanup complete");

  const config = firstPlatformAdminConfig();
  if (config) {
    await application.initializePlatform(config);
    console.log("setup: first Platform Admin initialization complete");
  } else {
    console.log("setup: no first Platform Admin configuration supplied");
  }
} finally {
  await pool.end();
}
