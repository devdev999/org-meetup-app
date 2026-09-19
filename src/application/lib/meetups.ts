import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { recordNotices } from "./notifications";
import { activities, gatheringMembers, gatherings, invites, members, notices, organisations, sites } from "./schema";

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
}

export type EditMeetupInput = Pick<CreateMeetupInput, "startsAt" | "durationMinutes" | "place" | "capacity" | "description">;
export interface MeetupPerson { memberId: string; name: string }
export interface MeetupSummary {
  id: string;
  activity: { id: string; name: string };
  host: MeetupPerson;
  startsAt: Date;
  durationMinutes: number;
  place: MeetupPlace & { siteName?: string };
  capacity: number;
  audience: MeetupAudience;
  description: string;
  status: "scheduled" | "cancelled" | "completed";
  participantCount: number;
  membership: "host" | "participant" | "waitlisted" | null;
  canChange: boolean;
}
export interface MeetupDetail extends MeetupSummary {
  participants: MeetupPerson[];
  waitlist: MeetupPerson[] | null;
  invite: Invite | null;
  invites: Invite[] | null;
}

export interface Invite {
  id: string;
  meetupId: string;
  member: MeetupPerson;
  state: typeof invites.$inferSelect.state;
}

export interface InviteAnswer {
  meetupId: string;
  state: "accepted" | "declined";
  membership: "participant" | "waitlisted" | null;
}

export interface MeetupChoices {
  activities: { id: string; name: string }[];
  sites: { id: string; name: string }[];
  defaultSiteId: string | null;
}

export interface Notice {
  id: string;
  kind: typeof notices.$inferSelect.kind;
  meetupId: string;
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
  audience: z.union([
    z.object({ kind: z.literal("invite-only") }),
    z.object({ kind: z.literal("open"), scope: z.literal("organisation") }),
    z.object({ kind: z.literal("open"), scope: z.literal("site"), siteId: z.uuid() }),
  ]).optional(),
});

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

async function validSite(db: Queryable, organisationId: string, siteId: string) {
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
    const parsed = meetupSchema.safeParse(input);
    if (!parsed.success) invalid("Choose an Activity, a valid start time and Place, a duration from 1 to 1440 minutes and capacity from 2 to 30.");
    const data = parsed.data;
    if (data.startsAt <= deps.clock.now()) invalid("Choose a future start time.");
    const [activity] = await db.select({ id: activities.id }).from(activities)
      .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, data.activityId), eq(activities.retired, false)));
    if (!activity) invalid("Choose a current Activity in your Organisation.");
    if (data.place.kind === "physical") await validSite(db, actor.organisationId, data.place.siteId);
    let audience = data.audience;
    if (!audience) {
      if (data.place.kind === "virtual") audience = { kind: "open", scope: "organisation" };
      else {
        if (!current.siteId) invalid("Set your Site in your profile or choose an audience.");
        audience = { kind: "open", scope: "site", siteId: current.siteId };
      }
    }
    if (audience.kind === "open" && audience.scope === "site") await validSite(db, actor.organisationId, audience.siteId);
    const [created] = await db.insert(gatherings).values({
      organisationId: actor.organisationId, kind: "meetup", hostMemberId: actor.memberId,
      activityId: data.activityId, startsAt: data.startsAt, durationMinutes: data.durationMinutes,
      ...placeColumns(data.place), capacity: data.capacity, description: data.description,
      audienceKind: audience.kind, audienceScope: audience.kind === "open" ? audience.scope : null,
      audienceSiteId: audience.kind === "open" && audience.scope === "site" ? audience.siteId : null,
      status: "scheduled", createdAt: deps.clock.now(),
    }).returning();
    if (!created) throw new Error("Meetup creation returned no row");
    await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: created.id, memberId: actor.memberId, status: "participant" });
    return (await readMeetupDetail(db, actor, created.id, current.siteId, deps.clock.now()))!;
  });
}

