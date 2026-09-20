import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import { ATTENDANCE_WINDOW_DAYS, attendancePromptState, attendanceWindow } from "./attendance-records";
import type { Deps } from "./deps";
import type { Queryable } from "./departments-and-sites";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { meetupOrEvent, type GatheringSummary, type MeetupPerson } from "./meetups";
import { activities, attendanceMembers, attendanceRecords, gatheringMembers, gatheringRsvps, gatherings, members, notices, occurrenceRatings, organisations, sites } from "./schema";
import { gatheringNoticeText, recordNotices } from "./notifications";

export type ConnectionOccurrence = Pick<GatheringSummary, "id" | "kind" | "activity" | "startsAt" | "place">;
export interface Connection {
  member: MeetupPerson & { profileVisible: boolean };
  occurrences: ConnectionOccurrence[];
}

export interface Attendance {
  hasEnded: boolean;
  endsAt: Date;
  closesAt: Date;
  confirmedAt: Date | null;
  canConfirm: boolean;
  canRate: boolean;
  hasRated: boolean;
  outcome: "unknown" | "attended" | "no-show" | "not-recorded";
  checklist: (MeetupPerson & { attended: boolean })[] | null;
}

export type AttendanceHistoryEntry = ConnectionOccurrence & { outcome: Attendance["outcome"] };

function attendanceOutcome(confirmedAt: Date | null | undefined, present: boolean, going: boolean): Attendance["outcome"] {
  return !confirmedAt ? "unknown" : present ? "attended" : going ? "no-show" : "not-recorded";
}

export async function attendanceHistory(deps: Deps, actor: Actor): Promise<AttendanceHistoryEntry[]> {
  await requireActiveMember(deps.db, actor);
  return readAttendanceHistory(deps.db, actor, deps.clock.now());
}

export async function readAttendanceHistory(db: Queryable, actor: Actor, now: Date): Promise<AttendanceHistoryEntry[]> {
  const rows = await db.select({ gathering: gatherings, activityName: activities.name, siteName: sites.name,
    confirmedAt: attendanceRecords.confirmedAt, present: attendanceMembers.memberId, membership: gatheringMembers.status, answer: gatheringRsvps.answer })
    .from(gatherings)
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, gatherings.organisationId), eq(attendanceRecords.gatheringId, gatherings.id)))
    .leftJoin(attendanceMembers, and(eq(attendanceMembers.organisationId, gatherings.organisationId), eq(attendanceMembers.gatheringId, gatherings.id), eq(attendanceMembers.memberId, actor.memberId), eq(attendanceMembers.attended, true)))
    .leftJoin(gatheringMembers, and(eq(gatheringMembers.organisationId, gatherings.organisationId), eq(gatheringMembers.gatheringId, gatherings.id), eq(gatheringMembers.memberId, actor.memberId)))
    .leftJoin(gatheringRsvps, and(eq(gatheringRsvps.organisationId, gatherings.organisationId), eq(gatheringRsvps.gatheringId, gatherings.id), eq(gatheringRsvps.memberId, actor.memberId)))
    .where(and(eq(gatherings.organisationId, actor.organisationId), inArray(gatherings.status, ["scheduled", "completed"]),
      sql`${gatherings.startsAt} + ${gatherings.durationMinutes} * interval '1 minute' <= ${now.toISOString()}::timestamptz`,
      or(eq(gatherings.hostMemberId, actor.memberId), isNotNull(gatheringMembers.memberId), isNotNull(gatheringRsvps.memberId), isNotNull(attendanceMembers.memberId))))
    .orderBy(desc(gatherings.startsAt), gatherings.id);
  return rows.map(({ gathering, activityName, siteName, confirmedAt, present, membership, answer }) => ({
    id: gathering.id, kind: gathering.kind, activity: { id: gathering.activityId, name: activityName }, startsAt: gathering.startsAt,
    place: gathering.placeKind === "physical"
      ? { kind: "physical", siteId: gathering.placeSiteId!, siteName: siteName!, spot: gathering.placeSpot! }
      : { kind: "virtual", url: gathering.placeUrl! },
    outcome: attendanceOutcome(confirmedAt, Boolean(present), membership === "participant" && (!gathering.recurrenceId || answer === "going")),
  }));
}

