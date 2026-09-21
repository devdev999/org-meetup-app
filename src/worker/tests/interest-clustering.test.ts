import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryAi } from "../../adapters/ai/memory";
import { ControllableClock } from "../../adapters/clock/controllable";
import { MemoryEmail } from "../../adapters/email/memory";
import { FakeIdentity } from "../../adapters/identity/fake";
import { MemoryTelegram } from "../../adapters/telegram/memory";
import { createApplication, type OrganisationAdminActions } from "../../application";
import { runMigrations } from "../../db/migrate";
import { organisationSetup, signInAndAcknowledgeAs } from "../../testing/organisation-setup";
import { createTestDatabase, type TestDatabase } from "../../testing/test-database";
import { INTEREST_CLUSTERING_QUEUE, registerJobs } from "../jobs";

let database: TestDatabase;
let boss: PgBoss;
let admin: OrganisationAdminActions;

beforeAll(async () => {
  database = await createTestDatabase();
  await runMigrations(database.pool);
  const app = createApplication({ pool: database.pool, identity: new FakeIdentity(), ai: new MemoryAi(),
    clock: new ControllableClock(new Date("2026-09-18T09:00:00Z")), telegram: new MemoryTelegram(), email: new MemoryEmail() });
  const setup = organisationSetup({ app });
  await setup.setupOrganisation({ organisation: { slug: "ministry-a", name: "Ministry A" },
    oidc: { issuer: "https://issuer.example", clientId: "worker", credentialRef: null, claimMapping: { email: "email", name: "name" } },
    platformAdmin: { email: "pat@example.test", name: "Pat" }, organisationAdmin: { email: "olivia@example.test", name: "Olivia" },
  });
  const member = await signInAndAcknowledgeAs({ app }, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  await member.confirmInterest({ phrase: "Structured query language", selection: { name: "Structured query language", kind: "skill" }, stance: "shares" });
  admin = await setup.organisationAdmin();
  boss = new PgBoss({ connectionString: database.connectionString });
  await boss.start();
  await registerJobs(boss, { application: app, log: () => {} });
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await database?.dispose();
});

test("the daily clustering queue runs through the application and produces an Organisation Admin proposal", async () => {
  expect(await boss.getSchedules(INTEREST_CLUSTERING_QUEUE)).toMatchObject([{ cron: "0 2 * * *", timezone: "UTC" }]);
  await boss.send(INTEREST_CLUSTERING_QUEUE, {});
  await expect.poll(() => admin.interestMergeProposals(), { timeout: 15_000 }).toHaveLength(1);
  expect((await admin.interestMergeProposals())[0]?.interests.map(({ name }) => name)).toEqual(["SQL", "Structured query language"]);
});
