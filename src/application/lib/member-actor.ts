import { and, asc, eq, exists, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import { recordAdminView, type AdminView } from "./admin-audit";
import { expireIneligibleAvailabilities } from "./availability-records";
import { findDepartment, findSite, listDepartmentsAndSites, type Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { blankToNull, isUuid } from "./input";
import { organisationAdmin, type OrganisationAdminActions } from "./organisation-admin";
import { platformAdmin, type PlatformAdminActions } from "./platform-admin";
import { answerInvite, cancelMeetup, createMeetup, editMeetup, handOverMeetup, inbox, inviteChoices, inviteMember, joinMeetup, leaveMeetup, listMeetups, meetupChoices, viewMeetup, type CreateMeetupInput, type EditMeetupInput, type Invite, type InviteAnswer, type InviteChoices, type InviteSearch, type MeetupChoices, type MeetupDetail, type MeetupSummary, type Notice } from "./meetups";
import { departments, interestAliases, interests, memberInterests, members, organisations, sites } from "./schema";
import type { InterestKind } from "../ports";
import { confirmInterest, listInterests, memberInterestList, memberInterestsFor, removeInterest, resolveInterest, setInterestStance, type ConfirmInterestInput, type Interest, type InterestResolution, type MemberInterest, type Stance } from "./interests";
import { beginTelegramLink, unlinkTelegram, type TelegramLink } from "./telegram";
import { deliverSoon, notificationSettings, setNoticePreference, type NotificationSettings, type NoticePreference } from "./notifications";
import { eventSuggestions, inviteSuggestions, meetupSuggestions, previewInviteSuggestions, type EventSuggestion, type InviteSuggestion, type MeetupSuggestion, type PreviewInviteSuggestionsInput } from "./suggestions";
import { extractMeetupInterests, type ExtractEventInterestsInput, type ExtractMeetupInterestsInput } from "./meetup-interests";
import { availability, availabilityMeetup, postAvailability, type Availability, type AvailabilityBoard, type AvailabilitySuggestion, type AvailabilityOverlap, type PostAvailabilityInput } from "./availability";
import { answerRsvp, joinSeries, leaveSeries, listSeries, stopSeries, type RecurringMeetup, type RecurringEvent } from "./recurring-meetups";
import type { RsvpAnswer } from "./meetups";
import { listEvents, ownEventProposals, proposeEvent, viewEvent, type EventProposal } from "./events";
import type { CreateEventInput, EditEventInput, EventDetail, EventSummary } from "./meetups";
import { attendance, attendanceHistory, confirmAttendance, connections, rateOccurrence, type Attendance, type AttendanceHistoryEntry, type Connection } from "./attendance";
import { flag, type FlagInput } from "./moderation";

export type MemberStatus = (typeof members.status.enumValues)[number];

/** What a Member sees about themselves. */
export interface Profile {
  memberId: string;
  name: string;
  email: string;
  status: MemberStatus;
  organisation: { slug: string; name: string };
  department: string | null;
  site: string | null;
  isPlatformAdmin: boolean;
  isOrganisationAdmin: boolean;
  /** Null until the Member has acknowledged the notice about what Organisation Admins can see. */
  adminVisibilityNoticeAcknowledgedAt: Date | null;
}

export type AdminVisibilityNotice = Pick<Profile, "name" | "organisation">;

/**
 * Department and Site by name, chosen from the Organisation's own lists and
 * matched ignoring case; null clears the value. Members do not add to the
 * lists: the roster, the login and the Organisation Admin do.
 */
export interface UpdateProfileInput {
  department: string | null;
  site: string | null;
}

/** What a Member sees about another Member of their Organisation. */
export interface MemberSummary {
  memberId: string;
  name: string;
  department: string | null;
  site: string | null;
}

export interface MemberProfile extends MemberSummary {
  interests: MemberInterest[];
}

export interface MemberSearch {
  interest?: string;
  department?: string;
  site?: string;
}

/**
 * The actor-scoped interface: everything a signed-in Member can do. The
 * Organisation is fixed when the actor is created and every query is scoped
 * to it, so nothing a page passes in can reach another Organisation.
 */
export interface MemberActions {
  flag(input: FlagInput): Promise<void>;
  confirmAttendance(id: string, memberIds: string[]): Promise<void>;
  attendance(id: string): Promise<Attendance | undefined>;
  attendanceHistory(): Promise<AttendanceHistoryEntry[]>;
  rateOccurrence(id: string, value: number): Promise<void>;
  connections(): Promise<Connection[]>;
  proposeEvent(input: CreateEventInput): Promise<EventProposal>;
  eventProposals(): Promise<EventProposal[]>;
  listEvents(): Promise<EventSummary[]>;
  listEventSeries(): Promise<RecurringEvent[]>;
  viewEvent(id: string): Promise<EventDetail | undefined>;
  joinEvent(id: string): Promise<"participant" | "waitlisted">;
  leaveEvent(id: string): Promise<void>;
  inviteToEvent(eventId: string, memberId: string): Promise<Invite>;
  eventInviteChoices(eventId: string, input?: InviteSearch): Promise<InviteChoices>;
  editEvent(id: string, input: EditEventInput): Promise<void>;
  cancelEvent(id: string): Promise<void>;
  handOverEvent(id: string, participantMemberId: string): Promise<void>;
  eventSuggestions(): Promise<EventSuggestion[]>;
  eventInviteSuggestions(id: string): Promise<InviteSuggestion[]>;
  inviteSuggestedMemberToEvent(id: string, memberId: string, previousInviteId?: string): Promise<Invite>;
  extractEventInterests(input: ExtractEventInterestsInput, signal?: AbortSignal): Promise<InterestResolution[]>;
  joinSeries(id: string): Promise<void>;
  listSeries(): Promise<RecurringMeetup[]>;
  leaveSeries(id: string): Promise<void>;
  stopSeries(id: string): Promise<void>;
  answerRsvp(id: string, answer: RsvpAnswer): Promise<"participant" | "waitlisted" | null>;
  postAvailability(input: PostAvailabilityInput): Promise<Availability>;
  availability(): Promise<AvailabilityBoard>;
  availabilityMeetup(input: AvailabilityOverlap): Promise<AvailabilitySuggestion | undefined>;
  beginTelegramLink(): Promise<TelegramLink>;
  unlinkTelegram(): Promise<void>;
  notificationSettings(): Promise<NotificationSettings>;
  setNoticePreference(input: NoticePreference): Promise<void>;
  meetupChoices(): Promise<MeetupChoices>;
  createMeetup(input: CreateMeetupInput): Promise<MeetupDetail>;
  listMeetups(): Promise<MeetupSummary[]>;
  viewMeetup(id: string): Promise<MeetupDetail | undefined>;
  joinMeetup(id: string): Promise<"participant" | "waitlisted">;
  leaveMeetup(id: string): Promise<void>;
  inbox(): Promise<Notice[]>;
  editMeetup(id: string, input: EditMeetupInput): Promise<void>;
  cancelMeetup(id: string): Promise<void>;
  handOverMeetup(id: string, participantMemberId: string): Promise<void>;
  inviteMember(meetupId: string, memberId: string): Promise<Invite>;
  inviteSuggestedMember(meetupId: string, memberId: string, previousInviteId?: string): Promise<Invite>;
  inviteChoices(meetupId: string, input?: InviteSearch): Promise<InviteChoices>;
  inviteSuggestions(meetupId: string): Promise<InviteSuggestion[]>;
  previewInviteSuggestions(input: PreviewInviteSuggestionsInput): Promise<InviteSuggestion[]>;
  meetupSuggestions(): Promise<MeetupSuggestion[]>;
  extractMeetupInterests(input: ExtractMeetupInterestsInput, signal?: AbortSignal): Promise<InterestResolution[]>;
  answerInvite(inviteId: string, answer: "accept" | "decline"): Promise<InviteAnswer>;
  interests(): Promise<Interest[]>;
  myInterests(): Promise<MemberInterest[]>;
  resolveInterest(input: { phrase: string; kind: InterestKind }): Promise<InterestResolution>;
  confirmInterest(input: ConfirmInterestInput): Promise<MemberInterest[]>;
  setInterestStance(input: { interestId: string; stance: Stance }): Promise<MemberInterest[]>;
  removeInterest(interestId: string): Promise<MemberInterest[]>;
  organisationAdmin(): Promise<OrganisationAdminActions>;
  platformAdmin(): Promise<PlatformAdminActions>;
  adminVisibilityNotice(): Promise<AdminVisibilityNotice | undefined>;
  profile(): Promise<Profile>;
  /** Records that the Member has read the notice about admin visibility. The first time counts. */
  acknowledgeAdminVisibilityNotice(): Promise<void>;
  /** Corrects the Member's own Department and Site. Throws `InvalidInputError` for a name the Organisation does not have. */
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
  /** The Departments and Sites of the Member's Organisation, to choose from. */
  departmentsAndSites(): Promise<{ departments: string[]; sites: string[] }>;
  /** Another Member of the same Organisation, or undefined if there is no such visible Member there. */
  viewMember(memberId: string): Promise<MemberProfile | undefined>;
  searchMembers(input?: MemberSearch): Promise<MemberProfile[]>;
}

/** Resolves a session's Member to an actor, or undefined if they are not an Active Member. */
export async function asMember(deps: Deps, memberId: string): Promise<MemberActions | undefined> {
  if (!isUuid(memberId)) return undefined;
  const [row] = await deps.db
    .select({ organisationId: members.organisationId })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.status, "active")))
    .limit(1);
  if (!row) return undefined;
  const actor: Actor = { memberId, organisationId: row.organisationId };

  async function afterNotice<T>(operation: () => Promise<T>, audit?: AdminView): Promise<T> {
    const member = await requireActiveMember(deps.db, actor);
    const result = await operation();
    if (audit && member.isOrganisationAdmin && result !== undefined) {
      await recordAdminView(deps.db, actor, audit, deps.clock.now());
    }
    return result;
  }

  async function withNotices<T>(gatheringId: string, operation: () => Promise<T>): Promise<T> {
    const result = await operation();
    await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId });
    return result;
  }

  async function withSeriesNotices(operation: () => Promise<string[]>): Promise<void> {
    for (const gatheringId of await operation()) await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId });
  }

  return {
    proposeEvent: (input) => proposeEvent(deps, actor, input),
    flag: (input) => flag(deps, actor, input),
    confirmAttendance: (id, memberIds) => withNotices(id, () => confirmAttendance(deps, actor, id, memberIds)),
    attendance: (id) => afterNotice(() => attendance(deps, actor, id), { action: "attendance", filter: { gatheringId: id } }),
    attendanceHistory: () => attendanceHistory(deps, actor),
    rateOccurrence: (id, value) => rateOccurrence(deps, actor, id, value),
    connections: () => afterNotice(() => connections(deps, actor), { action: "connections", filter: {} }),
    eventProposals: () => ownEventProposals(deps, actor),
    listEvents: () => listEvents(deps, actor),
    listEventSeries: async () => (await listSeries(deps, actor, "event")).filter((series) => series.kind === "event"),
    viewEvent: (id) => viewEvent(deps, actor, id),
    joinEvent: (id) => withNotices(id, () => joinMeetup(deps, actor, id, "event")),
    leaveEvent: (id) => withNotices(id, () => leaveMeetup(deps, actor, id, "event")),
    inviteToEvent: (id, memberId) => withNotices(id, () => inviteMember(deps, actor, id, memberId, {}, "event")),
    eventInviteChoices: (id, input = {}) => afterNotice(() => inviteChoices(deps, actor, id, input, "event"), { action: "event-invite-choices", filter: { eventId: id, name: input.name ?? "", page: String(input.page ?? 0) } }),
    editEvent: (id, input) => withNotices(id, () => editMeetup(deps, actor, id, input, "event")),
    cancelEvent: (id) => withNotices(id, () => cancelMeetup(deps, actor, id, "event")),
    handOverEvent: (id, memberId) => withNotices(id, () => handOverMeetup(deps, actor, id, memberId, "event")),
    eventSuggestions: () => afterNotice(() => eventSuggestions(deps, actor), { action: "event-suggestions", filter: {} }),
    eventInviteSuggestions: (id) => afterNotice(() => inviteSuggestions(deps, actor, id, "event"), { action: "event-invite-suggestions", filter: { eventId: id } }),
    inviteSuggestedMemberToEvent: (id, memberId, previousInviteId) => withNotices(id, () => inviteMember(deps, actor, id, memberId, { previousInviteId, selectionSource: "suggestion" }, "event")),
    extractEventInterests: (input, signal) => afterNotice(() => extractMeetupInterests(deps, actor, input, signal)),
    joinSeries: (id) => withSeriesNotices(() => joinSeries(deps, actor, id)),
    listSeries: async () => (await listSeries(deps, actor)).filter((series) => series.kind === "meetup"),
    answerRsvp: (id, answer) => withNotices(id, () => answerRsvp(deps, actor, id, answer)),
    leaveSeries: (id) => withSeriesNotices(() => leaveSeries(deps, actor, id)),
    stopSeries: (id) => withSeriesNotices(() => stopSeries(deps, actor, id)),
    postAvailability: async (input) => {
      const posted = await postAvailability(deps, actor, input);
      await deliverSoon(deps, { organisationId: actor.organisationId, kind: "availability-overlap" });
      return posted;
    },
    availability: () => afterNotice(() => availability(deps, actor), { action: "availability", filter: {} }),
    availabilityMeetup: (input) => afterNotice(() => availabilityMeetup(deps, actor, input), { action: "availability-meetup", filter: { ownAvailabilityId: input?.ownAvailabilityId, otherAvailabilityId: input?.otherAvailabilityId } }),
    beginTelegramLink: () => beginTelegramLink(deps, actor),
    unlinkTelegram: () => unlinkTelegram(deps, actor),
    notificationSettings: () => notificationSettings(deps, actor),
    setNoticePreference: (input) => setNoticePreference(deps, actor, input),
    meetupChoices: () => meetupChoices(deps, actor),
    createMeetup: async (input) => {
      const meetup = await createMeetup(deps, actor, input);
      if (meetup.invites?.length) await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: meetup.id });
      return meetup;
    },
    listMeetups: () => listMeetups(deps, actor),
    viewMeetup: (id) => viewMeetup(deps, actor, id),
    joinMeetup: (id) => withNotices(id, () => joinMeetup(deps, actor, id)),
    leaveMeetup: (id) => withNotices(id, () => leaveMeetup(deps, actor, id)),
    inbox: () => inbox(deps, actor),
    editMeetup: (id, input) => withNotices(id, () => editMeetup(deps, actor, id, input)),
    cancelMeetup: (id) => withNotices(id, () => cancelMeetup(deps, actor, id)),
    handOverMeetup: (id, participantMemberId) => withNotices(id, () => handOverMeetup(deps, actor, id, participantMemberId)),
    inviteMember: (id, memberId) => withNotices(id, () => inviteMember(deps, actor, id, memberId)),
    inviteSuggestedMember: (id, memberId, previousInviteId) => withNotices(id, () => inviteMember(deps, actor, id, memberId, { previousInviteId, selectionSource: "suggestion" })),
    inviteChoices: (id, input = {}) => afterNotice(() => inviteChoices(deps, actor, id, input), { action: "meetup-invite-choices", filter: { meetupId: id, name: input.name ?? "", page: String(input.page ?? 0) } }),
    inviteSuggestions: (id) => afterNotice(() => inviteSuggestions(deps, actor, id), { action: "invite-suggestions", filter: { meetupId: id } }),
    previewInviteSuggestions: (input) => afterNotice(() => previewInviteSuggestions(deps, actor, input), { action: "invite-suggestions-preview", filter: input?.place?.kind === "physical" ? { placeKind: input.place.kind, siteId: input.place.siteId } : { placeKind: input?.place?.kind } }),
    meetupSuggestions: () => afterNotice(() => meetupSuggestions(deps, actor), { action: "meetup-suggestions", filter: {} }),
    extractMeetupInterests: (input, signal) => afterNotice(() => extractMeetupInterests(deps, actor, input, signal)),
    answerInvite: async (id, answer) => {
      const result = await answerInvite(deps, actor, id, answer);
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: result.eventId ?? result.meetupId });
      return result;
    },
    interests: () => afterNotice(() => listInterests(deps, actor)),
    myInterests: () => afterNotice(() => memberInterestList(deps, actor)),
    resolveInterest: (input) => afterNotice(() => resolveInterest(deps, actor, input)),
    confirmInterest: (input) => afterNotice(() => confirmInterest(deps, actor, input)),
    setInterestStance: (input) => afterNotice(() => setInterestStance(deps, actor, input)),
    removeInterest: (interestId) => afterNotice(() => removeInterest(deps, actor, interestId)),
    organisationAdmin: () => organisationAdmin(deps, actor),
    platformAdmin: () => platformAdmin(deps, actor),
    adminVisibilityNotice: () => adminVisibilityNotice(deps, actor),
    profile: () => afterNotice(() => profile(deps, actor)),
    acknowledgeAdminVisibilityNotice: () => acknowledgeAdminVisibilityNotice(deps, actor),
    updateProfile: (input) => afterNotice(() => updateProfile(deps, actor, input)),
    departmentsAndSites: () => afterNotice(() => listDepartmentsAndSites(deps.db, actor.organisationId)),
    viewMember: (id) => afterNotice(() => viewMember(deps, actor, id), { action: "member-profile", filter: { memberId: id } }),
    searchMembers: (input = {}) => {
      const filter: Record<string, string> = {};
      if (input.interest?.trim()) filter.interest = input.interest.trim();
      if (input.department?.trim()) filter.department = input.department.trim().toLowerCase();
      if (input.site?.trim()) filter.site = input.site.trim().toLowerCase();
      return afterNotice(() => searchMembers(deps, actor, filter), { action: "member-search", filter });
    },
  };
}

