import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import { retainHostForAttendance } from "./attendance-records";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { interestChoiceSchema, type Interest, type InterestChoice } from "./interests";
import { relevantInterests, saveRelevantInterests } from "./meetup-interests";
import { gatheringNoticeText, recordNotices, supersedeDeliveries } from "./notifications";
import { activities, attendanceMembers, departments, eventProposals, gatheringMembers, gatheringRsvps, gatherings, invites, members, notices, organisations, recurrenceInterests, recurrenceMembers, recurrences, sites } from "./schema";
import { availabilityOverlapSchema, findAvailabilityOverlap, type AvailabilityOverlap } from "./availability";
import { readRecurrences, recurrenceSchema, saveRsvp, type Recurrence, type RecurrenceInput } from "./recurrence-records";

export type MeetupPlace = { kind: "physical"; siteId: string; spot: string } | { kind: "virtual"; url: string };
export type MeetupAudience =
  | { kind: "open"; scope: "organisation" }
  | { kind: "open"; scope: "site"; siteId: string }
  | { kind: "invite-only" };

export interface CreateMeetupInput {
  activityId: string;
  startsAt: Date;
  durationMinutes: number;
  place: MeetupPlace;
  capacity: number;
  audience?: MeetupAudience;
  description?: string;
  relevantInterests?: InterestChoice[];
  invitedMemberIds?: string[];
  availabilityOverlap?: AvailabilityOverlap;
  recurrence?: RecurrenceInput;
}

export type EditMeetupInput = Pick<CreateMeetupInput, "startsAt" | "durationMinutes" | "place" | "capacity" | "description" | "relevantInterests">;
export type CreateEventInput = Omit<CreateMeetupInput, "capacity" | "availabilityOverlap"> & { capacity?: number | null };
export type EditEventInput = Omit<EditMeetupInput, "capacity"> & { capacity?: number | null };
export type GatheringKind = "meetup" | "event";
export interface MeetupPerson { memberId: string; name: string }
export type RsvpAnswer = NonNullable<typeof gatheringRsvps.$inferSelect.answer>;
interface GatheringFields {
  id: string;
  activity: { id: string; name: string };
  host: MeetupPerson;
  startsAt: Date;
  durationMinutes: number;
  place: MeetupPlace & { siteName?: string };
  audience: MeetupAudience;
  description: string;
  status: "scheduled" | "cancelled" | "completed";
  participantCount: number;
  membership: "host" | "participant" | "waitlisted" | null;
  canChange: boolean;
  recurrence: Recurrence | null;
  rsvp: RsvpAnswer | null;
}
export interface MeetupSummary extends GatheringFields { kind: "meetup"; capacity: number }
export interface EventSummary extends GatheringFields { kind: "event"; capacity: number | null }
export type GatheringSummary = MeetupSummary | EventSummary;
interface ParticipationDetails {
  relevantInterests: Interest[];
  participants: MeetupPerson[];
  waitlist: MeetupPerson[] | null;
  invite: Invite | null;
  invites: Invite[] | null;
  rsvps: (MeetupPerson & { answer: RsvpAnswer | null })[] | null;
}
export interface MeetupDetail extends MeetupSummary, ParticipationDetails {}
export interface EventDetail extends EventSummary, ParticipationDetails {}
export type GatheringDetail = MeetupDetail | EventDetail;
type ReadGathering = GatheringSummary & Pick<ParticipationDetails, "participants" | "waitlist" | "rsvps">;

type InviteTarget = { meetupId: string; eventId?: never } | { eventId: string; meetupId?: never };

export type Invite = InviteTarget & {
  id: string;
  member: MeetupPerson;
  state: typeof invites.$inferSelect.state;
}

export type InviteAnswer = InviteTarget & {
  state: "accepted" | "declined";
  membership: "participant" | "waitlisted" | null;
}

export interface InviteSearch { name?: string; page?: number }
export interface InviteChoices {
  members: (MeetupPerson & { department: string | null; site: string | null })[];
  hasMore: boolean;
}

const INVITE_PAGE_SIZE = 20;

export interface MeetupChoices {
  activities: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  defaultSiteId: string | null;
}

export interface Notice {
  id: string;
  kind: typeof notices.$inferSelect.kind;
  meetupId: string | null;
  eventId?: string;
  message: string;
  createdAt: Date;
}

const placeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("physical"), siteId: z.uuid(), spot: z.string().trim().min(1).max(300) }),
  z.object({ kind: z.literal("virtual"), url: z.url({ protocol: /^https?$/ }).max(2000) }),
]);
const meetupSchema = z.object({
  activityId: z.uuid(),
  startsAt: z.date(),
  durationMinutes: z.number().int().min(1).max(1440),
  place: placeSchema,
  capacity: z.number().int().min(2).max(30),
  description: z.string().trim().max(5000).optional().default(""),
  relevantInterests: z.array(interestChoiceSchema).max(20).optional(),
  invitedMemberIds: z.array(z.uuid()).max(20).optional().default([]),
  availabilityOverlap: availabilityOverlapSchema.optional(),
  recurrence: recurrenceSchema.optional(),
  audience: z.union([
    z.object({ kind: z.literal("invite-only") }),
    z.object({ kind: z.literal("open"), scope: z.literal("organisation") }),
    z.object({ kind: z.literal("open"), scope: z.literal("site"), siteId: z.uuid() }),
  ]).optional(),
});

