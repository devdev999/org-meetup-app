import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { applicationFromEnv } from "../../src/config/wiring";
import { runMigrations } from "../../src/db/migrate";
import { createTestDatabase } from "../../src/testing/test-database";
import { seedAttendance } from "./attendance-fixture";
import { organisationSetup } from "../../src/testing/organisation-setup";

const database = await createTestDatabase();
try {
  await cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
  });
  await cp("public", ".next/standalone/public", { recursive: true });
  Object.assign(process.env, {
    DATABASE_URL: database.connectionString,
    APP_URL: "http://127.0.0.1:3011",
    SESSION_SECRET: "browser-smoke-test-local-session-secret",
    IDENTITY_PROVIDER: "fake",
    ALLOW_FAKE_IDENTITY: "yes",
    AI_PROVIDER: "memory",
    TELEGRAM_PROVIDER: "memory",
    EMAIL_PROVIDER: "memory",
    EMAIL_FROM: "browser-notices@example.test",
    TIME_ZONE: "UTC",
  });
  await runMigrations(database.pool);
  await organisationSetup({
    app: applicationFromEnv(database.pool),
  }).setupOrganisation({
    organisation: {
      slug: "ministry-a",
      name: "Ministry A",
      departments: ["Finance", "Legal"],
      sites: ["Harbour House"],
    },
    oidc: {
      issuer: `${process.env.APP_URL}/dev-idp`,
      clientId: "browser-smoke",
      credentialRef: null,
      claimMapping: {
        email: "email",
        name: "name",
        department: "department",
        site: "site",
      },
    },
    platformAdmin: { email: "pat@ministry-a.example", name: "Pat Platform" },
    organisationAdmin: {
      email: "olivia@ministry-a.example",
      name: "Olivia Admin",
    },
  });
  process.env.ATTENDANCE_FIXTURES = JSON.stringify(
    await seedAttendance(database.pool, process.env.APP_URL!),
  );
  const require = createRequire(import.meta.url);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    const runner = spawn(
      process.execPath,
      [
        require.resolve("@playwright/test/cli"),
        "test",
        ...process.argv.slice(2),
      ],
      {
        stdio: "inherit",
        windowsHide: true,
      },
    );
    runner.once("error", reject);
    runner.once("close", (code) => resolve(code ?? 1));
  });
} finally {
  await database.dispose();
}
