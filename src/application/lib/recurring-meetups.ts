import { and, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { cancelOccurrence, meetupOrEvent, notify, readGatherings, releasePlace, requireScheduledGathering, takePlace, type GatheringKind, type RsvpAnswer } from "./meetups";
import { readRecurrences, recurrencesWithFutureWork, saveRsvp, visibleRecurrences, type Recurrence } from "./recurrence-records";
import { expandRecurrence } from "./recurrence-rule";
import { supersedeDeliveries } from "./notifications";
import { activities, gatheringInterests, gatheringMembers, gatheringRsvps, gatherings, members, organisations, recurrenceInterests, recurrenceMembers, recurrences } from "./schema";

export interface RecurringMeetup extends Recurrence { kind: "meetup"; activity: { id: string; name: string } }
export interface RecurringEvent extends Recurrence { kind: "event"; activity: { id: string; name: string } }

export async function listSeries(deps: Deps, actor: Actor, kind: GatheringKind = "meetup"): Promise<(RecurringMeetup | RecurringEvent)[]> {
  const current = await requireActiveMember(deps.db, actor);
  const now = deps.clock.now();
  const rows = await deps.db.select({ id: recurrences.id, activity: { id: activities.id, name: activities.name } }).from(recurrences)
    .innerJoin(activities, and(eq(activities.organisationId, recurrences.organisationId), eq(activities.id, recurrences.activityId)))
    .where(and(visibleRecurrences(actor, current.siteId, kind), isNull(recurrences.stoppedAt), recurrencesWithFutureWork(deps.db, now)))
    .orderBy(recurrences.startsAt, recurrences.id);
  const series = await readRecurrences(deps.db, actor, rows.map(({ id }) => id), current.siteId, now);
  return rows.map(({ id, activity }) => ({ ...series.get(id)!, activity }));
}

async function requireSeries(db: Queryable, actor: Actor, id: string, siteId: string | null) {
  if (!isUuid(id)) throw new AccessDeniedError();
  const [series] = await db.select().from(recurrences).where(and(eq(recurrences.id, id), visibleRecurrences(actor, siteId)));
  if (!series) throw new AccessDeniedError();
  return series;
}

async function futureOccurrences(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date) {
  const rows = await db.select({ id: gatherings.id }).from(gatherings)
    .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.recurrenceId, id), gt(gatherings.startsAt, now)));
  return readGatherings(db, actor, rows.map((row) => row.id), siteId, now);
}

export async function joinSeries(deps: Deps, actor: Actor, id: string): Promise<string[]> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const series = await requireSeries(db, actor, id, current.siteId);
    if (series.stoppedAt || series.endsOn && now > new Date(`${series.endsOn}T23:59:59.999Z`)) throw new InvalidInputError("invalid-meetup", "This series has ended.");
    const standing = await db.select({ memberId: recurrenceMembers.memberId }).from(recurrenceMembers)
      .where(and(eq(recurrenceMembers.organisationId, actor.organisationId), eq(recurrenceMembers.recurrenceId, id)));
    if (standing.some(({ memberId }) => memberId === actor.memberId)) return [];
    if (series.capacity !== null && standing.length >= series.capacity) throw new InvalidInputError("invalid-meetup", "This series has no standing places left.");
    await db.insert(recurrenceMembers).values({ organisationId: actor.organisationId, recurrenceId: id, memberId: actor.memberId });
    const occurrences = (await futureOccurrences(db, actor, id, current.siteId, now)).filter((gathering) => gathering.canChange);
    for (const gathering of occurrences) {
      await takePlace(db, actor.organisationId, gathering, current, now);
      await saveRsvp(db, actor, gathering.id, gathering.rsvp === "going" ? "going" : null);
    }
    return occurrences.map((gathering) => gathering.id);
  });
}