const eventSchema = meetupSchema.extend({ availabilityOverlap: z.undefined().optional(), capacity: z.number().int().min(1).max(2_147_483_647).nullable().optional().default(null) });

function invalid(message: string): never {
  throw new InvalidInputError("invalid-meetup", message);
}

export async function meetupChoices(deps: Deps, actor: Actor): Promise<MeetupChoices> {
  const current = await requireActiveMember(deps.db, actor);
  const [activityRows, siteRows] = await Promise.all([
    deps.db.select({ id: activities.id, name: activities.name }).from(activities)
      .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.retired, false))).orderBy(activities.name),
    deps.db.select({ id: sites.id, name: sites.name }).from(sites)
      .where(and(eq(sites.organisationId, actor.organisationId), eq(sites.retired, false))).orderBy(sites.name),
  ]);
  return { activities: activityRows, sites: siteRows, defaultSiteId: current.siteId };
}

export async function validSite(db: Queryable, organisationId: string, siteId: string) {
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.organisationId, organisationId), eq(sites.id, siteId), eq(sites.retired, false)));
  if (!site) invalid("Choose a current Site in your Organisation.");
}

function placeColumns(place: MeetupPlace) {
  return {
    placeKind: place.kind,
    placeSiteId: place.kind === "physical" ? place.siteId : null,
    placeSpot: place.kind === "physical" ? place.spot : null,
    placeUrl: place.kind === "virtual" ? place.url : null,
  };
}

export async function createMeetup(deps: Deps, actor: Actor, input: CreateMeetupInput): Promise<MeetupDetail> {
  return withActiveMember(deps, actor, async (db, current) => {
    const id = await createGathering(db, actor, input, "meetup", deps.clock.now());
    const meetup = await readGatheringDetail(db, actor, id, current.siteId, deps.clock.now());
    if (meetup?.kind !== "meetup") throw new Error("Meetup creation returned no Meetup");
    return meetup;
  });
}

export async function createGathering(db: Queryable, actor: Actor, input: CreateMeetupInput | CreateEventInput, kind: GatheringKind, now: Date, proposed = false): Promise<string> {
  const parsed = (kind === "meetup" ? meetupSchema : eventSchema).safeParse(input);
  if (!parsed.success) invalid(kind === "meetup" ? "Choose an Activity, a valid start time and Place, a duration from 1 to 1440 minutes and capacity from 2 to 30." : "Choose an Activity, a valid start time and Place, a duration from 1 to 1440 minutes and an optional positive capacity.");
  const data = parsed.data;
  if (data.startsAt <= now) invalid("Choose a future start time.");
  if (data.recurrence?.endsOn && data.startsAt > new Date(`${data.recurrence.endsOn}T23:59:59.999Z`)) invalid("The series end must include its first occurrence.");
  const availabilityOverlap = data.availabilityOverlap;
  const overlap = availabilityOverlap ? await findAvailabilityOverlap(db, actor, availabilityOverlap, now, true) : undefined;
  if (availabilityOverlap && (!overlap || data.activityId !== overlap.activity.id
    || data.place.kind !== overlap.place.kind
    || data.place.kind === "physical" && overlap.place.kind === "physical" && data.place.siteId !== overlap.place.siteId
    || data.startsAt < overlap.startsAt || data.startsAt >= overlap.endsAt)) {
    throw new InvalidInputError("invalid-availability", "This overlap is no longer available, or the Meetup no longer matches it. Open Availability to choose again.");
  }
  const host = await requireActiveMember(db, actor);
  const [activity] = await db.select({ id: activities.id }).from(activities)
    .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, data.activityId), eq(activities.retired, false)));
  if (!activity) invalid("Choose a current Activity in your Organisation.");
  if (data.place.kind === "physical") await validSite(db, actor.organisationId, data.place.siteId);
  let audience = data.audience;
  if (!audience) {
    if (kind === "event" || data.place.kind === "virtual") audience = { kind: "open", scope: "organisation" };
    else {
      if (!host.siteId) invalid("Set your Site in your profile or choose an audience.");
      audience = { kind: "open", scope: "site", siteId: host.siteId };
    }
  }
  if (audience.kind === "open" && audience.scope === "site") await validSite(db, actor.organisationId, audience.siteId);
  const values = {
    organisationId: actor.organisationId, kind, hostMemberId: actor.memberId,
    activityId: data.activityId, startsAt: data.startsAt, durationMinutes: data.durationMinutes,
    ...placeColumns(data.place), capacity: data.capacity, description: data.description,
    audienceKind: audience.kind, audienceScope: audience.kind === "open" ? audience.scope : null,
    audienceSiteId: audience.kind === "open" && audience.scope === "site" ? audience.siteId : null,
    createdAt: now,
  };
  const [created] = await db.insert(gatherings).values({ ...values, status: proposed ? "proposed" : "scheduled" }).returning();
  if (!created) throw new Error("Creation returned no row");
  await saveRelevantInterests(db, actor.organisationId, created.id, data.relevantInterests ?? [], now);
  const selectedIds = [...new Set([...data.invitedMemberIds, ...(overlap ? [overlap.member.memberId] : [])])];
  if (proposed) {
    await db.insert(eventProposals).values({ organisationId: actor.organisationId, eventId: created.id, proposerMemberId: actor.memberId, recurrence: data.recurrence, invitedMemberIds: selectedIds });
  } else await publishGathering(db, actor, created, data.recurrence, selectedIds, now);
  return created.id;
}

