import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Applies every migration under `drizzle/` that the database has not seen yet. */
export async function runMigrations(pool: Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder });
}
