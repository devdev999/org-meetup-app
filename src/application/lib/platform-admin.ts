import { eq } from "drizzle-orm";
import { z } from "zod";
import { recordMemberActivity, requireActiveMember, type Actor } from "./actor";
import { auditTable, readAdminAudit, recordAdminView, type AdminAuditEntry } from "./admin-audit";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError } from "./errors";
import { tableCsv, type ReportCsv } from "./report-csv";
import { organisations } from "./schema";

export interface PlatformAdminActions {
  auditLog(): Promise<AdminAuditEntry[]>;
  exportAuditLog(): Promise<ReportCsv>;
}

const safeTableNames = new Set(["activation", "availability", "participation-departments", "participation-sites", "ratings", "rsvp-attendance",
  "shared-interests", "sought-interests", "telegram", "unmet-seeks", "waitlists", "weekly-occurrences",
  "member-profile", "member-counts", "member-connections", "member-availability", "member-interests", "member-flags", "member-attendance"]);

function safeFilters(filter: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(filter).filter(([key, value]) => {
    if (key === "from" || key === "to") return z.iso.date().safeParse(value).success;
    if (key === "table") return safeTableNames.has(value);
    if (key === "state") return value === "open" || value === "resolved";
    if (key === "placeKind") return value === "physical" || value === "virtual";
    if (key === "page") return /^(0|[1-9]\d{0,5})$/.test(value);
    return false;
  }));
}

export async function platformAdmin(deps: Deps, actor: Actor): Promise<PlatformAdminActions> {
  async function requirePlatformAdmin(db: Queryable) {
    if (!(await requireActiveMember(db, actor)).isPlatformAdmin) throw new AccessDeniedError();
  }
  await requirePlatformAdmin(deps.db);
  async function authorised<T>(operation: (db: Queryable) => Promise<T>): Promise<T> {
    return deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, actor.organisationId)).for("update");
      await requirePlatformAdmin(db);
      return operation(db);
    });
  }
  async function auditLog(db: Queryable) {
    return (await readAdminAudit(db)).map((entry) => ({ ...entry, filter: safeFilters(entry.filter) }));
  }
  return {
    auditLog: () => authorised(auditLog),
    exportAuditLog: () => authorised(async (db) => {
      const csv = tableCsv(auditTable(await auditLog(db)));
      await recordAdminView(db, actor, { action: "platform-audit-log-export", filter: {} }, deps.clock.now());
      await recordMemberActivity(db, actor, deps.clock.now());
      return csv;
    }),
  };
}