/** The condition every query about the actor's own row carries: their id within their Organisation. */
function self(actor: Actor) {
  return and(eq(members.id, actor.memberId), eq(members.organisationId, actor.organisationId));
}

/** A join to a Department or Site also insists it belongs to the Member's Organisation (ADR 0005). */
function sameOrganisation(
  id: typeof departments.id | typeof sites.id,
  memberColumn: typeof members.departmentId | typeof members.siteId,
  organisationId: typeof departments.organisationId | typeof sites.organisationId,
) {
  return and(eq(id, memberColumn), eq(organisationId, members.organisationId));
}

async function adminVisibilityNotice({ db }: Deps, actor: Actor): Promise<AdminVisibilityNotice | undefined> {
  await requireActiveMember(db, actor, false);
  const [notice] = await db
    .select({ name: members.name, organisation: { slug: organisations.slug, name: organisations.name } })
    .from(members)
    .innerJoin(organisations, eq(organisations.id, members.organisationId))
    .where(and(self(actor), isNull(members.adminVisibilityNoticeAcknowledgedAt)))
    .limit(1);
  return notice;
}

async function profile({ db }: { db: Queryable }, actor: Actor): Promise<Profile> {
  const [row] = await db
    .select({
      memberId: members.id,
      name: members.name,
      email: members.email,
      status: members.status,
      organisation: { slug: organisations.slug, name: organisations.name },
      department: departments.name,
      site: sites.name,
      isPlatformAdmin: members.isPlatformAdmin,
      isOrganisationAdmin: members.isOrganisationAdmin,
      adminVisibilityNoticeAcknowledgedAt: members.adminVisibilityNoticeAcknowledgedAt,
    })
    .from(members)
    .innerJoin(organisations, eq(organisations.id, members.organisationId))
    .leftJoin(departments, sameOrganisation(departments.id, members.departmentId, departments.organisationId))
    .leftJoin(sites, sameOrganisation(sites.id, members.siteId, sites.organisationId))
    .where(self(actor))
    .limit(1);
  if (!row) throw new Error("profile: the signed-in Member no longer exists");
  return row;
}