export async function leaveSeries(deps: Deps, actor: Actor, id: string): Promise<string[]> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const series = await requireSeries(db, actor, id, current.siteId);
    if (series.hostMemberId === actor.memberId) throw new InvalidInputError("invalid-meetup", "Stop your series to leave it.");
    const [standing] = await db.select({ memberId: recurrenceMembers.memberId }).from(recurrenceMembers)
      .where(and(eq(recurrenceMembers.organisationId, actor.organisationId), eq(recurrenceMembers.recurrenceId, id), eq(recurrenceMembers.memberId, actor.memberId)));
    if (!standing) return [];
    const occurrences = await futureOccurrences(db, actor, id, current.siteId, now);
    await db.delete(recurrenceMembers).where(and(eq(recurrenceMembers.organisationId, actor.organisationId), eq(recurrenceMembers.recurrenceId, id), eq(recurrenceMembers.memberId, actor.memberId)));
    for (const gathering of occurrences) {
      await supersedeDeliveries(db, actor.organisationId, gathering.id, "rsvp-prompt", now, actor.memberId);
      await releasePlace(db, actor.organisationId, gathering, current, now);
      await db.delete(gatheringRsvps).where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, gathering.id), eq(gatheringRsvps.memberId, actor.memberId)));
    }
    return occurrences.map((gathering) => gathering.id);
  });
}

export async function stopSeries(deps: Deps, actor: Actor, id: string): Promise<string[]> {
  return withActiveMember(deps, actor, async (db, current) => {
    const series = await requireSeries(db, actor, id, current.siteId);
    if (series.hostMemberId !== actor.memberId) throw new AccessDeniedError();
    if (series.stoppedAt) return [];
    const now = deps.clock.now();
    await db.update(recurrences).set({ stoppedAt: now }).where(and(eq(recurrences.organisationId, actor.organisationId), eq(recurrences.id, id)));
    const occurrences = (await futureOccurrences(db, actor, id, current.siteId, now)).filter((gathering) => gathering.canChange);
    for (const gathering of occurrences) await cancelOccurrence(db, actor.organisationId, gathering, now);
    if (!occurrences.length) {
      return [await notifySeriesStopped(db, actor.organisationId, series, now, `The Host stopped this recurring ${meetupOrEvent(series)}. Future occurrences will not run.`)];
    }
    return occurrences.map((gathering) => gathering.id);
  });
}

export async function notifySeriesStopped(db: Queryable, organisationId: string, series: { id: string; kind: GatheringKind }, now: Date, message: string): Promise<string> {
  const [first] = await db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId }).from(gatherings)
    .where(and(eq(gatherings.organisationId, organisationId), eq(gatherings.recurrenceId, series.id)))
    .orderBy(gatherings.scheduledStartsAt).limit(1);
  const [gathering] = await readGatherings(db, { organisationId, memberId: first!.hostMemberId }, [first!.id], null, now);
  const standing = await db.select({ memberId: recurrenceMembers.memberId }).from(recurrenceMembers)
    .where(and(eq(recurrenceMembers.organisationId, organisationId), eq(recurrenceMembers.recurrenceId, series.id)));
  await notify(db, organisationId, gathering!, standing.map(({ memberId }) => memberId), "meetup-cancelled", message, now);
  return first!.id;
}

export async function answerRsvp(deps: Deps, actor: Actor, id: string, answer: RsvpAnswer, kind?: GatheringKind): Promise<"participant" | "waitlisted" | null> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    if (answer !== "going" && answer !== "not-going") throw new InvalidInputError("invalid-meetup", "Choose Going or Not going.");
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    const [existing] = await db.select().from(gatheringRsvps)
      .where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id), eq(gatheringRsvps.memberId, actor.memberId)));
    if (!gathering.recurrence || !gathering.recurrence.isStanding && !gathering.membership && !existing) throw new AccessDeniedError();
    await saveRsvp(db, actor, id, answer);
    if (answer === "going") return takePlace(db, actor.organisationId, gathering, current, now);
    await releasePlace(db, actor.organisationId, gathering, current, now);
    return null;
  });
}

