import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { interestChoiceSchema, type Interest, type InterestChoice } from "./interests";
import { relevantInterests, saveRelevantInterests } from "./meetup-interests";
import { recordNotices, supersedeDeliveries } from "./notifications";
import { activities, departments, eventProposals, gatheringMembers, gatheringRsvps, gatherings, invites, members, notices, organisations, recurrenceInterests, recurrenceMembers, recurrences, sites } from "./schema";
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
    const meetup = await readMeetupDetail(db, actor, id, current.siteId, deps.clock.now());
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
  await db.update(gatherings).set({ status: "scheduled", recurrenceId: series?.id, scheduledStartsAt: series ? row.startsAt : undefined }).where(meetupWhere(actor.organisationId, row.id));
  await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: row.id, memberId: actor.memberId, status: "participant" });
  if (series) {
    await db.insert(recurrenceMembers).values({ organisationId: actor.organisationId, recurrenceId: series.id, memberId: actor.memberId });
    await db.insert(gatheringRsvps).values({ organisationId: actor.organisationId, gatheringId: row.id, memberId: actor.memberId });
    const interests = await relevantInterests(db, actor.organisationId, row.id);
    if (interests.length) await db.insert(recurrenceInterests).values(interests.map(({ interestId }) => ({ organisationId: actor.organisationId, recurrenceId: series.id, interestId })));
  }
  const meetup = (await readMeetup(db, actor, row.id, host.siteId, now))!;
  for (const memberId of invitedMemberIds) await saveInvite(db, actor, meetup, memberId, host.name, now, { fromSuggestion: true });
}

