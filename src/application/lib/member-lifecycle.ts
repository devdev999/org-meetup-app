import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { cancelOccurrence, firstName, meetupOrEvent, notify, promoteWaitlist, readGatherings } from "./meetups";
import { notifySeriesStopped } from "./recurring-meetups";
import { attendanceMembers, gatheringMembers, gatheringRsvps, gatherings, invites, members, noticeDeliveries, notices, organisations, recurrenceMembers, recurrences } from "./schema";

export async function reconcileMemberLifecycles(deps: Deps): Promise<void> {
  const inactive = inArray(members.status, ["departed", "suspended"]);
  const affected = await deps.db.selectDistinct({ organisationId: members.organisationId }).from(members).where(inactive);
  for (const { organisationId } of affected) {
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
      const current = await db.select({ id: members.id }).from(members).where(and(eq(members.organisationId, organisationId), inactive));
      await removeFromFutureOccurrences(db, organisationId, current.map((member) => member.id), deps.clock.now());
    });
  }
}

async function readOccurrences(db: Queryable, organisationId: string, rows: { id: string; hostMemberId: string }[], now: Date) {
  const occurrences = [];
  for (const [memberId, hosted] of Map.groupBy(rows, (row) => row.hostMemberId)) {
    occurrences.push(...await readGatherings(db, { organisationId, memberId }, hosted.map((row) => row.id), null, now));
  }
  return occurrences;
}

export async function removeFromFutureOccurrences(db: Queryable, organisationId: string, memberIds: string[], now: Date): Promise<string[]> {
  if (!memberIds.length) return [];
  const notified = new Set<string>();
  const stopped = await db.update(recurrences).set({ stoppedAt: now }).where(and(
    eq(recurrences.organisationId, organisationId), inArray(recurrences.hostMemberId, memberIds), isNull(recurrences.stoppedAt),
  )).returning({ id: recurrences.id, kind: recurrences.kind, endsOn: recurrences.endsOn });
  await db.delete(recurrenceMembers).where(and(eq(recurrenceMembers.organisationId, organisationId), inArray(recurrenceMembers.memberId, memberIds)));
  const future = and(eq(gatherings.organisationId, organisationId), gt(gatherings.startsAt, now));
  const hosted = await db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId, recurrenceId: gatherings.recurrenceId }).from(gatherings)
    .where(and(future, eq(gatherings.status, "scheduled"), inArray(gatherings.hostMemberId, memberIds)));
  for (const occurrence of await readOccurrences(db, organisationId, hosted, now)) {
    await cancelOccurrence(db, organisationId, occurrence, now, `This ${meetupOrEvent(occurrence)} was cancelled because its Host is no longer available.`);
    notified.add(occurrence.id);
  }
  const cancelledSeries = new Set(hosted.map((row) => row.recurrenceId));
  for (const series of stopped) {
    if (cancelledSeries.has(series.id) || series.endsOn && series.endsOn < now.toISOString().slice(0, 10)) continue;
    notified.add(await notifySeriesStopped(db, organisationId, series, now, `This recurring ${meetupOrEvent(series)} has stopped. No further occurrences will be created.`));
  }
  const futureIds = db.select({ id: gatherings.id }).from(gatherings).where(future);
  const removed = await db.delete(gatheringMembers).where(and(
    eq(gatheringMembers.organisationId, organisationId), inArray(gatheringMembers.memberId, memberIds), inArray(gatheringMembers.gatheringId, futureIds),
  )).returning({ gatheringId: gatheringMembers.gatheringId, memberId: gatheringMembers.memberId, status: gatheringMembers.status });
  await db.delete(gatheringRsvps).where(and(
    eq(gatheringRsvps.organisationId, organisationId), inArray(gatheringRsvps.memberId, memberIds), inArray(gatheringRsvps.gatheringId, futureIds),
  ));
  await db.delete(attendanceMembers).where(and(
    eq(attendanceMembers.organisationId, organisationId), inArray(attendanceMembers.memberId, memberIds), inArray(attendanceMembers.gatheringId, futureIds),
  ));
  await db.update(invites).set({ state: "expired" }).where(and(
    eq(invites.organisationId, organisationId), inArray(invites.memberId, memberIds), inArray(invites.gatheringId, futureIds), eq(invites.state, "pending"),
  ));
  await db.update(noticeDeliveries).set({ finishedAt: now }).where(and(
    eq(noticeDeliveries.organisationId, organisationId), isNull(noticeDeliveries.finishedAt),
    inArray(noticeDeliveries.noticeId, db.select({ id: notices.id }).from(notices)
      .where(and(eq(notices.organisationId, organisationId), inArray(notices.memberId, memberIds)))),
  ));
  const participants = removed.filter((row) => row.status === "participant");
  if (!participants.length) return [...notified];
  const names = new Map((await db.select({ id: members.id, name: members.name }).from(members)
    .where(and(eq(members.organisationId, organisationId), inArray(members.id, memberIds)))).map((member) => [member.id, member.name]));
  const byOccurrence = Map.groupBy(participants, (row) => row.gatheringId);
  const remaining = await db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId }).from(gatherings)
    .where(and(future, eq(gatherings.status, "scheduled"), inArray(gatherings.id, [...byOccurrence.keys()])));
  for (const occurrence of await readOccurrences(db, organisationId, remaining, now)) {
    for (const person of byOccurrence.get(occurrence.id)!) {
      await notify(db, organisationId, occurrence, [occurrence.host.memberId], "meetup-left", `${firstName(names.get(person.memberId)!)} left your ${meetupOrEvent(occurrence)}.`, now);
    }
    await promoteWaitlist(db, organisationId, occurrence, now);
    notified.add(occurrence.id);
  }
  return [...notified];
}