export async function attendance(deps: Deps, actor: Actor, id: string): Promise<Attendance | undefined> {
  return deps.db.transaction(async (db) => {
    await requireActiveMember(db, actor);
    if (!isUuid(id)) return undefined;
    const [row] = await db.select({ gathering: gatherings, hostName: members.name }).from(gatherings)
      .innerJoin(members, and(eq(members.organisationId, gatherings.organisationId), eq(members.id, gatherings.hostMemberId)))
      .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id)));
    if (!row || row.gathering.status !== "scheduled" && row.gathering.status !== "completed") return undefined;
    const gathering = row.gathering;
    const isHost = gathering.hostMemberId === actor.memberId;
    const now = deps.clock.now();
    const { endsAt, closesAt } = attendanceWindow(gathering);
    const hasEnded = now >= endsAt;
    const people = await db.select({ memberId: members.id, name: members.name, status: gatheringMembers.status, answer: gatheringRsvps.answer }).from(gatheringMembers)
      .innerJoin(members, and(eq(members.organisationId, gatheringMembers.organisationId), eq(members.id, gatheringMembers.memberId)))
      .leftJoin(gatheringRsvps, and(eq(gatheringRsvps.organisationId, gatheringMembers.organisationId), eq(gatheringRsvps.gatheringId, gatheringMembers.gatheringId), eq(gatheringRsvps.memberId, gatheringMembers.memberId)))
      .where(and(eq(gatheringMembers.organisationId, actor.organisationId), eq(gatheringMembers.gatheringId, id), isHost && hasEnded ? undefined : eq(gatheringMembers.memberId, actor.memberId)));
    const recorded = hasEnded ? await db.select({ memberId: members.id, name: members.name, attended: attendanceMembers.attended }).from(attendanceMembers)
      .innerJoin(members, and(eq(members.organisationId, attendanceMembers.organisationId), eq(members.id, attendanceMembers.memberId)))
      .where(and(eq(attendanceMembers.organisationId, actor.organisationId), eq(attendanceMembers.gatheringId, id), isHost ? undefined : eq(attendanceMembers.memberId, actor.memberId))) : [];
    const present = recorded.filter((person) => person.attended);
    const own = people.find((person) => person.memberId === actor.memberId);
    const came = present.some((person) => person.memberId === actor.memberId);
    const [rsvp] = own || came || isHost ? [] : await db.select({ memberId: gatheringRsvps.memberId }).from(gatheringRsvps)
      .where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id), eq(gatheringRsvps.memberId, actor.memberId)));
    if (!own && !came && !isHost && !rsvp) return undefined;
    if (!hasEnded) return { hasEnded, endsAt, closesAt, confirmedAt: null, canRate: false, hasRated: false, canConfirm: false, outcome: "unknown", checklist: null };
    const [record] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.organisationId, actor.organisationId), eq(attendanceRecords.gatheringId, id)));
    const going = own?.status === "participant" && (!gathering.recurrenceId || own.answer === "going");
    const checklist = isHost ? new Map([...people.filter((person) => person.status === "participant"), ...recorded,
      { memberId: gathering.hostMemberId, name: row.hostName }].map((person) => [person.memberId, person])) : null;
    const [rating] = await db.select({ memberId: occurrenceRatings.memberId }).from(occurrenceRatings)
      .where(and(eq(occurrenceRatings.organisationId, actor.organisationId), eq(occurrenceRatings.gatheringId, id), eq(occurrenceRatings.memberId, actor.memberId)));
    return {
      hasEnded,
      endsAt, closesAt, confirmedAt: record?.confirmedAt ?? null,
      canRate: own?.status === "participant" && !rating, hasRated: !!rating,
      canConfirm: isHost && now < closesAt,
      outcome: attendanceOutcome(record?.confirmedAt, came, going),
      checklist: checklist ? [...checklist.values()].map(({ memberId, name }) => ({ memberId, name, attended: present.some((person) => person.memberId === memberId) }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.memberId.localeCompare(b.memberId)) : null,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function confirmAttendance(deps: Deps, actor: Actor, id: string, memberIds: string[]): Promise<void> {
  await withActiveMember(deps, actor, (db) => saveAttendance(db, actor, id, { memberIds }, deps.clock.now()));
}

async function saveAttendance(db: Queryable, actor: Actor, id: string, selection: { memberIds: string[] } | { everyone: true }, now: Date): Promise<void> {
  if (!isUuid(id)) throw new AccessDeniedError();
  const [entry] = await db.select({ gathering: gatherings, activityName: activities.name, siteName: sites.name }).from(gatherings)
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
    .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id)));
  if (!entry || entry.gathering.hostMemberId !== actor.memberId) throw new AccessDeniedError();
  const gathering = entry.gathering;
  const { endsAt, closesAt } = attendanceWindow(gathering);
  if (gathering.status !== "scheduled" && gathering.status !== "completed" || now < endsAt || now >= closesAt) {
    throw new InvalidInputError("invalid-attendance", "Confirm Attendance after the end and within seven days.");
  }
  const parsed = z.array(z.uuid()).safeParse("memberIds" in selection ? selection.memberIds : []);
  if (!parsed.success) throw new InvalidInputError("invalid-attendance", "Choose who came from the Attendance checklist.");
  const participants = await db.select({ memberId: gatheringMembers.memberId }).from(gatheringMembers)
    .where(and(eq(gatheringMembers.organisationId, actor.organisationId), eq(gatheringMembers.gatheringId, id), eq(gatheringMembers.status, "participant")));
  const previous = await db.select({ memberId: attendanceMembers.memberId, attended: attendanceMembers.attended }).from(attendanceMembers)
    .where(and(eq(attendanceMembers.organisationId, actor.organisationId), eq(attendanceMembers.gatheringId, id)));
  const eligible = new Set([gathering.hostMemberId, ...participants.map((person) => person.memberId), ...previous.map((person) => person.memberId)]);
  const selected = "everyone" in selection ? [...eligible] : [...new Set(parsed.data)];
  if (selected.some((memberId) => !eligible.has(memberId))) throw new InvalidInputError("invalid-attendance", "Choose who came from the Attendance checklist.");
  const [record] = await db.select({ confirmedAt: attendanceRecords.confirmedAt }).from(attendanceRecords)
    .where(and(eq(attendanceRecords.organisationId, actor.organisationId), eq(attendanceRecords.gatheringId, id)));
  const previousPresent = new Set(previous.filter((person) => person.attended).map((person) => person.memberId));
  if (record?.confirmedAt && selected.length === previousPresent.size && selected.every((memberId) => previousPresent.has(memberId))) return;
  await db.insert(attendanceRecords).values({ organisationId: actor.organisationId, gatheringId: id, confirmedAt: now, confirmedByMemberId: actor.memberId })
    .onConflictDoUpdate({ target: [attendanceRecords.organisationId, attendanceRecords.gatheringId], set: { confirmedAt: now, confirmedByMemberId: actor.memberId } });
  await db.delete(attendanceMembers).where(and(eq(attendanceMembers.organisationId, actor.organisationId), eq(attendanceMembers.gatheringId, id)));
  await db.insert(attendanceMembers).values([...eligible].map((memberId) => ({ organisationId: actor.organisationId, gatheringId: id, memberId, attended: selected.includes(memberId) })));
  const place = gathering.placeKind === "physical" ? `${gathering.placeSpot}, ${entry.siteName}` : gathering.placeUrl!;
  await recordNotices(db, actor.organisationId, [gathering.hostMemberId, ...participants.map((person) => person.memberId), ...selected], {
    gatheringId: id, kind: "attendance-confirmed",
    ...gatheringNoticeText({ message: `The Host ${record?.confirmedAt ? "amended" : "recorded"} Attendance for this ${meetupOrEvent(gathering)}.`,
      activity: entry.activityName, startsAt: gathering.startsAt, place, placeKind: gathering.placeKind }),
  }, now);
}