function visibleTo(actor: Actor, siteId: string | null) {
  return and(
    eq(gatherings.organisationId, actor.organisationId), eq(gatherings.kind, "meetup"),
    or(
      eq(gatherings.hostMemberId, actor.memberId),
      sql`exists (select 1 from ${invites} where ${invites.organisationId} = ${gatherings.organisationId} and ${invites.gatheringId} = ${gatherings.id} and ${invites.memberId} = ${actor.memberId})`,
      sql`exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${gatherings.organisationId} and ${gatheringMembers.gatheringId} = ${gatherings.id} and ${gatheringMembers.memberId} = ${actor.memberId})`,
      and(eq(gatherings.status, "cancelled"),
        sql`exists (select 1 from ${notices} where ${notices.organisationId} = ${gatherings.organisationId} and ${notices.gatheringId} = ${gatherings.id} and ${notices.memberId} = ${actor.memberId} and ${notices.kind} = 'meetup-cancelled')`),
      and(eq(gatherings.audienceKind, "open"),
        or(eq(gatherings.audienceScope, "organisation"), siteId ? eq(gatherings.audienceSiteId, siteId) : undefined)),
    ),
  );
}

async function readMeetup(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<Omit<MeetupDetail, "invite" | "invites"> | undefined> {
  const [row] = await db.select({ meetup: gatherings, activityName: activities.name, hostName: members.name, siteName: sites.name })
    .from(gatherings)
    .innerJoin(activities, and(eq(activities.id, gatherings.activityId), eq(activities.organisationId, gatherings.organisationId)))
    .innerJoin(members, and(eq(members.id, gatherings.hostMemberId), eq(members.organisationId, gatherings.organisationId)))
    .leftJoin(sites, and(eq(sites.id, gatherings.placeSiteId), eq(sites.organisationId, gatherings.organisationId)))
    .where(and(visibleTo(actor, siteId), eq(gatherings.id, id)));
  if (!row) return undefined;
  const meetup = row.meetup;
  const people = await db.select({ memberId: members.id, name: members.name, status: gatheringMembers.status })
    .from(gatheringMembers)
    .innerJoin(members, and(eq(members.id, gatheringMembers.memberId), eq(members.organisationId, gatheringMembers.organisationId)))
    .where(and(eq(gatheringMembers.organisationId, actor.organisationId), eq(gatheringMembers.gatheringId, id)))
    .orderBy(asc(gatheringMembers.position));
  const isHost = meetup.hostMemberId === actor.memberId;
  const membership = isHost ? "host" : people.find((person) => person.memberId === actor.memberId)?.status ?? null;
  const participants = people.filter((person) => person.status === "participant");
  return {
    id, activity: { id: meetup.activityId, name: row.activityName }, host: { memberId: meetup.hostMemberId, name: row.hostName },
    startsAt: meetup.startsAt, durationMinutes: meetup.durationMinutes, capacity: meetup.capacity, description: meetup.description,
    status: meetup.status === "cancelled" ? "cancelled" : meetup.status === "completed" ? "completed" : "scheduled",
    place: meetup.placeKind === "physical"
      ? { kind: "physical", siteId: meetup.placeSiteId!, spot: meetup.placeSpot!, siteName: row.siteName! }
      : { kind: "virtual", url: meetup.placeUrl! },
    audience: meetup.audienceKind === "invite-only" ? { kind: "invite-only" }
      : meetup.audienceScope === "site" ? { kind: "open", scope: "site", siteId: meetup.audienceSiteId! }
        : { kind: "open", scope: "organisation" },
    participantCount: participants.length, membership, canChange: meetup.status === "scheduled" && meetup.startsAt > now,
    participants: isHost || membership === "participant" ? participants.map(({ memberId, name }) => ({ memberId, name })) : [],
    waitlist: isHost ? people.filter((person) => person.status === "waitlisted").map(({ memberId, name }) => ({ memberId, name })) : null,
  };
}

async function readMeetupDetail(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date): Promise<MeetupDetail | undefined> {
  const meetup = await readMeetup(db, actor, id, siteId, now);
  if (!meetup) return undefined;
  const isHost = meetup.membership === "host";
  const inviteRows = await db.select({ id: invites.id, meetupId: invites.gatheringId, member: { memberId: members.id, name: members.name }, state: invites.state })
    .from(invites).innerJoin(members, and(eq(members.id, invites.memberId), eq(members.organisationId, invites.organisationId)))
    .where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, id), isHost ? undefined : eq(invites.memberId, actor.memberId)))
    .orderBy(invites.createdAt, invites.id);
  return { ...meetup, invite: inviteRows.find((invite) => invite.member.memberId === actor.memberId) ?? null, invites: isHost ? inviteRows : null };
}

