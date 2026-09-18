import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function connectDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, casing: "snake_case" });
}

/** Emails are compared case-insensitively, so they are stored in one case. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