export async function processRecurrences(deps: Deps): Promise<void> {
  const pending = await deps.db.selectDistinct({ organisationId: recurrences.organisationId }).from(recurrences).where(isNull(recurrences.stoppedAt));
  for (const { organisationId } of pending) {
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
      const now = deps.clock.now();
      const through = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const templates = await db.select().from(recurrences).where(and(eq(recurrences.organisationId, organisationId), isNull(recurrences.stoppedAt)));
      for (const series of templates) {
        const dates = expandRecurrence(series, now, through);
        if (!dates.length) continue;
        const standing = await db.select({ memberId: recurrenceMembers.memberId }).from(recurrenceMembers)
          .innerJoin(members, and(eq(members.organisationId, recurrenceMembers.organisationId), eq(members.id, recurrenceMembers.memberId)))
          .where(and(eq(recurrenceMembers.organisationId, organisationId), eq(recurrenceMembers.recurrenceId, series.id), eq(members.status, "active")))
          .orderBy(recurrenceMembers.position);
        if (!standing.some(({ memberId }) => memberId === series.hostMemberId)) continue;
        const interests = await db.select({ interestId: recurrenceInterests.interestId }).from(recurrenceInterests)
          .where(and(eq(recurrenceInterests.organisationId, organisationId), eq(recurrenceInterests.recurrenceId, series.id)));
        for (const startsAt of dates) {
          const [created] = await db.insert(gatherings).values({
            organisationId, kind: series.kind, hostMemberId: series.hostMemberId,
            activityId: series.activityId, startsAt, durationMinutes: series.durationMinutes,
            placeKind: series.placeKind, placeSiteId: series.placeSiteId, placeSpot: series.placeSpot, placeUrl: series.placeUrl,
            capacity: series.capacity, description: series.description,
            audienceKind: series.audienceKind, audienceScope: series.audienceScope, audienceSiteId: series.audienceSiteId,
            status: "scheduled", createdAt: now, recurrenceId: series.id, scheduledStartsAt: startsAt,
          }).onConflictDoNothing().returning({ id: gatherings.id });
          if (!created) continue;
          await db.insert(gatheringMembers).values(standing.map(({ memberId }) => ({ organisationId, gatheringId: created.id, memberId, status: "participant" as const })));
          await db.insert(gatheringRsvps).values(standing.map(({ memberId }) => ({ organisationId, gatheringId: created.id, memberId })));
          if (interests.length) await db.insert(gatheringInterests).values(interests.map(({ interestId }) => ({ organisationId, gatheringId: created.id, interestId })));
        }
      }
      const due = await db.select({ meetupId: gatherings.id, hostMemberId: gatherings.hostMemberId, memberId: gatheringRsvps.memberId }).from(gatheringRsvps)
        .innerJoin(gatherings, and(eq(gatherings.organisationId, gatheringRsvps.organisationId), eq(gatherings.id, gatheringRsvps.gatheringId)))
        .innerJoin(recurrenceMembers, and(eq(recurrenceMembers.organisationId, gatherings.organisationId), eq(recurrenceMembers.recurrenceId, gatherings.recurrenceId), eq(recurrenceMembers.memberId, gatheringRsvps.memberId)))
        .innerJoin(members, and(eq(members.organisationId, gatheringRsvps.organisationId), eq(members.id, gatheringRsvps.memberId)))
        .where(and(eq(gatheringRsvps.organisationId, organisationId), isNull(gatheringRsvps.promptedAt), eq(members.status, "active"), eq(gatherings.status, "scheduled"),
          gt(gatherings.startsAt, now), lte(gatherings.startsAt, new Date(now.getTime() + 48 * 60 * 60 * 1000))));
      for (const [meetupId, recipients] of Map.groupBy(due, (row) => row.meetupId)) {
        const [gathering] = await readGatherings(db, { organisationId, memberId: recipients[0]!.hostMemberId }, [meetupId], null, now);
        if (!gathering) continue;
        const memberIds = recipients.map(({ memberId }) => memberId);
        await notify(db, organisationId, gathering, memberIds, "rsvp-prompt", `Are you going to this ${meetupOrEvent(gathering)}?`, now);
        await db.update(gatheringRsvps).set({ promptedAt: now }).where(and(eq(gatheringRsvps.organisationId, organisationId), eq(gatheringRsvps.gatheringId, meetupId), inArray(gatheringRsvps.memberId, memberIds)));
      }
    });
  }
}
