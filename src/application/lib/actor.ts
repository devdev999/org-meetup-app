import { and, eq } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError } from "./errors";
import { members } from "./schema";

export interface Actor {
  memberId: string;
  organisationId: string;
}

export const VISIBLE_MEMBER_STATUSES: (typeof members.status.enumValues)[number][] = ["provisioned", "active"];

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