export async function publishGathering(db: Queryable, actor: Actor, row: typeof gatherings.$inferSelect, recurrence: RecurrenceInput | null | undefined, invitedMemberIds: string[], now: Date): Promise<void> {
  const host = await requireActiveMember(db, actor);
  if (row.startsAt <= now) invalid("Choose a future start time before publishing the Event.");
  const [activity] = await db.select({ id: activities.id }).from(activities)
    .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, row.activityId), eq(activities.retired, false)));
  if (!activity) invalid("Choose a current Activity in your Organisation.");
  if (row.placeSiteId) await validSite(db, actor.organisationId, row.placeSiteId);
  if (row.audienceSiteId) await validSite(db, actor.organisationId, row.audienceSiteId);
  const [series] = recurrence ? await db.insert(recurrences).values({
    organisationId: row.organisationId, kind: row.kind, hostMemberId: row.hostMemberId,
    activityId: row.activityId, startsAt: row.startsAt, durationMinutes: row.durationMinutes,
    placeKind: row.placeKind, placeSiteId: row.placeSiteId, placeSpot: row.placeSpot, placeUrl: row.placeUrl,
    capacity: row.capacity, description: row.description, audienceKind: row.audienceKind, audienceScope: row.audienceScope,
    audienceSiteId: row.audienceSiteId, createdAt: now, ...recurrence,
  }).returning() : [];
  await db.update(gatherings).set({ status: "scheduled", recurrenceId: series?.id, scheduledStartsAt: series ? row.startsAt : undefined }).where(gatheringWhere(actor.organisationId, row.id));
  await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: row.id, memberId: actor.memberId, status: "participant" });
  if (series) {
    await db.insert(recurrenceMembers).values({ organisationId: actor.organisationId, recurrenceId: series.id, memberId: actor.memberId });
    await db.insert(gatheringRsvps).values({ organisationId: actor.organisationId, gatheringId: row.id, memberId: actor.memberId });
    const interests = await relevantInterests(db, actor.organisationId, row.id);
    if (interests.length) await db.insert(recurrenceInterests).values(interests.map(({ interestId }) => ({ organisationId: actor.organisationId, recurrenceId: series.id, interestId })));
  }
  if (!invitedMemberIds.length) return;
  const gathering = (await readGathering(db, actor, row.id, host.siteId, now))!;
  for (const memberId of invitedMemberIds) await saveInvite(db, actor, gathering, memberId, host.name, now, { selectionSource: row.status === "proposed" ? "proposal" : "suggestion" });
}

export function visibleGatherings(actor: Actor, siteId: string | null, kind?: GatheringKind) {
  return and(
    eq(gatherings.organisationId, actor.organisationId), kind ? eq(gatherings.kind, kind) : undefined,
    inArray(gatherings.status, ["scheduled", "cancelled", "completed"]),
    or(
      eq(gatherings.hostMemberId, actor.memberId),
      sql`exists (select 1 from ${attendanceMembers} where ${attendanceMembers.organisationId} = ${gatherings.organisationId} and ${attendanceMembers.gatheringId} = ${gatherings.id} and ${attendanceMembers.memberId} = ${actor.memberId} and ${attendanceMembers.attended} = true)`,
      sql`exists (select 1 from ${recurrenceMembers} where ${recurrenceMembers.organisationId} = ${gatherings.organisationId} and ${recurrenceMembers.recurrenceId} = ${gatherings.recurrenceId} and ${recurrenceMembers.memberId} = ${actor.memberId})`,
      sql`exists (select 1 from ${gatheringRsvps} where ${gatheringRsvps.organisationId} = ${gatherings.organisationId} and ${gatheringRsvps.gatheringId} = ${gatherings.id} and ${gatheringRsvps.memberId} = ${actor.memberId})`,
      sql`exists (select 1 from ${invites} where ${invites.organisationId} = ${gatherings.organisationId} and ${invites.gatheringId} = ${gatherings.id} and ${invites.memberId} = ${actor.memberId})`,
      sql`exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${gatherings.organisationId} and ${gatheringMembers.gatheringId} = ${gatherings.id} and ${gatheringMembers.memberId} = ${actor.memberId})`,
      and(eq(gatherings.status, "cancelled"),
        sql`exists (select 1 from ${notices} where ${notices.organisationId} = ${gatherings.organisationId} and ${notices.gatheringId} = ${gatherings.id} and ${notices.memberId} = ${actor.memberId} and ${notices.kind} = 'meetup-cancelled')`),
      and(eq(gatherings.audienceKind, "open"),
        or(eq(gatherings.audienceScope, "organisation"), siteId ? eq(gatherings.audienceSiteId, siteId) : undefined)),
    ),
  );
}

