import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { ControllableClock } from "../../adapters/clock/controllable";
import { FakeIdentity } from "../../adapters/identity/fake";
import { runMigrations } from "../../db/migrate";
import { createTestDatabase } from "../../testing/test-database";
import { createApplication, type Application } from "../index";

/**
 * One real Postgres database per test file, created from scratch and migrated,
 * with the in-memory adapters wired in. Every test starts from empty tables.
 */
export interface Harness {
  app: Application;
  identity: FakeIdentity;
  clock: ControllableClock;
}

export const START_OF_TEST = new Date("2026-09-18T09:00:00.000Z");

/** Registers the per-file lifecycle and returns a harness populated before the first test. */
export function harness(): Harness {
  const h = {} as Harness;
  let pool: Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const database = await createTestDatabase();
    pool = database.pool;
    dispose = database.dispose;
    await runMigrations(pool);
    h.identity = new FakeIdentity();
    h.clock = new ControllableClock(START_OF_TEST);
    h.app = createApplication({ pool, identity: h.identity, clock: h.clock });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    h.clock.set(START_OF_TEST);
  });

  afterAll(async () => {
    await dispose();
  });

  return h;
}

async function truncateAll(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