export function visibleMeetups(actor: Actor, siteId: string | null, kind?: GatheringKind) {
  return and(
    eq(gatherings.organisationId, actor.organisationId), kind ? eq(gatherings.kind, kind) : undefined,
    inArray(gatherings.status, ["scheduled", "cancelled", "completed"]),
    or(
      eq(gatherings.hostMemberId, actor.memberId),
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

export async function readMeetup(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<ReadGathering | undefined> {
  return (await readMeetups(db, actor, [id], siteId, now))[0];
}

export async function readMeetups(db: Queryable, actor: Actor, ids: string[], siteId: string | null, now: Date): Promise<ReadGathering[]> {
  if (!ids.length) return [];
  const rows = await db.select({ meetup: gatherings, activityName: activities.name, hostName: members.name, siteName: sites.name })
    .from(gatherings)
    .innerJoin(activities, and(eq(activities.id, gatherings.activityId), eq(activities.organisationId, gatherings.organisationId)))
    .innerJoin(members, and(eq(members.id, gatherings.hostMemberId), eq(members.organisationId, gatherings.organisationId)))
    .leftJoin(sites, and(eq(sites.id, gatherings.placeSiteId), eq(sites.organisationId, gatherings.organisationId)))
    .where(and(visibleMeetups(actor, siteId), inArray(gatherings.id, ids)))
    .orderBy(gatherings.startsAt, gatherings.id);
  if (!rows.length) return [];
  const allPeople = await db.select({ meetupId: gatheringMembers.gatheringId, memberId: members.id, name: members.name, status: gatheringMembers.status })
    .from(gatheringMembers)
    .innerJoin(members, and(eq(members.id, gatheringMembers.memberId), eq(members.organisationId, gatheringMembers.organisationId)))
    .where(and(eq(gatheringMembers.organisationId, actor.organisationId), inArray(gatheringMembers.gatheringId, rows.map((row) => row.meetup.id))))
    .orderBy(asc(gatheringMembers.position));
  const peopleByMeetup = Map.groupBy(allPeople, (person) => person.meetupId);
  const answers = await db.select({ meetupId: gatheringRsvps.gatheringId, memberId: members.id, name: members.name, answer: gatheringRsvps.answer }).from(gatheringRsvps)
    .innerJoin(members, and(eq(members.organisationId, gatheringRsvps.organisationId), eq(members.id, gatheringRsvps.memberId)))
    .where(and(eq(gatheringRsvps.organisationId, actor.organisationId), inArray(gatheringRsvps.gatheringId, rows.map((row) => row.meetup.id))));
  const answersByMeetup = Map.groupBy(answers, (answer) => answer.meetupId);
  const series = await readRecurrences(db, actor, [...new Set(rows.flatMap(({ meetup }) => meetup.recurrenceId ? [meetup.recurrenceId] : []))], siteId, now);
  return rows.map((row): ReadGathering => {
    const meetup = row.meetup;
    const people = peopleByMeetup.get(meetup.id) ?? [];
    const isHost = meetup.hostMemberId === actor.memberId;
    const membership = isHost ? "host" : people.find((person) => person.memberId === actor.memberId)?.status ?? null;
    const participants = people.filter((person) => person.status === "participant");
    const rsvps = new Map(people.map(({ memberId, name }) => [memberId, { memberId, name, answer: "going" as RsvpAnswer | null }]));
    for (const { memberId, name, answer } of answersByMeetup.get(meetup.id) ?? []) rsvps.set(memberId, { memberId, name, answer });
    return {
      ...(meetup.kind === "meetup" ? { kind: "meetup" as const, capacity: meetup.capacity! } : { kind: "event" as const, capacity: meetup.capacity }),
      id: meetup.id, activity: { id: meetup.activityId, name: row.activityName }, host: { memberId: meetup.hostMemberId, name: row.hostName },
      startsAt: meetup.startsAt, durationMinutes: meetup.durationMinutes, description: meetup.description,
      status: meetup.status === "cancelled" ? "cancelled" : meetup.status === "completed" ? "completed" : "scheduled",
      place: meetup.placeKind === "physical"
        ? { kind: "physical", siteId: meetup.placeSiteId!, spot: meetup.placeSpot!, siteName: row.siteName! }
        : { kind: "virtual", url: meetup.placeUrl! },
      audience: meetup.audienceKind === "invite-only" ? { kind: "invite-only" }
        : meetup.audienceScope === "site" ? { kind: "open", scope: "site", siteId: meetup.audienceSiteId! }
          : { kind: "open", scope: "organisation" },
      participantCount: participants.length, membership, canChange: meetup.status === "scheduled" && meetup.startsAt > now,
      recurrence: meetup.recurrenceId ? series.get(meetup.recurrenceId) ?? null : null,
      rsvp: rsvps.get(actor.memberId)?.answer ?? null,
      rsvps: isHost ? [...rsvps.values()].sort((a, b) => a.name.localeCompare(b.name) || a.memberId.localeCompare(b.memberId)) : null,
      participants: isHost || membership === "participant" ? participants.map(({ memberId, name }) => ({ memberId, name })) : [],
      waitlist: isHost ? people.filter((person) => person.status === "waitlisted").map(({ memberId, name }) => ({ memberId, name })) : null,
    };
  });
}

export async function readMeetupDetail(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<GatheringDetail | undefined> {
  const meetup = await readMeetup(db, actor, id, siteId, now);
  if (!meetup) return undefined;
  const isHost = meetup.membership === "host";
  const rows = await db.select({ id: invites.id, member: { memberId: members.id, name: members.name }, state: invites.state })
    .from(invites).innerJoin(members, and(eq(members.id, invites.memberId), eq(members.organisationId, invites.organisationId)))
    .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, id), isHost ? undefined : eq(invites.memberId, actor.memberId)))
    .orderBy(invites.createdAt, invites.id);
  const inviteRows = rows.map((row) => ({ ...row, ...inviteTarget(meetup) }));
  return { ...meetup, relevantInterests: await relevantInterests(db, actor.organisationId, id), invite: inviteRows.find((invite) => invite.member.memberId === actor.memberId) ?? null, invites: isHost ? inviteRows : null };
}

export async function viewMeetup(deps: Deps, actor: Actor, id: string): Promise<MeetupDetail | undefined> {
  const current = await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) return undefined;
  const meetup = await readMeetupDetail(deps.db, actor, id, current.siteId, deps.clock.now());
  return meetup?.kind === "meetup" ? meetup : undefined;
}

export async function listMeetups(deps: Deps, actor: Actor): Promise<MeetupSummary[]> {
  return (await listGatherings(deps, actor, "meetup")).filter((meetup) => meetup.kind === "meetup");
}

export async function listGatherings(deps: Deps, actor: Actor, kind: GatheringKind): Promise<GatheringSummary[]> {
  const current = await requireActiveMember(deps.db, actor);
  const rows = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(visibleMeetups(actor, current.siteId, kind), gt(gatherings.startsAt, deps.clock.now())))
    .orderBy(gatherings.startsAt, gatherings.id);
  const results = await readMeetups(deps.db, actor, rows.map((row) => row.id), current.siteId, deps.clock.now());
  return results.map(({ participants, waitlist, rsvps, ...summary }) => summary);
}