export async function readGathering(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<ReadGathering | undefined> {
  return (await readGatherings(db, actor, [id], siteId, now))[0];
}

export async function readGatherings(db: Queryable, actor: Actor, ids: string[], siteId: string | null, now: Date): Promise<ReadGathering[]> {
  if (!ids.length) return [];
  const rows = await db.select({ gathering: gatherings, activityName: activities.name, hostName: members.name, siteName: sites.name })
    .from(gatherings)
    .innerJoin(activities, and(eq(activities.id, gatherings.activityId), eq(activities.organisationId, gatherings.organisationId)))
    .innerJoin(members, and(eq(members.id, gatherings.hostMemberId), eq(members.organisationId, gatherings.organisationId)))
    .leftJoin(sites, and(eq(sites.id, gatherings.placeSiteId), eq(sites.organisationId, gatherings.organisationId)))
    .where(and(visibleGatherings(actor, siteId), inArray(gatherings.id, ids)))
    .orderBy(gatherings.startsAt, gatherings.id);
  if (!rows.length) return [];
  const allPeople = await db.select({ meetupId: gatheringMembers.gatheringId, memberId: members.id, name: members.name, status: gatheringMembers.status })
    .from(gatheringMembers)
    .innerJoin(members, and(eq(members.id, gatheringMembers.memberId), eq(members.organisationId, gatheringMembers.organisationId)))
    .where(and(eq(gatheringMembers.organisationId, actor.organisationId), inArray(gatheringMembers.gatheringId, rows.map((row) => row.gathering.id))))
    .orderBy(asc(gatheringMembers.position));
  const peopleByGathering = Map.groupBy(allPeople, (person) => person.meetupId);
  const answers = await db.select({ meetupId: gatheringRsvps.gatheringId, memberId: members.id, name: members.name, answer: gatheringRsvps.answer }).from(gatheringRsvps)
    .innerJoin(members, and(eq(members.organisationId, gatheringRsvps.organisationId), eq(members.id, gatheringRsvps.memberId)))
    .where(and(eq(gatheringRsvps.organisationId, actor.organisationId), inArray(gatheringRsvps.gatheringId, rows.map((row) => row.gathering.id))));
  const answersByGathering = Map.groupBy(answers, (answer) => answer.meetupId);
  const series = await readRecurrences(db, actor, [...new Set(rows.flatMap(({ gathering }) => gathering.recurrenceId ? [gathering.recurrenceId] : []))], siteId, now);
  return rows.map((row): ReadGathering => {
    const gathering = row.gathering;
    const people = peopleByGathering.get(gathering.id) ?? [];
    const isHost = gathering.hostMemberId === actor.memberId;
    const membership = isHost ? "host" : people.find((person) => person.memberId === actor.memberId)?.status ?? null;
    const participants = people.filter((person) => person.status === "participant");
    const rsvps = new Map(people.map(({ memberId, name }) => [memberId, { memberId, name, answer: "going" as RsvpAnswer | null }]));
    for (const { memberId, name, answer } of answersByGathering.get(gathering.id) ?? []) rsvps.set(memberId, { memberId, name, answer });
    return {
      ...(gathering.kind === "meetup" ? { kind: "meetup" as const, capacity: gathering.capacity! } : { kind: "event" as const, capacity: gathering.capacity }),
      id: gathering.id, activity: { id: gathering.activityId, name: row.activityName }, host: { memberId: gathering.hostMemberId, name: row.hostName },
      startsAt: gathering.startsAt, durationMinutes: gathering.durationMinutes, description: gathering.description,
      status: gathering.status === "cancelled" ? "cancelled" : gathering.status === "completed" ? "completed" : "scheduled",
      place: gathering.placeKind === "physical"
        ? { kind: "physical", siteId: gathering.placeSiteId!, spot: gathering.placeSpot!, siteName: row.siteName! }
        : { kind: "virtual", url: gathering.placeUrl! },
      audience: gathering.audienceKind === "invite-only" ? { kind: "invite-only" }
        : gathering.audienceScope === "site" ? { kind: "open", scope: "site", siteId: gathering.audienceSiteId! }
          : { kind: "open", scope: "organisation" },
      participantCount: participants.length, membership, canChange: gathering.status === "scheduled" && gathering.startsAt > now,
      recurrence: gathering.recurrenceId ? series.get(gathering.recurrenceId) ?? null : null,
      rsvp: rsvps.get(actor.memberId)?.answer ?? null,
      rsvps: isHost ? [...rsvps.values()].sort((a, b) => a.name.localeCompare(b.name) || a.memberId.localeCompare(b.memberId)) : null,
      participants: isHost || membership === "participant" ? participants.map(({ memberId, name }) => ({ memberId, name })) : [],
      waitlist: isHost ? people.filter((person) => person.status === "waitlisted").map(({ memberId, name }) => ({ memberId, name })) : null,
    };
  });
}

export async function readGatheringDetail(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<GatheringDetail | undefined> {
  const gathering = await readGathering(db, actor, id, siteId, now);
  if (!gathering) return undefined;
  const isHost = gathering.membership === "host";
  const rows = await db.select({ id: invites.id, member: { memberId: members.id, name: members.name }, state: invites.state })
    .from(invites).innerJoin(members, and(eq(members.id, invites.memberId), eq(members.organisationId, invites.organisationId)))
    .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, id), isHost ? undefined : eq(invites.memberId, actor.memberId)))
    .orderBy(invites.createdAt, invites.id);
  const inviteRows = rows.map((row) => ({ ...row, ...inviteTarget(gathering) }));
  return { ...gathering, relevantInterests: await relevantInterests(db, actor.organisationId, id), invite: inviteRows.find((invite) => invite.member.memberId === actor.memberId) ?? null, invites: isHost ? inviteRows : null };
}

