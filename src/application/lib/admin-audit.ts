import type { Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import { adminAuditEntries } from "./schema";

export interface AdminView {
  action: string;
  filter: Record<string, string>;
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