export async function requireScheduledMeetup(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date, kind?: GatheringKind) {
  if (!isUuid(id)) throw new AccessDeniedError();
  const meetup = await readMeetup(db, actor, id, siteId, now);
  if (!meetup || kind && meetup.kind !== kind) throw new AccessDeniedError();
  if (!meetup.canChange) invalid(`This ${meetup.kind === "event" ? "Event" : "Meetup"} is no longer open for changes.`);
  return meetup;
}

function membershipWhere(organisationId: string, meetupId: string) {
  return and(eq(gatheringMembers.organisationId, organisationId), eq(gatheringMembers.gatheringId, meetupId));
}

function firstName(name: string) {
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

export async function notify(db: Queryable, organisationId: string, meetup: GatheringSummary, recipients: string[], kind: Notice["kind"], message: string, now: Date) {
  const place = meetup.place.kind === "physical" ? `${meetup.place.spot}, ${meetup.place.siteName}` : meetup.place.url;
  const time = `${meetup.startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const externalPlace = meetup.place.kind === "physical" ? place : "Online";
  const line = (at: string) => `${message} ${meetup.activity.name}, ${time}, ${at}.`;
  await recordNotices(db, organisationId, recipients, {
    gatheringId: meetup.id, kind, message: line(place), externalMessage: line(externalPlace),
  }, now);
}

export async function inbox(deps: Deps, actor: Actor): Promise<Notice[]> {
  await requireActiveMember(deps.db, actor);
  const rows = await deps.db.select({ id: notices.id, kind: notices.kind, meetupId: notices.gatheringId, message: notices.message, createdAt: notices.createdAt, meetingKind: gatherings.kind })
    .from(notices).leftJoin(gatherings, and(eq(gatherings.organisationId, notices.organisationId), eq(gatherings.id, notices.gatheringId)))
    .where(and(eq(notices.organisationId, actor.organisationId), eq(notices.memberId, actor.memberId)))
    .orderBy(desc(notices.position));
  return rows.map(({ meetingKind, ...notice }) => meetingKind === "event" ? { ...notice, meetupId: null, eventId: notice.meetupId! } : notice);
}

export function meetupOrEvent(meetup: { kind: GatheringKind }): "Meetup" | "Event" {
  return meetup.kind === "event" ? "Event" : "Meetup";
}

function inviteTarget(meetup: { id: string; kind: GatheringKind }): InviteTarget {
  return meetup.kind === "event" ? { eventId: meetup.id } : { meetupId: meetup.id };
}

export async function joinMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<"participant" | "waitlisted"> {
  return withActiveMember(deps, actor, async (db, current) => {
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, deps.clock.now(), kind);
    if (!meetup.membership && !meetup.recurrence?.isStanding && meetup.rsvp === null && meetup.audience.kind !== "open") throw new AccessDeniedError();
    const status = await takePlace(db, actor.organisationId, meetup, current, deps.clock.now());
    if (meetup.recurrence) await saveRsvp(db, actor, id, "going");
    return status;
  });
}

export async function takePlace(db: Queryable, organisationId: string, meetup: GatheringSummary, member: { id: string; name: string }, now: Date): Promise<"participant" | "waitlisted"> {
  const entries = await db.select({ memberId: gatheringMembers.memberId, status: gatheringMembers.status }).from(gatheringMembers).where(membershipWhere(organisationId, meetup.id));
  const existing = entries.find((entry) => entry.memberId === member.id);
  if (existing) return existing.status;
  const status = (meetup.capacity === null || entries.filter((entry) => entry.status === "participant").length < meetup.capacity) ? "participant" : "waitlisted";
  await db.insert(gatheringMembers).values({ organisationId, gatheringId: meetup.id, memberId: member.id, status });
  if (status === "participant") await notify(db, organisationId, meetup, [meetup.host.memberId], "meetup-joined", `${firstName(member.name)} joined your ${meetupOrEvent(meetup)}.`, now);
  return status;
}

export async function releasePlace(db: Queryable, organisationId: string, meetup: GatheringSummary, member: { id: string; name: string }, now: Date): Promise<void> {
  const [removed] = await db.delete(gatheringMembers).where(and(membershipWhere(organisationId, meetup.id), eq(gatheringMembers.memberId, member.id))).returning({ status: gatheringMembers.status });
  if (removed?.status === "participant" && meetup.canChange) {
    await notify(db, organisationId, meetup, [meetup.host.memberId], "meetup-left", `${firstName(member.name)} left your ${meetupOrEvent(meetup)}.`, now);
    await promoteWaitlist(db, organisationId, meetup, now);
  }
}

export async function promoteWaitlist(db: Queryable, organisationId: string, meetup: GatheringSummary, now: Date) {
  const entries = await db.select().from(gatheringMembers).where(membershipWhere(organisationId, meetup.id)).orderBy(gatheringMembers.position);
  const spaces = meetup.capacity === null ? entries.length : meetup.capacity - entries.filter((entry) => entry.status === "participant").length;
  const promoted = entries.filter((entry) => entry.status === "waitlisted").slice(0, spaces);
  for (const entry of promoted) {
    await db.update(gatheringMembers).set({ status: "participant" }).where(and(membershipWhere(organisationId, meetup.id), eq(gatheringMembers.memberId, entry.memberId)));
  }
  await notify(db, organisationId, meetup, promoted.map((entry) => entry.memberId), "meetup-promoted", `A spot opened. You are now a Participant in this ${meetupOrEvent(meetup)}.`, now);
}

export async function leaveMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now, kind);
    if (meetup.membership === "host") invalid(`Hand over or cancel your ${meetupOrEvent(meetup)} before leaving.`);
    if (!meetup.membership) return;
    await releasePlace(db, actor.organisationId, meetup, current, now);
    if (meetup.recurrence?.isStanding) {
      await saveRsvp(db, actor, id, "not-going");
    } else await db.delete(gatheringRsvps).where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id), eq(gatheringRsvps.memberId, actor.memberId)));
  });
}

function requireHost(meetup: GatheringSummary, actor: Actor) {
  if (meetup.host.memberId !== actor.memberId) throw new AccessDeniedError();
}

interface InviteOptions { previousInviteId?: string; fromSuggestion?: boolean }

export async function inviteMember(deps: Deps, actor: Actor, id: string, memberId: string, options: InviteOptions = {}, kind: GatheringKind = "meetup"): Promise<Invite> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now, kind);
    requireHost(meetup, actor);
    return saveInvite(db, actor, meetup, memberId, current.name, now, options);
  });
}

async function saveInvite(db: Queryable, actor: Actor, meetup: GatheringSummary & Pick<MeetupDetail, "participants">, memberId: string, hostName: string, now: Date, { previousInviteId, fromSuggestion = false }: InviteOptions = {}): Promise<Invite> {
  if (!isUuid(memberId) || (previousInviteId !== undefined && !isUuid(previousInviteId))) throw new AccessDeniedError();
  const [member] = await db.select({ memberId: members.id, name: members.name }).from(members)
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId),
      fromSuggestion ? eq(members.status, "active") : inArray(members.status, VISIBLE_MEMBER_STATUSES),
      fromSuggestion && meetup.place.kind === "physical" ? eq(members.siteId, meetup.place.siteId) : undefined)).for("update");
  if (!member && fromSuggestion) invalid("This Suggestion is no longer available. Refresh the page.");
  if (!member) throw new AccessDeniedError();
  const [existing] = await db.select({ id: invites.id, state: invites.state }).from(invites)
    .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, meetup.id), eq(invites.memberId, memberId)));
  if (existing && (existing.state === "pending" || previousInviteId !== existing.id)) return { ...existing, ...inviteTarget(meetup), member };
  if (meetup.participants.some((person) => person.memberId === memberId)) invalid("This Member is already a Participant.");
  if (existing) await supersedeDeliveries(db, actor.organisationId, meetup.id, "invite-received", now, memberId);
  const [created] = existing
    ? await db.update(invites).set({ id: randomUUID(), state: "pending", createdAt: now })
      .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, existing.id))).returning()
    : await db.insert(invites).values({ organisationId: actor.organisationId, gatheringId: meetup.id, memberId, createdAt: now }).returning();
  if (!created) throw new Error("Invite creation returned no row");
  await notify(db, actor.organisationId, meetup, [memberId], "invite-received", `${firstName(hostName)} invited you to ${meetup.kind === "event" ? "an Event" : "a Meetup"}.`, now);
  return { id: created.id, ...inviteTarget(meetup), member, state: created.state };
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
  const [meetup] = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(meetupWhere(actor.organisationId, id), eq(gatherings.kind, kind), eq(gatherings.hostMemberId, actor.memberId),
      eq(gatherings.status, "scheduled"), gt(gatherings.startsAt, deps.clock.now())));
  if (!meetup) throw new AccessDeniedError();
  const choices = await deps.db.select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name }).from(members)
    .leftJoin(departments, and(eq(departments.organisationId, members.organisationId), eq(departments.id, members.departmentId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, members.siteId)))
    .where(and(eq(members.organisationId, actor.organisationId), inArray(members.status, VISIBLE_MEMBER_STATUSES), ilike(members.name, pattern),
      sql`not exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${members.organisationId} and ${gatheringMembers.gatheringId} = ${id} and ${gatheringMembers.memberId} = ${members.id} and ${gatheringMembers.status} = 'participant')`,
      sql`not exists (select 1 from ${invites} where ${invites.organisationId} = ${members.organisationId} and ${invites.gatheringId} = ${id} and ${invites.memberId} = ${members.id})`))
    .orderBy(members.name, members.id).offset(parsed.data.page * INVITE_PAGE_SIZE).limit(INVITE_PAGE_SIZE + 1);
  return { members: choices.slice(0, INVITE_PAGE_SIZE), hasMore: choices.length > INVITE_PAGE_SIZE };
}

function meetupWhere(organisationId: string, id: string) {
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
    const meetup = await requireScheduledMeetup(db, actor, invite.gatheringId, current.siteId, now);
    const state = answer === "accept" ? "accepted" : "declined";
    let membership = meetup.membership === "host"
      ? meetup.participants.some((person) => person.memberId === actor.memberId) ? "participant" as const
        : meetup.waitlist?.some((person) => person.memberId === actor.memberId) ? "waitlisted" as const : null
      : meetup.membership;
    if (invite.state === state) return { ...inviteTarget(meetup), state, membership };
    if (invite.state !== "pending") invalid("This Invite has already been answered or has expired.");
    if (answer === "accept" && membership !== "participant") {
      membership = meetup.capacity === null || meetup.participantCount < meetup.capacity ? "participant" : "waitlisted";
      let position: number | undefined;
      if (membership === "waitlisted") {
        const [front] = await db.select({ position: gatheringMembers.position }).from(gatheringMembers)
          .where(and(membershipWhere(actor.organisationId, meetup.id), eq(gatheringMembers.status, "waitlisted")))
          .orderBy(gatheringMembers.position).limit(1);
        position = Math.min(0, front?.position ?? 0) - 1;
      }
      await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: meetup.id, memberId: actor.memberId, status: membership, position })
        .onConflictDoUpdate({ target: [gatheringMembers.organisationId, gatheringMembers.gatheringId, gatheringMembers.memberId], set: { status: membership, position } });
    }
    if (answer === "accept" && meetup.recurrence) await saveRsvp(db, actor, meetup.id, "going");
    await db.update(invites).set({ state }).where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, id)));
    let message = `${firstName(current.name)} ${state} your Invite.`;
    if (answer === "decline" && membership === "waitlisted") message += " They remain on the waitlist.";
    if (answer === "decline" && membership === "participant") message += " They remain a Participant.";
    await notify(db, actor.organisationId, meetup, [meetup.host.memberId],
      answer === "accept" ? "invite-accepted" : "invite-declined", message, now);
    return { ...inviteTarget(meetup), state, membership };
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
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now, kind);
    requireHost(meetup, actor);
    const parsed = (kind === "meetup" ? meetupSchema : eventSchema).omit({ activityId: true, audience: true, invitedMemberIds: true, availabilityOverlap: true, recurrence: true }).safeParse(input);
    if (!parsed.success) invalid(kind === "meetup" ? "Choose a valid start time and Place, a duration from 1 to 1440 minutes and capacity from 2 to 30." : "Choose a valid start time and Place, a duration from 1 to 1440 minutes and an optional positive capacity.");
    const data = parsed.data;
    if (data.startsAt <= now) invalid("Choose a future start time.");
    if (data.capacity !== null && data.capacity < meetup.participantCount) invalid("Capacity cannot be smaller than the current Participant count.");
    if (data.place.kind === "physical" && (meetup.place.kind !== "physical" || data.place.siteId !== meetup.place.siteId)) {
      await validSite(db, actor.organisationId, data.place.siteId);
    }
    const timeOrPlaceChanged = data.startsAt.getTime() !== meetup.startsAt.getTime()
      || JSON.stringify(placeColumns(data.place)) !== JSON.stringify(placeColumns(meetup.place));
    const changed = timeOrPlaceChanged || data.durationMinutes !== meetup.durationMinutes;
    await db.update(gatherings).set({
      startsAt: data.startsAt, durationMinutes: data.durationMinutes, ...placeColumns(data.place), capacity: data.capacity, description: data.description,
    }).where(meetupWhere(actor.organisationId, id));
    if (meetup.recurrence && timeOrPlaceChanged) {
      await supersedeDeliveries(db, actor.organisationId, id, "rsvp-prompt", now);
      await db.update(gatheringRsvps).set({ promptedAt: null }).where(and(eq(gatheringRsvps.organisationId, actor.organisationId), eq(gatheringRsvps.gatheringId, id)));
    }
    if (data.relevantInterests) await saveRelevantInterests(db, actor.organisationId, id, data.relevantInterests, now);
    const updated = (await readMeetup(db, actor, id, current.siteId, now))!;
    if (changed) {
      await supersedeDeliveries(db, actor.organisationId, id, "invite-received", now);
      await supersedeDeliveries(db, actor.organisationId, id, "meetup-edited", now);
      await notify(db, actor.organisationId, updated,
        (await noticeRecipients(db, actor.organisationId, meetup.id)).filter((memberId) => memberId !== actor.memberId),
        "meetup-edited", `The Host changed the time or Place of this ${meetupOrEvent(meetup)}.`, now);
    }
    await promoteWaitlist(db, actor.organisationId, updated, now);
  });
}

export async function handOverMeetup(deps: Deps, actor: Actor, id: string, participantMemberId: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now, kind);
    requireHost(meetup, actor);
    const nextHost = meetup.participants.find((person) => person.memberId === participantMemberId && person.memberId !== actor.memberId);
    if (!nextHost) invalid("Choose another Participant as Host.");
    const [active] = await db.select({ id: members.id }).from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, nextHost.memberId), eq(members.status, "active")));
    if (!active) invalid("Choose an Active Participant as Host.");
    await db.update(gatherings).set({ hostMemberId: nextHost.memberId }).where(meetupWhere(actor.organisationId, id));
    await notify(db, actor.organisationId, meetup, await noticeRecipients(db, actor.organisationId, meetup.id),
      "meetup-handed-over", `${firstName(nextHost.name)} is now Host of this ${meetupOrEvent(meetup)}.`, now);
  });
}

export async function cancelMeetup(deps: Deps, actor: Actor, id: string, kind: GatheringKind = "meetup"): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now, kind);
    requireHost(meetup, actor);
    await cancelOccurrence(db, actor.organisationId, meetup, now);
  });
}

export async function cancelOccurrence(db: Queryable, organisationId: string, meetup: GatheringSummary, now: Date): Promise<void> {
  const recipients = await noticeRecipients(db, organisationId, meetup.id);
  await db.update(gatherings).set({ status: "cancelled" }).where(meetupWhere(organisationId, meetup.id));
  await db.update(invites).set({ state: "expired" }).where(and(eq(invites.organisationId, organisationId), eq(invites.gatheringId, meetup.id), eq(invites.state, "pending")));
  await notify(db, organisationId, meetup, recipients, "meetup-cancelled", `The Host cancelled this ${meetupOrEvent(meetup)}.`, now);
  await db.delete(gatheringMembers).where(and(membershipWhere(organisationId, meetup.id), eq(gatheringMembers.status, "waitlisted")));
}