export async function confirmAttendancePrompt(deps: Deps, actor: Actor, noticeId: string): Promise<string> {
  return withActiveMember(deps, actor, async (db) => {
    if (!isUuid(noticeId)) throw new AccessDeniedError();
    const [notice] = await db.select({ gatheringId: notices.gatheringId }).from(notices)
      .where(and(eq(notices.organisationId, actor.organisationId), eq(notices.id, noticeId), eq(notices.memberId, actor.memberId), eq(notices.kind, "attendance-prompt")));
    if (!notice?.gatheringId) throw new AccessDeniedError();
    const id = notice.gatheringId;
    const prompt = await attendancePromptState(db, actor.organisationId, id);
    if (prompt.latestNoticeId !== noticeId) throw new AccessDeniedError();
    if (prompt.confirmedAt) throw new InvalidInputError("invalid-attendance", "Attendance is already recorded. Amend it in the app.");
    await saveAttendance(db, actor, id, { everyone: true }, deps.clock.now());
    return id;
  });
}

function attendancePromptDue(now: Date) {
  const end = sql`${gatherings.startsAt} + ${gatherings.durationMinutes} * interval '1 minute'`;
  return and(eq(members.status, "active"), inArray(gatherings.status, ["scheduled", "completed"]),
    sql`${end} <= ${now.toISOString()}::timestamptz`, sql`${end} + ${ATTENDANCE_WINDOW_DAYS} * interval '1 day' > ${now.toISOString()}::timestamptz`,
    isNull(attendanceRecords.confirmedAt), or(isNull(attendanceRecords.promptedHostMemberId), ne(attendanceRecords.promptedHostMemberId, gatherings.hostMemberId)));
}

