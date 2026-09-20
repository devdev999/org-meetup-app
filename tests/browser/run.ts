import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { applicationFromEnv } from "../../src/config/wiring";
import { runMigrations } from "../../src/db/migrate";
import { createTestDatabase } from "../../src/testing/test-database";

const database = await createTestDatabase();
try {
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  Object.assign(process.env, {
    DATABASE_URL: database.connectionString,
    APP_URL: "http://127.0.0.1:3011",
    SESSION_SECRET: "browser-smoke-test-local-session-secret",
    IDENTITY_PROVIDER: "fake",
    ALLOW_FAKE_IDENTITY: "yes",
    AI_PROVIDER: "memory",
    TELEGRAM_PROVIDER: "memory",
    EMAIL_PROVIDER: "memory",
  });
  await runMigrations(database.pool);
  await applicationFromEnv(database.pool).bootstrap({
    organisation: { slug: "ministry-a", name: "Ministry A", departments: ["Finance", "Legal"], sites: ["Harbour House"] },
    oidc: {
      issuer: `${process.env.APP_URL}/dev-idp`, clientId: "browser-smoke", clientSecret: null,
      claimMapping: { email: "email", name: "name", department: "department", site: "site" },
    },
    platformAdmin: { email: "pat@ministry-a.example", name: "Pat Platform" },
    organisationAdmin: { email: "olivia@ministry-a.example", name: "Olivia Admin" },
  });
  const require = createRequire(import.meta.url);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    const runner = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)], {
      stdio: "inherit", windowsHide: true,
    });
    runner.once("error", reject);
    runner.once("close", (code) => resolve(code ?? 1));
  });
} finally {
  await database.dispose();
}