export async function viewMeetup(deps: Deps, actor: Actor, id: string): Promise<MeetupDetail | undefined> {
  const current = await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) return undefined;
  const meetup = await readGatheringDetail(deps.db, actor, id, current.siteId, deps.clock.now());
  return meetup?.kind === "meetup" ? meetup : undefined;
}

export async function listMeetups(deps: Deps, actor: Actor): Promise<MeetupSummary[]> {
  return (await listGatherings(deps, actor, "meetup")).filter((gathering) => gathering.kind === "meetup");
}

export async function listGatherings(deps: Deps, actor: Actor, kind: GatheringKind): Promise<GatheringSummary[]> {
  const current = await requireActiveMember(deps.db, actor);
  const rows = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(visibleGatherings(actor, current.siteId, kind), gt(gatherings.startsAt, deps.clock.now())))
    .orderBy(gatherings.startsAt, gatherings.id);
  const results = await readGatherings(deps.db, actor, rows.map((row) => row.id), current.siteId, deps.clock.now());
  return results.map(({ participants, waitlist, rsvps, ...summary }) => summary);
}

export async function requireScheduledGathering(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date, kind?: GatheringKind) {
  if (!isUuid(id)) throw new AccessDeniedError();
  const gathering = await readGathering(db, actor, id, siteId, now);
  if (!gathering || kind && gathering.kind !== kind) throw new AccessDeniedError();
  if (!gathering.canChange) invalid(`This ${gathering.kind === "event" ? "Event" : "Meetup"} is no longer open for changes.`);
  return gathering;
}

function membershipWhere(organisationId: string, meetupId: string) {
  return and(eq(gatheringMembers.organisationId, organisationId), eq(gatheringMembers.gatheringId, meetupId));
}

export function firstName(name: string) {
  return name.split(/\s+/)[0];
}

export async function noticeRecipients(db: Queryable, organisationId: string, meetupId: string): Promise<string[]> {
  const people = await db.select({ memberId: gatheringMembers.memberId }).from(gatheringMembers).where(membershipWhere(organisationId, meetupId));
  const rsvps = await db.select({ memberId: gatheringRsvps.memberId }).from(gatheringRsvps)
    .where(and(eq(gatheringRsvps.organisationId, organisationId), eq(gatheringRsvps.gatheringId, meetupId)));
  const pending = await db.select({ memberId: invites.memberId }).from(invites)
    .where(and(eq(invites.organisationId, organisationId), eq(invites.gatheringId, meetupId), eq(invites.state, "pending")));
  return [...people, ...rsvps, ...pending]
    .map((person) => person.memberId);
}

export async function notify(db: Queryable, organisationId: string, gathering: GatheringSummary, recipients: string[], kind: Notice["kind"], message: string, now: Date) {
  const place = gathering.place.kind === "physical" ? `${gathering.place.spot}, ${gathering.place.siteName}` : gathering.place.url;
  await recordNotices(db, organisationId, recipients, {
    gatheringId: gathering.id, kind, ...gatheringNoticeText({ message, activity: gathering.activity.name, startsAt: gathering.startsAt, place, placeKind: gathering.place.kind }),
  }, now);
}

export async function inbox(deps: Deps, actor: Actor): Promise<Notice[]> {
  await requireActiveMember(deps.db, actor);
  const rows = await deps.db.select({ id: notices.id, kind: notices.kind, meetupId: notices.gatheringId, message: notices.message, createdAt: notices.createdAt, gatheringKind: gatherings.kind })
    .from(notices).leftJoin(gatherings, and(eq(gatherings.organisationId, notices.organisationId), eq(gatherings.id, notices.gatheringId)))
    .where(and(eq(notices.organisationId, actor.organisationId), eq(notices.memberId, actor.memberId)))
    .orderBy(desc(notices.position));
  return rows.map(({ gatheringKind, ...notice }) => gatheringKind === "event" ? { ...notice, meetupId: null, eventId: notice.meetupId! } : notice);
}

export function meetupOrEvent(gathering: { kind: GatheringKind }): "Meetup" | "Event" {
  return gathering.kind === "event" ? "Event" : "Meetup";
}

function inviteTarget(gathering: { id: string; kind: GatheringKind }): InviteTarget {
  return gathering.kind === "event" ? { eventId: gathering.id } : { meetupId: gathering.id };
}

export async function joinMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<"participant" | "waitlisted"> {
  return withActiveMember(deps, actor, async (db, current) => {
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, deps.clock.now(), kind);
    if (!gathering.membership && !gathering.recurrence?.isStanding && gathering.rsvp === null && gathering.audience.kind !== "open") throw new AccessDeniedError();
    const status = await takePlace(db, actor.organisationId, gathering, current, deps.clock.now());
    if (gathering.recurrence) await saveRsvp(db, actor, id, "going");
    return status;
  });
}