async function acknowledgeAdminVisibilityNotice(deps: Deps, actor: Actor): Promise<void> {
  await withActiveMember(deps, actor, async (db) => {
    const now = deps.clock.now();
    await db.update(members).set({ adminVisibilityNoticeAcknowledgedAt: now, updatedAt: now })
      .where(and(self(actor), isNull(members.adminVisibilityNoticeAcknowledgedAt)));
  }, false);
}

async function updateProfile(deps: Deps, actor: Actor, input: UpdateProfileInput): Promise<Profile> {
  return withActiveMember(deps, actor, async (db, current) => {
    const department = blankToNull(input.department);
    const site = blankToNull(input.site);
    const departmentId = department === null ? null : await findDepartment(db, actor.organisationId, department, current.departmentId);
    if (departmentId === undefined) throw new InvalidInputError("unknown-department", `"${department}" is not a Department of this Organisation`);
    const siteId = site === null ? null : await findSite(db, actor.organisationId, site, current.siteId);
    if (siteId === undefined) throw new InvalidInputError("unknown-site", `"${site}" is not a Site of this Organisation`);
    await db.update(members).set({
      departmentId, siteId,
      departmentCorrectedByMember: sql`${members.departmentCorrectedByMember} or (${members.departmentId} is distinct from ${departmentId}::uuid)`,
      siteCorrectedByMember: sql`${members.siteCorrectedByMember} or (${members.siteId} is distinct from ${siteId}::uuid)`,
      updatedAt: deps.clock.now(),
    }).where(self(actor));
    if (siteId !== current.siteId) await expireIneligibleAvailabilities(db, actor.organisationId, deps.clock.now());
    return profile({ db }, actor);
  });
}

