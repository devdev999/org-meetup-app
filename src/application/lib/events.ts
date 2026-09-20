import { and, eq, inArray } from "drizzle-orm";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { relevantInterestsFor } from "./meetup-interests";
import { createGathering, listGatherings, noticeRecipients, notify, publishGathering, readMeetup, readMeetupDetail, type CreateEventInput, type EventDetail, type EventSummary, type MeetupPerson } from "./meetups";
import type { RecurrenceInput } from "./recurrence-records";
import { activities, eventProposals, gatherings, members, sites } from "./schema";

export interface EventProposal extends Pick<EventSummary, "id" | "activity" | "startsAt" | "durationMinutes" | "place" | "capacity" | "audience" | "description"> {
  state: "proposed" | "approved" | "rejected";
  note: string | null;
  proposer: MeetupPerson;
  recurrence: RecurrenceInput | null;
  relevantInterests: EventDetail["relevantInterests"];
  invitedMemberIds: string[];
}

export type ManagedEvent = Pick<EventSummary, "id" | "kind" | "activity" | "host" | "status" | "startsAt">;

export async function managedEvents(db: Queryable, actor: Actor): Promise<ManagedEvent[]> {
  const rows = await db.select({ id: gatherings.id, startsAt: gatherings.startsAt, status: gatherings.status,
    activity: { id: activities.id, name: activities.name }, host: { memberId: members.id, name: members.name } }).from(gatherings)
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .innerJoin(members, and(eq(members.organisationId, gatherings.organisationId), eq(members.id, gatherings.hostMemberId)))
    .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.kind, "event"), inArray(gatherings.status, ["scheduled", "cancelled", "completed"])))
    .orderBy(gatherings.startsAt, gatherings.id);
  return rows.flatMap(({ status, ...row }) => status === "proposed" || status === "rejected" ? [] : [{ ...row, status, kind: "event" as const }]);
}

export async function proposeEvent(deps: Deps, actor: Actor, input: CreateEventInput): Promise<EventProposal> {
  return withActiveMember(deps, actor, async (db) => {
    const id = await createGathering(db, actor, input, "event", deps.clock.now(), true);
    return (await readEventProposals(db, actor, false, id))[0]!;
  });
}

export async function createEvent(db: Queryable, actor: Actor, input: CreateEventInput, now: Date): Promise<EventDetail> {
  const current = await requireActiveMember(db, actor);
  const id = await createGathering(db, actor, input, "event", now);
  const event = await readMeetupDetail(db, actor, id, current.siteId, now);
  if (event?.kind !== "event") throw new Error("Event creation returned no Event");
  return event;
}

export async function ownEventProposals(deps: Deps, actor: Actor): Promise<EventProposal[]> {
  await requireActiveMember(deps.db, actor);
  return readEventProposals(deps.db, actor, false);
}

export async function readEventProposals(db: Queryable, actor: Actor, admin: boolean, id?: string): Promise<EventProposal[]> {
  const rows = await db.select({ proposal: eventProposals, event: gatherings, proposerName: members.name, activityName: activities.name, siteName: sites.name }).from(eventProposals)
    .innerJoin(gatherings, and(eq(gatherings.organisationId, eventProposals.organisationId), eq(gatherings.id, eventProposals.eventId)))
    .innerJoin(members, and(eq(members.organisationId, eventProposals.organisationId), eq(members.id, eventProposals.proposerMemberId)))
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
    .where(and(eq(eventProposals.organisationId, actor.organisationId), admin ? undefined : eq(eventProposals.proposerMemberId, actor.memberId), id ? eq(eventProposals.eventId, id) : undefined))
    .orderBy(gatherings.createdAt, gatherings.id);
  const interests = Map.groupBy(await relevantInterestsFor(db, actor.organisationId, rows.map(({ event }) => event.id)), (interest) => interest.meetupId);
  return rows.map(({ proposal, event, proposerName, activityName, siteName }) => ({
    id: event.id, state: proposal.state, note: proposal.note, proposer: { memberId: proposal.proposerMemberId, name: proposerName },
    activity: { id: event.activityId, name: activityName }, startsAt: event.startsAt, durationMinutes: event.durationMinutes,
    capacity: event.capacity, description: event.description,
    place: event.placeKind === "physical" ? { kind: "physical" as const, siteId: event.placeSiteId!, spot: event.placeSpot!, siteName: siteName! } : { kind: "virtual" as const, url: event.placeUrl! },
    audience: event.audienceKind === "invite-only" ? { kind: "invite-only" as const }
      : event.audienceScope === "site" ? { kind: "open" as const, scope: "site" as const, siteId: event.audienceSiteId! }
        : { kind: "open" as const, scope: "organisation" as const },
    recurrence: proposal.recurrence, invitedMemberIds: proposal.invitedMemberIds,
    relevantInterests: (interests.get(event.id) ?? []).map(({ meetupId: _, ...interest }) => interest),
  }));
}

