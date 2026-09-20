import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { RecurrenceRule } from "./recurrence-rule";
import { gatherings, invites, members, recurrenceMembers, recurrences } from "./schema";

export type RecurrenceInput = Pick<RecurrenceRule, "frequency" | "endsOn">;
export interface Recurrence extends RecurrenceRule {
  id: string;
  host: { memberId: string; name: string };
  capacity: number;
  standingCount: number;
  isStanding: boolean;
  canJoin: boolean;
  stopped: boolean;
}

export const recurrenceSchema = z.object({
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  endsOn: z.iso.date().nullable().optional(),
});

export function visibleRecurrences(actor: Actor, siteId: string | null) {
  return and(eq(recurrences.organisationId, actor.organisationId), eq(recurrences.kind, "meetup"), or(
    eq(recurrences.hostMemberId, actor.memberId),
    sql`exists (select 1 from ${recurrenceMembers} where ${recurrenceMembers.organisationId} = ${recurrences.organisationId} and ${recurrenceMembers.recurrenceId} = ${recurrences.id} and ${recurrenceMembers.memberId} = ${actor.memberId})`,
    and(eq(recurrences.audienceKind, "open"), or(eq(recurrences.audienceScope, "organisation"), siteId ? eq(recurrences.audienceSiteId, siteId) : undefined)),
    sql`exists (select 1 from ${invites} inner join ${gatherings} on ${gatherings.organisationId} = ${invites.organisationId} and ${gatherings.id} = ${invites.gatheringId} where ${gatherings.organisationId} = ${recurrences.organisationId} and ${gatherings.recurrenceId} = ${recurrences.id} and ${invites.memberId} = ${actor.memberId} and ${invites.state} = 'accepted')`,
  ));
}

export async function readRecurrences(db: Queryable, actor: Actor, ids: string[], siteId: string | null): Promise<Map<string, Recurrence>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ recurrence: recurrences, hostName: members.name, canJoin: sql<boolean>`${visibleRecurrences(actor, siteId)}` }).from(recurrences)
    .innerJoin(members, and(eq(members.organisationId, recurrences.organisationId), eq(members.id, recurrences.hostMemberId)))
    .where(and(eq(recurrences.organisationId, actor.organisationId), inArray(recurrences.id, ids)));
  const standing = await db.select({ recurrenceId: recurrenceMembers.recurrenceId, memberId: recurrenceMembers.memberId }).from(recurrenceMembers)
    .where(and(eq(recurrenceMembers.organisationId, actor.organisationId), inArray(recurrenceMembers.recurrenceId, ids)));
  const byRecurrence = Map.groupBy(standing, (member) => member.recurrenceId);
  return new Map(rows.map(({ recurrence, hostName, canJoin }) => [recurrence.id, {
    id: recurrence.id, frequency: recurrence.frequency, startsAt: recurrence.startsAt, endsOn: recurrence.endsOn,
    host: { memberId: recurrence.hostMemberId, name: hostName }, capacity: recurrence.capacity,
    standingCount: byRecurrence.get(recurrence.id)?.length ?? 0,
    isStanding: byRecurrence.get(recurrence.id)?.some((member) => member.memberId === actor.memberId) ?? false,
    canJoin,
    stopped: recurrence.stoppedAt !== null,
  }]));
}