export async function takePlace(db: Queryable, organisationId: string, gathering: GatheringSummary, member: { id: string; name: string }, now: Date): Promise<"participant" | "waitlisted"> {
  const entries = await db.select({ memberId: gatheringMembers.memberId, status: gatheringMembers.status }).from(gatheringMembers).where(membershipWhere(organisationId, gathering.id));
  const existing = entries.find((entry) => entry.memberId === member.id);
  if (existing) return existing.status;
  const status = (gathering.capacity === null || entries.filter((entry) => entry.status === "participant").length < gathering.capacity) ? "participant" : "waitlisted";
  await db.insert(gatheringMembers).values({ organisationId, gatheringId: gathering.id, memberId: member.id, status });
  if (status === "participant") await notify(db, organisationId, gathering, [gathering.host.memberId], "meetup-joined", `${firstName(member.name)} joined your ${meetupOrEvent(gathering)}.`, now);
  return status;
}

export async function releasePlace(db: Queryable, organisationId: string, gathering: GatheringSummary, member: { id: string; name: string }, now: Date): Promise<void> {
  const [removed] = await db.delete(gatheringMembers).where(and(membershipWhere(organisationId, gathering.id), eq(gatheringMembers.memberId, member.id))).returning({ status: gatheringMembers.status });
  if (removed?.status === "participant" && gathering.canChange) {
    await notify(db, organisationId, gathering, [gathering.host.memberId], "meetup-left", `${firstName(member.name)} left your ${meetupOrEvent(gathering)}.`, now);
    await promoteWaitlist(db, organisationId, gathering, now);
  }
}

export async function promoteWaitlist(db: Queryable, organisationId: string, gathering: GatheringSummary, now: Date) {
  const entries = await db.select().from(gatheringMembers).where(membershipWhere(organisationId, gathering.id)).orderBy(gatheringMembers.position);
  const spaces = gathering.capacity === null ? entries.length : gathering.capacity - entries.filter((entry) => entry.status === "participant").length;
  const promoted = entries.filter((entry) => entry.status === "waitlisted").slice(0, spaces);
  for (const entry of promoted) {
    await db.update(gatheringMembers).set({ status: "participant" }).where(and(membershipWhere(organisationId, gathering.id), eq(gatheringMembers.memberId, entry.memberId)));
  }
  await notify(db, organisationId, gathering, promoted.map((entry) => entry.memberId), "meetup-promoted", `A spot opened. You are now a Participant in this ${meetupOrEvent(gathering)}.`, now);
}

export async function leaveMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    if (gathering.membership === "host") invalid(`Hand over or cancel your ${meetupOrEvent(gathering)} before leaving.`);
    if (!gathering.membership) return;
    await releasePlace(db, actor.organisationId, gathering, current, now);
    if (gathering.recurrence?.isStanding) {
      await saveRsvp(db, actor, id, "not-going");
    } else await db.delete(gatheringRsvps).where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id), eq(gatheringRsvps.memberId, actor.memberId)));
  });
}

function requireHost(gathering: GatheringSummary, actor: Actor) {
  if (gathering.host.memberId !== actor.memberId) throw new AccessDeniedError();
}

interface InviteOptions { previousInviteId?: string; selectionSource?: "suggestion" | "proposal" }

export async function inviteMember(deps: Deps, actor: Actor, id: string, memberId: string, options: InviteOptions = {}, kind: GatheringKind = "meetup"): Promise<Invite> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    requireHost(gathering, actor);
    return saveInvite(db, actor, gathering, memberId, current.name, now, options);
  });
}

async function saveInvite(db: Queryable, actor: Actor, gathering: GatheringSummary & Pick<MeetupDetail, "participants">, memberId: string, hostName: string, now: Date, { previousInviteId, selectionSource }: InviteOptions = {}): Promise<Invite> {
  if (!isUuid(memberId) || (previousInviteId !== undefined && !isUuid(previousInviteId))) throw new AccessDeniedError();
  if (memberId === gathering.host.memberId) invalid("The Host cannot Invite themselves.");
  const [member] = await db.select({ memberId: members.id, name: members.name }).from(members)
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId),
      selectionSource ? eq(members.status, "active") : inArray(members.status, VISIBLE_MEMBER_STATUSES),
      selectionSource && gathering.place.kind === "physical" ? eq(members.siteId, gathering.place.siteId) : undefined)).for("update");
  if (!member && selectionSource) invalid(selectionSource === "proposal"
    ? "A selected invitee is no longer eligible. Reject this Event proposal with a note asking the proposer to submit again with eligible invitees."
    : "This Suggestion is no longer available. Refresh the page.");
  if (!member) throw new AccessDeniedError();
  const [existing] = await db.select({ id: invites.id, state: invites.state }).from(invites)
    .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, gathering.id), eq(invites.memberId, memberId)));
  if (existing && (existing.state === "pending" || previousInviteId !== existing.id)) return { ...existing, ...inviteTarget(gathering), member };
  if (gathering.participants.some((person) => person.memberId === memberId)) invalid("This Member is already a Participant.");
  if (existing) await supersedeDeliveries(db, actor.organisationId, gathering.id, "invite-received", now, memberId);
  const [created] = existing
    ? await db.update(invites).set({ id: randomUUID(), state: "pending", createdAt: now })
      .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, existing.id))).returning()
    : await db.insert(invites).values({ organisationId: actor.organisationId, gatheringId: gathering.id, memberId, createdAt: now }).returning();
  if (!created) throw new Error("Invite creation returned no row");
  await notify(db, actor.organisationId, gathering, [memberId], "invite-received", `${firstName(hostName)} invited you to ${gathering.kind === "event" ? "an Event" : "a Meetup"}.`, now);
  return { id: created.id, ...inviteTarget(gathering), member, state: created.state };
}

