import { and, eq } from "drizzle-orm";
import type { Database } from "./db";
import { departments, sites } from "./schema";

/** A transaction or the database itself; both run the same queries. */
export type Queryable = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

type NamedTable = typeof departments | typeof sites;

/** Trimmed and lower-cased, the form two names are compared in. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Returns the id of the Department with this name in the Organisation, creating it if needed. */
export function ensureDepartment(q: Queryable, organisationId: string, name: string, now: Date): Promise<string> {
  return ensureNamed(q, departments, organisationId, name, now);
}

/** Returns the id of the Site with this name in the Organisation, creating it if needed. */
export function ensureSite(q: Queryable, organisationId: string, name: string, now: Date): Promise<string> {
  return ensureNamed(q, sites, organisationId, name, now);
}

async function ensureNamed(q: Queryable, table: NamedTable, organisationId: string, name: string, now: Date): Promise<string> {
  const key = nameKey(name);
  const [inserted] = await q
    .insert(table)
    .values({ organisationId, name: name.trim(), nameKey: key, createdAt: now })
    .onConflictDoNothing({ target: [table.organisationId, table.nameKey] })
    .returning({ id: table.id });
  if (inserted) return inserted.id;
  const [existing] = await q
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.organisationId, organisationId), eq(table.nameKey, key)))
    .limit(1);
  if (!existing) throw new Error(`ensureNamed: "${name}" neither inserted nor found`);
  return existing.id;
}

/** Department and Site names of one Organisation, each list in name order. */
export async function listDepartmentsAndSites(
  q: Queryable,
  organisationId: string,
): Promise<{ departments: string[]; sites: string[] }> {
  const [departmentRows, siteRows] = await Promise.all([
    q.select({ name: departments.name }).from(departments).where(eq(departments.organisationId, organisationId)).orderBy(departments.name),
    q.select({ name: sites.name }).from(sites).where(eq(sites.organisationId, organisationId)).orderBy(sites.name),
  ]);
  return { departments: departmentRows.map((row) => row.name), sites: siteRows.map((row) => row.name) };
}
