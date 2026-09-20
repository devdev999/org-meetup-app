import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ensureDepartment, ensureSite, nameKey, type Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { removeFromFutureOccurrences } from "./member-lifecycle";
import { departments, members, sites } from "./schema";

export interface RosterRow {
  email: string;
  name: string;
  department: string | null;
  site: string | null;
  staffIdentifier?: string | null;
}

export interface RosterMember extends RosterRow {
  memberId: string;
  status: (typeof members.status.enumValues)[number];
  staffIdentifier: string | null;
}

export interface RosterPreview {
  additions: RosterRow[];
  changes: { before: RosterMember; after: RosterRow & { status: RosterMember["status"] } }[];
  departures: RosterMember[];
  revision: string;
}

const nullableText = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable();
const rosterRows = z.array(
  z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    name: z.string().trim().min(1),
    department: nullableText,
    site: nullableText,
    staffIdentifier: nullableText.optional().default(null),
  }),
);

export async function previewRoster(db: Queryable, organisationId: string, input: RosterRow[]): Promise<RosterPreview> {
  const parsed = rosterRows.safeParse(input);
  if (!parsed.success)
    throw new InvalidInputError(
      "invalid-roster",
      "each roster row needs a valid email and name, Department and Site columns",
    );
  const rows = parsed.data.sort((a, b) => a.email.localeCompare(b.email));
  if (new Set(rows.map((row) => row.email)).size !== rows.length) {
    throw new InvalidInputError("invalid-roster", "each email must appear only once in the roster");
  }
  for (const [field, table] of [
    ["department", departments],
    ["site", sites],
  ] as const) {
    const choices = await db
      .select({ name: table.name, key: table.nameKey })
      .from(table)
      .where(eq(table.organisationId, organisationId));
    const names = new Map(choices.map((choice) => [choice.key, choice.name]));
    for (const row of rows) {
      const value = row[field];
      if (value === null) continue;
      const key = nameKey(value);
      if (!names.has(key)) names.set(key, value);
      row[field] = names.get(key)!;
    }
  }
  const existing = await readRoster(db, organisationId);
  const byEmail = new Map(existing.map((member) => [member.email, member]));
  const emails = new Set(rows.map((row) => row.email));
  const changes = rows.flatMap((row) => {
    const before = byEmail.get(row.email);
    if (!before) return [];
    const changed =
      before.status === "departed" ||
      before.name !== row.name ||
      before.department !== row.department ||
      before.site !== row.site ||
      before.staffIdentifier !== row.staffIdentifier;
    const status: RosterMember["status"] = before.status === "departed" ? "provisioned" : before.status;
    return changed ? [{ before, after: { ...row, status } }] : [];
  });
  return {
    additions: rows.filter((row) => !byEmail.has(row.email)),
    changes,
    departures: existing.filter((member) => member.status !== "departed" && !emails.has(member.email)),
    revision: createHash("sha256").update(JSON.stringify({ organisationId, rows, existing })).digest("hex"),
  };
}

export async function commitRoster(
  db: Queryable,
  organisationId: string,
  rows: RosterRow[],
  revision: string,
  now: Date,
): Promise<string[]> {
  await db.select({ id: members.id }).from(members).where(eq(members.organisationId, organisationId)).for("update");
  const preview = await previewRoster(db, organisationId, rows);
  if (preview.revision !== revision) {
    throw new InvalidInputError(
      "stale-roster",
      "the roster changed since this preview; upload it again to review the current changes",
    );
  }
  for (const row of preview.additions) {
    await db.insert(members).values({
      ...(await rosterFields(db, organisationId, row, now)),
      organisationId,
      email: row.email,
      status: "provisioned",
      createdAt: now,
    });
  }
  for (const { before, after } of preview.changes) {
    await db
      .update(members)
      .set({
        ...(await rosterFields(db, organisationId, after, now)),
        status: after.status,
      })
      .where(and(eq(members.organisationId, organisationId), eq(members.id, before.memberId)));
  }
  if (preview.departures.length > 0) {
    await db
      .update(members)
      .set({ status: "departed", statusBeforeSuspension: null, updatedAt: now })
      .where(
        and(
          eq(members.organisationId, organisationId),
          inArray(
            members.id,
            preview.departures.map((member) => member.memberId),
          ),
        ),
      );
    return removeFromFutureOccurrences(db, organisationId, preview.departures.map((member) => member.memberId), now);
  }
  return [];
}

async function rosterFields(db: Queryable, organisationId: string, row: RosterRow, now: Date) {
  return {
    name: row.name,
    staffIdentifier: row.staffIdentifier,
    departmentId: row.department === null ? null : await ensureDepartment(db, organisationId, row.department, now),
    siteId: row.site === null ? null : await ensureSite(db, organisationId, row.site, now),
    updatedAt: now,
  };
}

export function readRoster(db: Queryable, organisationId: string): Promise<RosterMember[]> {
  return db
    .select({
      memberId: members.id,
      email: members.email,
      name: members.name,
      status: members.status,
      department: departments.name,
      site: sites.name,
      staffIdentifier: members.staffIdentifier,
    })
    .from(members)
    .leftJoin(
      departments,
      and(eq(departments.id, members.departmentId), eq(departments.organisationId, members.organisationId)),
    )
    .leftJoin(sites, and(eq(sites.id, members.siteId), eq(sites.organisationId, members.organisationId)))
    .where(eq(members.organisationId, organisationId))
    .orderBy(members.email);
}