async function viewMember(deps: Deps, actor: Actor, memberId: string): Promise<MemberProfile | undefined> {
  if (!isUuid(memberId)) return undefined;
  const [row] = await deps.db
    .select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name })
    .from(members)
    .leftJoin(departments, sameOrganisation(departments.id, members.departmentId, departments.organisationId))
    .leftJoin(sites, sameOrganisation(sites.id, members.siteId, sites.organisationId))
    .where(
      and(
        eq(members.id, memberId),
        eq(members.organisationId, actor.organisationId),
        inArray(members.status, VISIBLE_MEMBER_STATUSES),
      ),
    )
    .limit(1);
  return row ? { ...row, interests: await memberInterestList(deps, actor, memberId) } : undefined;
}

async function searchMembers({ db }: Deps, actor: Actor, input: MemberSearch): Promise<MemberProfile[]> {
  const { interest, department, site } = input;
  const pattern = interest ? `%${interest.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  const rows = await db.select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name })
    .from(members)
    .leftJoin(departments, sameOrganisation(departments.id, members.departmentId, departments.organisationId))
    .leftJoin(sites, sameOrganisation(sites.id, members.siteId, sites.organisationId))
    .where(and(
      eq(members.organisationId, actor.organisationId),
      ne(members.id, actor.memberId),
      inArray(members.status, VISIBLE_MEMBER_STATUSES),
      department ? eq(departments.nameKey, department) : undefined,
      site ? eq(sites.nameKey, site) : undefined,
      pattern ? exists(db.select({ id: memberInterests.interestId }).from(memberInterests)
        .innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
        .leftJoin(interestAliases, and(eq(interestAliases.organisationId, interests.organisationId), eq(interestAliases.interestId, interests.id)))
        .where(and(eq(memberInterests.organisationId, actor.organisationId), eq(memberInterests.memberId, members.id), or(ilike(interests.name, pattern), ilike(interestAliases.phrase, pattern))))) : undefined,
    )).orderBy(asc(members.name), asc(members.id));
  if (!rows.length) return [];
  const declarations = await memberInterestsFor(db, actor.organisationId, rows.map((row) => row.memberId));
  return rows.map((row) => ({ ...row, interests: declarations.filter((declaration) => declaration.memberId === row.memberId).map(({ memberId: _, ...interest }) => interest) }));
}
