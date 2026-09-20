import { and, eq, sql } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError } from "./errors";
import { members, organisations } from "./schema";

export interface Actor {
  memberId: string;
  organisationId: string;
}

export const VISIBLE_MEMBER_STATUSES: (typeof members.status.enumValues)[number][] = ["provisioned", "active"];

export async function withActiveMember<T>(deps: Deps, actor: Actor, operation: (db: Queryable, member: typeof members.$inferSelect) => Promise<T>, requireNotice = true): Promise<T> {
  return deps.db.transaction(async (db) => {
    await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, actor.organisationId)).for("update");
    const member = await requireActiveMember(db, actor, requireNotice);
    const result = await operation(db, member);
    await recordMemberActivity(db, actor, deps.clock.now());
    return result;
  });
}

export async function recordMemberActivity(db: Queryable, actor: Actor, now: Date): Promise<void> {
  await db.update(members).set({ lastActivityAt: sql`greatest(${members.lastActivityAt}, ${now.toISOString()}::timestamptz)` })
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, actor.memberId)));
}

export async function requireActiveMember(db: Queryable, actor: Actor, requireNotice = true) {
  const [member] = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, actor.memberId),
        eq(members.organisationId, actor.organisationId),
        eq(members.status, "active"),
      ),
    )
    .limit(1);
  if (!member) throw new AccessDeniedError();
  if (requireNotice && member.adminVisibilityNoticeAcknowledgedAt === null) {
    throw new AdminVisibilityNoticeRequiredError();
  }
  return member;
}