export async function inviteChoices(deps: Deps, actor: Actor, id: string, input: InviteSearch, kind: GatheringKind = "meetup"): Promise<InviteChoices> {
  await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) throw new AccessDeniedError();
  const parsed = z.object({
    name: z.string().trim().max(200).optional().default(""),
    page: z.number().int().min(0).max(1_000_000).optional().default(0),
  }).safeParse(input);
  if (!parsed.success) invalid("Enter a Member name of up to 200 characters and choose a valid page.");
  const pattern = `%${parsed.data.name.replace(/[\\%_]/g, "\\$&")}%`;
  const [gathering] = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(gatheringWhere(actor.organisationId, id), eq(gatherings.kind, kind), eq(gatherings.hostMemberId, actor.memberId),
      eq(gatherings.status, "scheduled"), gt(gatherings.startsAt, deps.clock.now())));
  if (!gathering) throw new AccessDeniedError();
  const choices = await deps.db.select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name }).from(members)
    .leftJoin(departments, and(eq(departments.organisationId, members.organisationId), eq(departments.id, members.departmentId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, members.siteId)))
    .where(and(eq(members.organisationId, actor.organisationId), ne(members.id, actor.memberId), inArray(members.status, VISIBLE_MEMBER_STATUSES), ilike(members.name, pattern),
      sql`not exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${members.organisationId} and ${gatheringMembers.gatheringId} = ${id} and ${gatheringMembers.memberId} = ${members.id} and ${gatheringMembers.status} = 'participant')`,
      sql`not exists (select 1 from ${invites} where ${invites.organisationId} = ${members.organisationId} and ${invites.gatheringId} = ${id} and ${invites.memberId} = ${members.id})`))
    .orderBy(members.name, members.id).offset(parsed.data.page * INVITE_PAGE_SIZE).limit(INVITE_PAGE_SIZE + 1);
  return { members: choices.slice(0, INVITE_PAGE_SIZE), hasMore: choices.length > INVITE_PAGE_SIZE };
}

function gatheringWhere(organisationId: string, id: string) {
  return and(eq(gatherings.organisationId, organisationId), eq(gatherings.id, id));
}

export async function answerInvite(deps: Deps, actor: Actor, id: string, answer: "accept" | "decline"): Promise<InviteAnswer> {
  return withActiveMember(deps, actor, async (db, current) => {
    if (!isUuid(id)) throw new AccessDeniedError();
    if (answer !== "accept" && answer !== "decline") invalid("Choose Accept or Decline.");
    const [invite] = await db.select().from(invites)
      .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, id), eq(invites.memberId, actor.memberId)));
    if (!invite) throw new AccessDeniedError();
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, invite.gatheringId, current.siteId, now);
    const state = answer === "accept" ? "accepted" : "declined";
    let membership = gathering.membership === "host"
      ? gathering.participants.some((person) => person.memberId === actor.memberId) ? "participant" as const
        : gathering.waitlist?.some((person) => person.memberId === actor.memberId) ? "waitlisted" as const : null
      : gathering.membership;
    if (invite.state === state) return { ...inviteTarget(gathering), state, membership };
    if (invite.state !== "pending") invalid("This Invite has already been answered or has expired.");
    if (answer === "accept" && membership !== "participant") {
      membership = gathering.capacity === null || gathering.participantCount < gathering.capacity ? "participant" : "waitlisted";
      let position: number | undefined;
      if (membership === "waitlisted") {
        const [front] = await db.select({ position: gatheringMembers.position }).from(gatheringMembers)
          .where(and(membershipWhere(actor.organisationId, gathering.id), eq(gatheringMembers.status, "waitlisted")))
          .orderBy(gatheringMembers.position).limit(1);
        position = Math.min(0, front?.position ?? 0) - 1;
      }
      await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: gathering.id, memberId: actor.memberId, status: membership, position })
        .onConflictDoUpdate({ target: [gatheringMembers.organisationId, gatheringMembers.gatheringId, gatheringMembers.memberId], set: { status: membership, position } });
    }
    if (answer === "accept" && gathering.recurrence) await saveRsvp(db, actor, gathering.id, "going");
    await db.update(invites).set({ state }).where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, id)));
    let message = `${firstName(current.name)} ${state} your Invite${gathering.kind === "event" ? " to this Event" : ""}.`;
    if (answer === "decline" && membership === "waitlisted") message += " They remain on the waitlist.";
    if (answer === "decline" && membership === "participant") message += " They remain a Participant.";
    await notify(db, actor.organisationId, gathering, [gathering.host.memberId],
      answer === "accept" ? "invite-accepted" : "invite-declined", message, now);
    return { ...inviteTarget(gathering), state, membership };
  });
}

