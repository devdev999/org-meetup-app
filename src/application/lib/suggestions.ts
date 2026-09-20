import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, type Actor } from "./actor";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { interestChoiceSchema, listInterests, memberInterestList, type Interest, type InterestChoice } from "./interests";
import { relevantInterests } from "./meetup-interests";
import { readMeetup, validSite, visibleMeetups, type InviteChoices, type MeetupSummary } from "./meetups";
import { departments, gatheringInterests, gatheringMembers, gatherings, interests, invites, memberInterests, members, sites } from "./schema";
import { rankInvitees, rankMeetups } from "./suggestion-ranking";

export interface InviteSuggestion {
  member: InviteChoices["members"][number];
  previousInviteId: string | null;
  reasons: string[];
}

export interface MeetupSuggestion {
  meetup: MeetupSummary;
  reasons: string[];
}

export interface PreviewInviteSuggestionsInput {
  seed: string;
  place: { kind: "physical"; siteId: string } | { kind: "virtual" };
  relevantInterests: InterestChoice[];
}

export async function previewInviteSuggestions(deps: Deps, actor: Actor, input: PreviewInviteSuggestionsInput): Promise<InviteSuggestion[]> {
  const host = await requireActiveMember(deps.db, actor);
  const parsed = z.object({
    seed: z.string().min(1).max(100),
    place: z.discriminatedUnion("kind", [z.object({ kind: z.literal("physical"), siteId: z.uuid() }), z.object({ kind: z.literal("virtual") })]),
    relevantInterests: z.array(interestChoiceSchema).max(20),
  }).safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-meetup", "Choose a Place and up to twenty relevant Interests.");
  const data = parsed.data;
  const siteId = data.place.kind === "physical" ? data.place.siteId : undefined;
  if (siteId) await validSite(deps.db, actor.organisationId, siteId);
  const catalog = await listInterests(deps, actor);
  const selected: Interest[] = [];
  for (const { selection } of data.relevantInterests) {
    const existing = "interestId" in selection ? catalog.find((interest) => interest.interestId === selection.interestId)
      : catalog.find((interest) => interest.name.toLowerCase() === selection.name.toLowerCase());
    if ("interestId" in selection && !existing) throw new InvalidInputError("unknown-interest", "Choose an Interest from your Organisation.");
    if (existing) selected.push(existing);
  }
  return candidateSuggestions(deps, actor, { seed: data.seed, siteId, relevantInterests: selected, hostDepartmentId: host.departmentId });
}

export async function meetupSuggestions(deps: Deps, actor: Actor): Promise<MeetupSuggestion[]> {
  const current = await requireActiveMember(deps.db, actor);
  const now = deps.clock.now();
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const meetups = await deps.db.select({ id: gatherings.id, hostMemberId: gatherings.hostMemberId, startsAt: gatherings.startsAt }).from(gatherings)
    .where(and(visibleMeetups(actor, current.siteId), eq(gatherings.status, "scheduled"), eq(gatherings.audienceKind, "open"),
      gt(gatherings.startsAt, now), lte(gatherings.startsAt, until), ne(gatherings.hostMemberId, actor.memberId),
      sql`not exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${gatherings.organisationId} and ${gatheringMembers.gatheringId} = ${gatherings.id} and ${gatheringMembers.memberId} = ${actor.memberId})`));
  if (!meetups.length) return [];
  const [declarations, savedInterests, hostInterests] = await Promise.all([
    memberInterestList(deps, actor),
    deps.db.select({ meetupId: gatheringInterests.gatheringId, interestId: interests.id, name: interests.name, kind: interests.kind })
      .from(gatheringInterests).innerJoin(interests, and(eq(interests.organisationId, gatheringInterests.organisationId), eq(interests.id, gatheringInterests.interestId)))
      .where(and(eq(gatheringInterests.organisationId, actor.organisationId), inArray(gatheringInterests.gatheringId, meetups.map((meetup) => meetup.id)))),
    deps.db.select({ memberId: memberInterests.memberId, interestId: interests.id, name: interests.name, kind: interests.kind, stance: memberInterests.stance })
      .from(memberInterests).innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
      .where(and(eq(memberInterests.organisationId, actor.organisationId), inArray(memberInterests.memberId, [...new Set(meetups.map((meetup) => meetup.hostMemberId))]))),
  ]);
  const interestsByMeetup = Map.groupBy(savedInterests, (interest) => interest.meetupId);
  const interestsByHost = Map.groupBy(hostInterests, (interest) => interest.memberId);
  const ranked = rankMeetups(declarations, meetups.map((meetup) => ({
    meetupId: meetup.id, startsAt: meetup.startsAt, connectionCount: 0,
    interests: interestsByMeetup.get(meetup.id) ?? [], hostInterests: interestsByHost.get(meetup.hostMemberId) ?? [],
  }))).slice(0, 20);
  const results = await Promise.all(ranked.map(async ({ meetupId, reasons }) => {
    const detail = await readMeetup(deps.db, actor, meetupId, current.siteId, now);
    if (!detail || detail.status !== "scheduled" || detail.audience.kind !== "open" || detail.membership !== null) return undefined;
    const { participants, waitlist, ...meetup } = detail;
    return { meetup, reasons };
  }));
  return results.filter((suggestion) => suggestion !== undefined);
}