export async function viewMeetup(deps: Deps, actor: Actor, id: string): Promise<MeetupDetail | undefined> {
  const current = await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) return undefined;
  return readMeetupDetail(deps.db, actor, id, current.siteId, deps.clock.now());
}

export async function listMeetups(deps: Deps, actor: Actor): Promise<MeetupSummary[]> {
  const current = await requireActiveMember(deps.db, actor);
  const rows = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(visibleTo(actor, current.siteId), gt(gatherings.startsAt, deps.clock.now())))
    .orderBy(gatherings.startsAt, gatherings.id);
  const results = await Promise.all(rows.map((row) => readMeetup(deps.db, actor, row.id, current.siteId, deps.clock.now())));
  return results.filter((meetup) => meetup !== undefined).map(({ participants, waitlist, ...summary }) => summary);
}

async function requireScheduledMeetup(db: Queryable, actor: Actor, id: string, siteId: string | null, now: Date) {
  if (!isUuid(id)) throw new AccessDeniedError();
  const meetup = await readMeetupDetail(db, actor, id, siteId, now);
  if (!meetup) throw new AccessDeniedError();
  if (!meetup.canChange) invalid("This Meetup is no longer open for changes.");
  return meetup;
}

function membershipWhere(organisationId: string, meetupId: string) {
  return and(eq(gatheringMembers.organisationId, organisationId), eq(gatheringMembers.gatheringId, meetupId));
}

function firstName(name: string) {
  return name.split(/\s+/)[0];
}

function noticeRecipients(meetup: MeetupDetail): string[] {
  return [...meetup.participants, ...(meetup.waitlist ?? []), ...(meetup.invites ?? []).filter((invite) => invite.state === "pending").map((invite) => invite.member)]
    .map((person) => person.memberId);
}

async function notify(db: Queryable, organisationId: string, meetup: MeetupSummary, recipients: string[], kind: Notice["kind"], message: string, now: Date) {
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
  return deps.db.select({ id: notices.id, kind: notices.kind, meetupId: notices.gatheringId, message: notices.message, createdAt: notices.createdAt })
    .from(notices).where(and(eq(notices.organisationId, actor.organisationId), eq(notices.memberId, actor.memberId)))
    .orderBy(desc(notices.position));
}

export async function joinMeetup(deps: Deps, actor: Actor, id: string): Promise<"participant" | "waitlisted"> {
  return withActiveMember(deps, actor, async (db, current) => {
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, deps.clock.now());
    if (meetup.membership) return meetup.membership === "host" ? "participant" : meetup.membership;
    if (meetup.audience.kind !== "open") throw new AccessDeniedError();
    const status = meetup.participantCount < meetup.capacity ? "participant" : "waitlisted";
    await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: id, memberId: actor.memberId, status });
    if (status === "participant") await notify(db, actor.organisationId, meetup, [meetup.host.memberId], "meetup-joined", `${firstName(current.name)} joined your Meetup.`, deps.clock.now());
    return status;
  });
}

async function promoteWaitlist(db: Queryable, organisationId: string, meetup: MeetupSummary, now: Date) {
  const entries = await db.select().from(gatheringMembers).where(membershipWhere(organisationId, meetup.id)).orderBy(gatheringMembers.position);
  const spaces = meetup.capacity - entries.filter((entry) => entry.status === "participant").length;
  const promoted = entries.filter((entry) => entry.status === "waitlisted").slice(0, spaces);
  for (const entry of promoted) {
    await db.update(gatheringMembers).set({ status: "participant" }).where(and(membershipWhere(organisationId, meetup.id), eq(gatheringMembers.memberId, entry.memberId)));
  }
  await notify(db, organisationId, meetup, promoted.map((entry) => entry.memberId), "meetup-promoted", "A spot opened. You are now a Participant in this Meetup.", now);
}