export async function processAttendance(deps: Deps): Promise<void> {
  const pending = await deps.db.selectDistinct({ organisationId: gatherings.organisationId }).from(gatherings)
    .innerJoin(members, and(eq(members.organisationId, gatherings.organisationId), eq(members.id, gatherings.hostMemberId)))
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, gatherings.organisationId), eq(attendanceRecords.gatheringId, gatherings.id)))
    .where(attendancePromptDue(deps.clock.now()));
  for (const { organisationId } of pending) {
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
      const now = deps.clock.now();
      const due = await db.select({ gathering: gatherings, activityName: activities.name, siteName: sites.name }).from(gatherings)
        .innerJoin(members, and(eq(members.organisationId, gatherings.organisationId), eq(members.id, gatherings.hostMemberId)))
        .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
        .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
        .leftJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, gatherings.organisationId), eq(attendanceRecords.gatheringId, gatherings.id)))
        .where(and(eq(gatherings.organisationId, organisationId), attendancePromptDue(now)));
      for (const { gathering, activityName, siteName } of due) {
        const place = gathering.placeKind === "physical" ? `${gathering.placeSpot}, ${siteName}` : gathering.placeUrl!;
        await recordNotices(db, organisationId, [gathering.hostMemberId], {
          gatheringId: gathering.id, kind: "attendance-prompt",
          ...gatheringNoticeText({ message: `Confirm who came to this ${meetupOrEvent(gathering)}.`, activity: activityName,
            startsAt: gathering.startsAt, place, placeKind: gathering.placeKind }),
        }, now);
        await db.insert(attendanceRecords).values({ organisationId, gatheringId: gathering.id, promptedHostMemberId: gathering.hostMemberId })
          .onConflictDoUpdate({ target: [attendanceRecords.organisationId, attendanceRecords.gatheringId], set: { promptedHostMemberId: gathering.hostMemberId } });
      }
    });
  }
}

export async function rateOccurrence(deps: Deps, actor: Actor, id: string, value: number): Promise<void> {
  await withActiveMember(deps, actor, async (db) => {
    if (!isUuid(id)) throw new AccessDeniedError();
    const [row] = await db.select({ gathering: gatherings }).from(gatherings)
      .innerJoin(gatheringMembers, and(eq(gatheringMembers.organisationId, gatherings.organisationId), eq(gatheringMembers.gatheringId, gatherings.id),
        eq(gatheringMembers.memberId, actor.memberId), eq(gatheringMembers.status, "participant")))
      .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id)));
    if (!row) throw new AccessDeniedError();
    const gathering = row.gathering;
    const now = deps.clock.now();
    if (gathering.status !== "scheduled" && gathering.status !== "completed" || now < attendanceWindow(gathering).endsAt) {
      throw new InvalidInputError("invalid-rating", "Rate this occurrence after it ends.");
    }
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new InvalidInputError("invalid-rating", "Choose a rating from one to five.");
    const saved = await db.insert(occurrenceRatings).values({ organisationId: actor.organisationId, gatheringId: id, memberId: actor.memberId, value, createdAt: now })
      .onConflictDoNothing().returning({ memberId: occurrenceRatings.memberId });
    if (!saved.length) throw new InvalidInputError("invalid-rating", "You already rated this occurrence.");
  });
}