export async function inviteSuggestions(deps: Deps, actor: Actor, id: string): Promise<InviteSuggestion[]> {
  const host = await requireActiveMember(deps.db, actor);
  if (!isUuid(id)) throw new AccessDeniedError();
  const [meetup] = await deps.db.select().from(gatherings).where(and(
    eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id), eq(gatherings.kind, "meetup"),
    eq(gatherings.hostMemberId, actor.memberId), eq(gatherings.status, "scheduled"), gt(gatherings.startsAt, deps.clock.now()),
  ));
  if (!meetup) throw new AccessDeniedError();
  return candidateSuggestions(deps, actor, {
    seed: id, meetupId: id, siteId: meetup.placeKind === "physical" ? meetup.placeSiteId! : undefined,
    relevantInterests: await relevantInterests(deps.db, actor.organisationId, id), hostDepartmentId: host.departmentId,
  });
}

async function candidateSuggestions(deps: Deps, actor: Actor, input: {
  seed: string; meetupId?: string; siteId?: string; relevantInterests: Interest[]; hostDepartmentId: string | null;
}): Promise<InviteSuggestion[]> {
  const candidates = await deps.db.select({
    memberId: members.id, name: members.name, departmentId: members.departmentId,
    department: departments.name, site: sites.name, previousInviteId: invites.id,
  }).from(members)
    .leftJoin(departments, and(eq(departments.organisationId, members.organisationId), eq(departments.id, members.departmentId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, members.siteId)))
    .leftJoin(invites, input.meetupId ? and(eq(invites.organisationId, members.organisationId), eq(invites.memberId, members.id), eq(invites.gatheringId, input.meetupId)) : sql`false`)
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.status, "active"), ne(members.id, actor.memberId),
      input.siteId ? eq(members.siteId, input.siteId) : undefined,
      or(isNull(invites.id), ne(invites.state, "pending")),
      input.meetupId ? sql`not exists (select 1 from ${gatheringMembers} where ${gatheringMembers.organisationId} = ${members.organisationId} and ${gatheringMembers.gatheringId} = ${input.meetupId} and ${gatheringMembers.memberId} = ${members.id} and ${gatheringMembers.status} = 'participant')` : undefined));
  if (!candidates.length) return [];
  const [declarations, hostInterests] = await Promise.all([
    deps.db.select({ memberId: memberInterests.memberId, interestId: interests.id, name: interests.name, kind: interests.kind, stance: memberInterests.stance })
      .from(memberInterests).innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
      .where(and(eq(memberInterests.organisationId, actor.organisationId), inArray(memberInterests.memberId, candidates.map((candidate) => candidate.memberId)))),
    memberInterestList(deps, actor),
  ]);
  const byId = new Map(candidates.map((candidate) => [candidate.memberId, candidate]));
  const interestsByMember = Map.groupBy(declarations, (interest) => interest.memberId);
  return rankInvitees({
    seed: input.seed, hostDepartmentId: input.hostDepartmentId, hostInterests, relevantInterests: input.relevantInterests,
    candidates: candidates.map((candidate) => ({
      memberId: candidate.memberId, departmentId: candidate.departmentId, connectionCount: 0,
      interests: interestsByMember.get(candidate.memberId) ?? [],
    })),
  }).slice(0, 20).map(({ memberId, reasons }) => {
    const candidate = byId.get(memberId)!;
    return { member: { memberId, name: candidate.name, department: candidate.department, site: candidate.site }, previousInviteId: candidate.previousInviteId, reasons };
  });
}