export async function leaveMeetup(deps: Deps, actor: Actor, id: string): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now);
    if (meetup.membership === "host") invalid("Hand over or cancel your Meetup before leaving.");
    if (!meetup.membership) return;
    await db.delete(gatheringMembers).where(and(membershipWhere(actor.organisationId, id), eq(gatheringMembers.memberId, actor.memberId)));
    if (meetup.membership === "participant") {
      await notify(db, actor.organisationId, meetup, [meetup.host.memberId], "meetup-left", `${firstName(current.name)} left your Meetup.`, now);
      await promoteWaitlist(db, actor.organisationId, meetup, now);
    }
  });
}

function requireHost(meetup: MeetupSummary, actor: Actor) {
  if (meetup.host.memberId !== actor.memberId) throw new AccessDeniedError();
}

export async function inviteMember(deps: Deps, actor: Actor, id: string, memberId: string): Promise<Invite> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now);
    requireHost(meetup, actor);
    if (!isUuid(memberId)) throw new AccessDeniedError();
    const [member] = await db.select({ memberId: members.id, name: members.name }).from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId), inArray(members.status, VISIBLE_MEMBER_STATUSES)));
    if (!member) throw new AccessDeniedError();
    const existing = meetup.invites?.find((invite) => invite.member.memberId === memberId);
    if (existing) return existing;
    if (meetup.participants.some((person) => person.memberId === memberId)) invalid("This Member is already a Participant.");
    const [created] = await db.insert(invites).values({ organisationId: actor.organisationId, gatheringId: id, memberId, createdAt: now }).returning();
    if (!created) throw new Error("Invite creation returned no row");
    await notify(db, actor.organisationId, meetup, [memberId], "invite-received", `${firstName(current.name)} invited you to a Meetup.`, now);
    return { id: created.id, meetupId: id, member, state: created.state };
  });
}

export async function inviteChoices(deps: Deps, actor: Actor, id: string): Promise<MeetupPerson[]> {
  await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) throw new AccessDeniedError();
  const [meetup] = await deps.db.select({ id: gatherings.id }).from(gatherings)
    .where(and(meetupWhere(actor.organisationId, id), eq(gatherings.hostMemberId, actor.memberId),
      eq(gatherings.status, "scheduled"), gt(gatherings.startsAt, deps.clock.now())));
  if (!meetup) throw new AccessDeniedError();
  return deps.db.select({ memberId: members.id, name: members.name }).from(members)
    .where(and(eq(members.organisationId, actor.organisationId), inArray(members.status, VISIBLE_MEMBER_STATUSES),
      sql`not exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${members.organisationId} and ${gatheringMembers.gatheringId} = ${id} and ${gatheringMembers.memberId} = ${members.id} and ${gatheringMembers.status} = 'participant')`,
      sql`not exists (select 1 from ${invites} where ${invites.organisationId} = ${members.organisationId} and ${invites.gatheringId} = ${id} and ${invites.memberId} = ${members.id})`))
    .orderBy(members.name, members.id);
}