export interface ActivityRating {
  activity: { id: string; name: string };
  ratingCount: number;
  averageRating: number;
}

export async function ratings(db: Queryable, organisationId: string): Promise<ActivityRating[]> {
  return db.select({ activity: { id: activities.id, name: activities.name }, ratingCount: sql<number>`count(*)::integer`, averageRating: sql<number>`avg(${occurrenceRatings.value})::double precision` })
    .from(occurrenceRatings)
    .innerJoin(gatherings, and(eq(gatherings.organisationId, occurrenceRatings.organisationId), eq(gatherings.id, occurrenceRatings.gatheringId)))
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .where(eq(occurrenceRatings.organisationId, organisationId)).groupBy(activities.id, activities.name).orderBy(activities.name, activities.id);
}

export async function connectedMemberIds(db: Queryable, actor: Actor): Promise<Set<string>> {
  const other = alias(attendanceMembers, "connected_attendance");
  const rows = await db.selectDistinct({ memberId: other.memberId }).from(attendanceMembers)
    .innerJoin(other, and(eq(other.organisationId, attendanceMembers.organisationId), eq(other.gatheringId, attendanceMembers.gatheringId), ne(other.memberId, attendanceMembers.memberId), eq(other.attended, true)))
    .where(and(eq(attendanceMembers.organisationId, actor.organisationId), eq(attendanceMembers.memberId, actor.memberId), eq(attendanceMembers.attended, true)));
  return new Set(rows.map((row) => row.memberId));
}

export async function connections(deps: Deps, actor: Actor): Promise<Connection[]> {
  await requireActiveMember(deps.db, actor);
  const other = alias(attendanceMembers, "other_attendance");
  const rows = await deps.db.select({ gathering: gatherings, memberId: members.id, name: members.name, status: members.status, activityName: activities.name, siteName: sites.name })
    .from(attendanceMembers)
    .innerJoin(other, and(eq(other.organisationId, attendanceMembers.organisationId), eq(other.gatheringId, attendanceMembers.gatheringId), ne(other.memberId, attendanceMembers.memberId), eq(other.attended, true)))
    .innerJoin(members, and(eq(members.organisationId, other.organisationId), eq(members.id, other.memberId)))
    .innerJoin(gatherings, and(eq(gatherings.organisationId, attendanceMembers.organisationId), eq(gatherings.id, attendanceMembers.gatheringId)))
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
    .where(and(eq(attendanceMembers.organisationId, actor.organisationId), eq(attendanceMembers.memberId, actor.memberId), eq(attendanceMembers.attended, true)))
    .orderBy(members.name, members.id, desc(gatherings.startsAt), gatherings.id);
  const result = new Map<string, Connection>();
  for (const row of rows) {
    const connection = result.get(row.memberId) ?? { member: { memberId: row.memberId, name: row.name, profileVisible: VISIBLE_MEMBER_STATUSES.includes(row.status) }, occurrences: [] };
    const gathering = row.gathering;
    connection.occurrences.push({
      id: gathering.id, kind: gathering.kind, activity: { id: gathering.activityId, name: row.activityName }, startsAt: gathering.startsAt,
      place: gathering.placeKind === "physical"
        ? { kind: "physical", siteId: gathering.placeSiteId!, siteName: row.siteName!, spot: gathering.placeSpot! }
        : { kind: "virtual", url: gathering.placeUrl! },
    });
    result.set(row.memberId, connection);
  }
  return [...result.values()];
}
