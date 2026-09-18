import { randomBytes } from "node:crypto";
import { Pool } from "pg";

/**
 * Throw-away Postgres databases for tests. Each caller gets a database with a
 * random name on the server `TEST_DATABASE_URL` points at, and drops it with
 * `dispose`.
 */

export const TEST_ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5439/postgres";

export interface TestDatabase {
  pool: Pool;
  connectionString: string;
  dispose: () => Promise<void>;
}

/** A fresh, empty database. Not yet migrated. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = new Pool({ connectionString: TEST_ADMIN_URL, max: 1 });
  const name = `test_${randomBytes(6).toString("hex")}`;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } catch (error) {
    await admin.end();
    throw new Error(
      `Cannot create a test database at ${TEST_ADMIN_URL}. Start Postgres with "docker compose up -d postgres" or set TEST_DATABASE_URL.`,
      { cause: error },
    );
  }
  const url = new URL(TEST_ADMIN_URL);
  url.pathname = `/${name}`;
  const connectionString = url.toString();
  const pool = new Pool({ connectionString });
  const closedConnections: Promise<void>[] = [];
  pool.on("connect", (client) => {
    closedConnections.push(new Promise((resolve) => client.once("end", resolve)));
  });
  return {
    pool,
    connectionString,
    async dispose() {
      await pool.end();
      await Promise.all(closedConnections);
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
