import type { Actor } from "./actor";
import { and, eq } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { adminAuditEntries, members, organisations } from "./schema";
import type { ReportTable } from "./report-types";

export interface AdminView {
  action: string;
  filter: Record<string, string>;
}

export type AdminAuditEntry = Pick<typeof adminAuditEntries.$inferSelect,
  "id" | "actorMemberId" | "action" | "filter" | "createdAt" | "organisationId"> & { actorName: string; organisationName: string };

export function readAdminAudit(db: Queryable, organisationId?: string): Promise<AdminAuditEntry[]> {
  return db.select({ id: adminAuditEntries.id, actorMemberId: adminAuditEntries.actorMemberId,
    action: adminAuditEntries.action, filter: adminAuditEntries.filter, createdAt: adminAuditEntries.createdAt,
    actorName: members.name, organisationId: adminAuditEntries.organisationId, organisationName: organisations.name })
    .from(adminAuditEntries)
    .innerJoin(members, and(eq(members.id, adminAuditEntries.actorMemberId), eq(members.organisationId, adminAuditEntries.organisationId)))
    .innerJoin(organisations, eq(organisations.id, adminAuditEntries.organisationId))
    .where(organisationId ? eq(adminAuditEntries.organisationId, organisationId) : undefined)
    .orderBy(adminAuditEntries.createdAt, adminAuditEntries.id);
}

export function auditTable(entries: AdminAuditEntry[]): ReportTable {
  return { id: "audit-log", title: "Audit log", basis: "Recorded data access and exports. Times are UTC.",
    columns: ["Organisation", "Accessed by", "Actor Member ID", "Action", "Filters", "Time"],
    rows: entries.map((entry) => [entry.organisationName, entry.actorName, entry.actorMemberId, entry.action, JSON.stringify(entry.filter), entry.createdAt.toISOString()]) };
}

export async function recordAdminView(db: Queryable, actor: Actor, view: AdminView, now: Date): Promise<void> {
  await db.insert(adminAuditEntries).values({
    organisationId: actor.organisationId,
    actorMemberId: actor.memberId,
    action: view.action,
    filter: view.filter,
    createdAt: now,
  });
}