export async function expireInvites(deps: Deps): Promise<void> {
  const due = (now: Date) => and(eq(invites.state, "pending"),
    sql`exists (select 1 from ${gatherings} where ${gatherings.organisationId} = ${invites.organisationId} and ${gatherings.id} = ${invites.gatheringId} and (${gatherings.startsAt} <= ${now} or ${gatherings.status} <> 'scheduled'))`);
  const pending = await deps.db.selectDistinct({ organisationId: invites.organisationId }).from(invites).where(due(deps.clock.now()));
  for (const { organisationId } of pending) {
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
      await db.update(invites).set({ state: "expired" }).where(and(eq(invites.organisationId, organisationId), due(deps.clock.now())));
    });
  }
}

export async function editMeetup(deps: Deps, actor: Actor, id: string, input: EditMeetupInput | EditEventInput, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    requireHost(gathering, actor);
    const parsed = (kind === "meetup" ? meetupSchema : eventSchema).omit({ activityId: true, audience: true, invitedMemberIds: true, availabilityOverlap: true, recurrence: true }).safeParse(input);
    if (!parsed.success) invalid(kind === "meetup" ? "Choose a valid start time and Place, a duration from 1 to 1440 minutes and capacity from 2 to 30." : "Choose a valid start time and Place, a duration from 1 to 1440 minutes and an optional positive capacity.");
    const data = parsed.data;
    if (data.startsAt <= now) invalid("Choose a future start time.");
    if (data.capacity !== null && data.capacity < gathering.participantCount) invalid("Capacity cannot be smaller than the current Participant count.");
    if (data.place.kind === "physical" && (gathering.place.kind !== "physical" || data.place.siteId !== gathering.place.siteId)) {
      await validSite(db, actor.organisationId, data.place.siteId);
    }
    const timeOrPlaceChanged = data.startsAt.getTime() !== gathering.startsAt.getTime()
      || JSON.stringify(placeColumns(data.place)) !== JSON.stringify(placeColumns(gathering.place));
    const changed = timeOrPlaceChanged || data.durationMinutes !== gathering.durationMinutes;
    await db.update(gatherings).set({
      startsAt: data.startsAt, durationMinutes: data.durationMinutes, ...placeColumns(data.place), capacity: data.capacity, description: data.description,
    }).where(gatheringWhere(actor.organisationId, id));
    if (gathering.recurrence && timeOrPlaceChanged) {
      await supersedeDeliveries(db, actor.organisationId, id, "rsvp-prompt", now);
      await db.update(gatheringRsvps).set({ promptedAt: null }).where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id)));
    }
    if (data.relevantInterests) await saveRelevantInterests(db, actor.organisationId, id, data.relevantInterests, now);
    const updated = (await readGathering(db, actor, id, current.siteId, now))!;
    if (changed) {
      await supersedeDeliveries(db, actor.organisationId, id, "meetup-edited", now);
      await notify(db, actor.organisationId, updated,
        (await noticeRecipients(db, actor.organisationId, gathering.id)).filter((memberId) => memberId !== actor.memberId),
        "meetup-edited", `The Host changed the time or Place of this ${meetupOrEvent(gathering)}.`, now);
    }
    await promoteWaitlist(db, actor.organisationId, updated, now);
  });
}

export async function handOverMeetup(deps: Deps, actor: Actor, id: string, participantMemberId: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    requireHost(gathering, actor);
    const nextHost = gathering.participants.find((person) => person.memberId === participantMemberId && person.memberId !== actor.memberId);
    if (!nextHost) invalid("Choose another Participant as Host.");
    const [active] = await db.select({ id: members.id }).from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, nextHost.memberId), eq(members.status, "active")));
    if (!active) invalid("Choose an Active Participant as Host.");
    await retainHostForAttendance(db, actor.organisationId, id, actor.memberId);
    await db.update(gatherings).set({ hostMemberId: nextHost.memberId }).where(gatheringWhere(actor.organisationId, id));
    await notify(db, actor.organisationId, gathering, await noticeRecipients(db, actor.organisationId, gathering.id),
      "meetup-handed-over", `${firstName(nextHost.name)} is now Host of this ${meetupOrEvent(gathering)}.`, now);
  });
}

export async function cancelMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const gathering = await requireScheduledGathering(db, actor, id, current.siteId, now, kind);
    requireHost(gathering, actor);
    await cancelOccurrence(db, actor.organisationId, gathering, now);
  });
}

export async function cancelOccurrence(db: Queryable, organisationId: string, gathering: GatheringSummary, now: Date, message = `The Host cancelled this ${meetupOrEvent(gathering)}.`): Promise<void> {
  const recipients = [gathering.host.memberId, ...await noticeRecipients(db, organisationId, gathering.id)];
  await db.update(gatherings).set({ status: "cancelled" }).where(gatheringWhere(organisationId, gathering.id));
  await db.update(invites).set({ state: "expired" }).where(and(eq(invites.organisationId, organisationId), eq(invites.gatheringId, gathering.id), eq(invites.state, "pending")));
  await notify(db, organisationId, gathering, recipients, "meetup-cancelled", message, now);
  await db.delete(gatheringMembers).where(and(membershipWhere(organisationId, gathering.id), eq(gatheringMembers.status, "waitlisted")));
}
