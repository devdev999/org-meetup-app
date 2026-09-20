import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { cancelOccurrence, meetupOrEvent, promoteWaitlist, readGathering } from "./meetups";
import { gatheringMembers, gatheringRsvps, gatherings, invites, noticeDeliveries, notices, recurrenceMembers, recurrences } from "./schema";

export async function removeFromFutureOccurrences(db: Queryable, organisationId: string, memberIds: string[], now: Date): Promise<void> {
  if (!memberIds.length) return;
  await db.update(recurrences).set({ stoppedAt: now }).where(and(
    eq(recurrences.organisationId, organisationId), inArray(recurrences.hostMemberId, memberIds), isNull(recurrences.stoppedAt),
  ));
  await db.delete(recurrenceMembers).where(and(eq(recurrenceMembers.organisationId, organisationId), inArray(recurrenceMembers.memberId, memberIds)));
  const future = and(eq(gatherings.organisationId, organisationId), gt(gatherings.startsAt, now));
  const hosted = await db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId }).from(gatherings)
    .where(and(future, eq(gatherings.status, "scheduled"), inArray(gatherings.hostMemberId, memberIds)));
  for (const row of hosted) {
    const occurrence = (await readGathering(db, { organisationId, memberId: row.hostMemberId }, row.id, null, now))!;
    await cancelOccurrence(db, organisationId, occurrence, now, `This ${meetupOrEvent(occurrence)} was cancelled because its Host is no longer available.`);
  }
  const futureIds = db.select({ id: gatherings.id }).from(gatherings).where(future);
  const removed = await db.delete(gatheringMembers).where(and(
    eq(gatheringMembers.organisationId, organisationId), inArray(gatheringMembers.memberId, memberIds), inArray(gatheringMembers.gatheringId, futureIds),
  )).returning({ gatheringId: gatheringMembers.gatheringId });
  await db.delete(gatheringRsvps).where(and(
    eq(gatheringRsvps.organisationId, organisationId), inArray(gatheringRsvps.memberId, memberIds), inArray(gatheringRsvps.gatheringId, futureIds),
  ));
  await db.update(invites).set({ state: "expired" }).where(and(
    eq(invites.organisationId, organisationId), inArray(invites.memberId, memberIds), inArray(invites.gatheringId, futureIds), eq(invites.state, "pending"),
  ));
  await db.update(noticeDeliveries).set({ finishedAt: now }).where(and(
    eq(noticeDeliveries.organisationId, organisationId), isNull(noticeDeliveries.finishedAt),
    inArray(noticeDeliveries.noticeId, db.select({ id: notices.id }).from(notices)
      .where(and(eq(notices.organisationId, organisationId), inArray(notices.memberId, memberIds)))),
  ));
  if (!removed.length) return;
  const remaining = await db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId }).from(gatherings)
    .where(and(future, eq(gatherings.status, "scheduled"), inArray(gatherings.id, [...new Set(removed.map((row) => row.gatheringId))])));
  for (const row of remaining) {
    const occurrence = (await readGathering(db, { organisationId, memberId: row.hostMemberId }, row.id, null, now))!;
    await promoteWaitlist(db, organisationId, occurrence, now);
  }
}