function meetupWhere(organisationId: string, id: string) {
  return and(eq(gatherings.organisationId, organisationId), eq(gatherings.id, id), eq(gatherings.kind, "meetup"));
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
    let membership = meetup.membership === "host" ? "participant" as const : meetup.membership;
    if (invite.state === state) return { meetupId: meetup.id, state, membership };
    if (invite.state !== "pending") invalid("This Invite has already been answered or has expired.");
    if (answer === "accept" && membership !== "participant") {
      membership = meetup.participantCount < meetup.capacity ? "participant" : "waitlisted";
      const [first] = membership === "waitlisted" ? await db.select({ position: gatheringMembers.position }).from(gatheringMembers)
        .where(and(membershipWhere(actor.organisationId, meetup.id), eq(gatheringMembers.status, "waitlisted")))
        .orderBy(gatheringMembers.position).limit(1) : [];
      const position = membership === "waitlisted" ? Math.min(0, first?.position ?? 0) - 1 : undefined;
      await db.insert(gatheringMembers).values({ organisationId: actor.organisationId, gatheringId: meetup.id, memberId: actor.memberId, status: membership, position })
        .onConflictDoUpdate({ target: [gatheringMembers.organisationId, gatheringMembers.gatheringId, gatheringMembers.memberId], set: { status: membership, position } });
    }
    await db.update(invites).set({ state }).where(and(eq(invites.organisationId, actor.organisationId), eq(invites.id, id)));
    await notify(db, actor.organisationId, meetup, [meetup.host.memberId],
      answer === "accept" ? "invite-accepted" : "invite-declined", `${firstName(current.name)} ${state} your Invite.`, now);
    return { meetupId: meetup.id, state, membership };
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

export async function editMeetup(deps: Deps, actor: Actor, id: string, input: EditMeetupInput): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now);
    requireHost(meetup, actor);
    const parsed = meetupSchema.omit({ activityId: true, audience: true }).safeParse(input);
    if (!parsed.success) invalid("Choose a valid start time and Place, a duration from 1 to 1440 minutes and capacity from 2 to 30.");
    const data = parsed.data;
    if (data.startsAt <= now) invalid("Choose a future start time.");
    if (data.capacity < meetup.participantCount) invalid("Capacity cannot be smaller than the current Participant count.");
    if (data.place.kind === "physical" && (meetup.place.kind !== "physical" || data.place.siteId !== meetup.place.siteId)) {
      await validSite(db, actor.organisationId, data.place.siteId);
    }
    const changed = data.startsAt.getTime() !== meetup.startsAt.getTime() || data.durationMinutes !== meetup.durationMinutes
      || JSON.stringify(placeColumns(data.place)) !== JSON.stringify(placeColumns(meetup.place));
    await db.update(gatherings).set({
      startsAt: data.startsAt, durationMinutes: data.durationMinutes, ...placeColumns(data.place), capacity: data.capacity, description: data.description,
    }).where(meetupWhere(actor.organisationId, id));
    const updated = (await readMeetup(db, actor, id, current.siteId, now))!;
    if (changed) await notify(db, actor.organisationId, updated,
      noticeRecipients(meetup).filter((memberId) => memberId !== actor.memberId),
      "meetup-edited", "The Host changed the time or Place of this Meetup.", now);
    await promoteWaitlist(db, actor.organisationId, updated, now);
  });
}

export async function handOverMeetup(deps: Deps, actor: Actor, id: string, participantMemberId: string): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now);
    requireHost(meetup, actor);
    const nextHost = meetup.participants.find((person) => person.memberId === participantMemberId && person.memberId !== actor.memberId);
    if (!nextHost) invalid("Choose another Participant as Host.");
    const [active] = await db.select({ id: members.id }).from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, nextHost.memberId), eq(members.status, "active")));
    if (!active) invalid("Choose an Active Participant as Host.");
    await db.update(gatherings).set({ hostMemberId: nextHost.memberId }).where(meetupWhere(actor.organisationId, id));
    await notify(db, actor.organisationId, meetup, noticeRecipients(meetup),
      "meetup-handed-over", `${firstName(nextHost.name)} is now Host of this Meetup.`, now);
  });
}

export async function cancelMeetup(deps: Deps, actor: Actor, id: string): Promise<void> {
  return withActiveMember(deps, actor, async (db, current) => {
    const now = deps.clock.now();
    const meetup = await requireScheduledMeetup(db, actor, id, current.siteId, now);
    requireHost(meetup, actor);
    await db.update(gatherings).set({ status: "cancelled" }).where(meetupWhere(actor.organisationId, id));
    await db.update(invites).set({ state: "expired" }).where(and(eq(invites.organisationId, actor.organisationId), eq(invites.gatheringId, id), eq(invites.state, "pending")));
    await notify(db, actor.organisationId, meetup, noticeRecipients(meetup), "meetup-cancelled", "The Host cancelled this Meetup.", now);
    await db.delete(gatheringMembers).where(and(membershipWhere(actor.organisationId, id), eq(gatheringMembers.status, "waitlisted")));
  });
}