async function requireProposal(db: Queryable, actor: Actor, id: string) {
  if (!isUuid(id)) throw new AccessDeniedError();
  const [row] = await db.select({ proposal: eventProposals, event: gatherings }).from(eventProposals)
    .innerJoin(gatherings, and(eq(gatherings.organisationId, eventProposals.organisationId), eq(gatherings.id, eventProposals.eventId)))
    .where(and(eq(eventProposals.organisationId, actor.organisationId), eq(eventProposals.eventId, id), eq(gatherings.kind, "event")));
  if (!row) throw new AccessDeniedError();
  return row;
}

export async function approveEvent(db: Queryable, actor: Actor, id: string, now: Date, note = ""): Promise<void> {
  const row = await requireProposal(db, actor, id);
  if (typeof note !== "string" || note.trim().length > 2000) throw new InvalidInputError("invalid-event", "Give an approval note of up to 2000 characters.");
  if (row.proposal.state === "approved") return;
  if (row.proposal.state !== "proposed") throw new InvalidInputError("invalid-event", "This Event proposal has already been rejected.");
  await publishGathering(db, { organisationId: actor.organisationId, memberId: row.proposal.proposerMemberId }, row.event, row.proposal.recurrence, row.proposal.invitedMemberIds, now);
  await db.update(eventProposals).set({ state: "approved", note: note.trim() || null }).where(and(eq(eventProposals.organisationId, actor.organisationId), eq(eventProposals.eventId, id)));
}

export async function rejectEvent(db: Queryable, actor: Actor, id: string, note: string): Promise<void> {
  const row = await requireProposal(db, actor, id);
  if (typeof note !== "string" || !note.trim() || note.trim().length > 2000) throw new InvalidInputError("invalid-event", "Give a rejection note of up to 2000 characters.");
  const message = note.trim();
  if (row.proposal.state === "rejected" && row.proposal.note === message) return;
  if (row.proposal.state !== "proposed") throw new InvalidInputError("invalid-event", "This Event proposal has already been decided.");
  await db.update(eventProposals).set({ state: "rejected", note: message }).where(and(eq(eventProposals.organisationId, actor.organisationId), eq(eventProposals.eventId, id)));
  await db.update(gatherings).set({ status: "rejected" }).where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id)));
}

export async function viewEvent(deps: Deps, actor: Actor, id: string): Promise<EventDetail | undefined> {
  const current = await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) return undefined;
  const event = await readMeetupDetail(deps.db, actor, id, current.siteId, deps.clock.now());
  return event?.kind === "event" ? event : undefined;
}

export async function listEvents(deps: Deps, actor: Actor): Promise<EventSummary[]> {
  return (await listGatherings(deps, actor, "event")).filter((event) => event.kind === "event");
}

export async function reassignEventHost(db: Queryable, actor: Actor, id: string, memberId: string, now: Date): Promise<void> {
  if (!isUuid(id) || !isUuid(memberId)) throw new AccessDeniedError();
  const [row] = await db.select().from(gatherings).where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id), eq(gatherings.kind, "event"), inArray(gatherings.status, ["scheduled", "cancelled", "completed"])));
  if (!row) throw new AccessDeniedError();
  const [nextHost] = await db.select({ id: members.id, name: members.name }).from(members)
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId), eq(members.status, "active")));
  if (!nextHost) throw new InvalidInputError("invalid-event", "Choose an Active Member in your Organisation as Host.");
  if (row.hostMemberId === memberId) return;
  const event = (await readMeetup(db, { organisationId: actor.organisationId, memberId: row.hostMemberId }, id, null, now))!;
  await db.update(gatherings).set({ hostMemberId: memberId }).where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id)));
  await notify(db, actor.organisationId, event, [...await noticeRecipients(db, actor.organisationId, id), row.hostMemberId, memberId], "meetup-handed-over", `${nextHost.name.split(/\s+/)[0]} is now Host of this Event.`, now);
}
