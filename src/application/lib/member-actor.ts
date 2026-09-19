import { and, asc, eq, exists, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, type Actor } from "./actor";
import { recordAdminView, type AdminView } from "./admin-audit";
import { findDepartment, findSite, listDepartmentsAndSites } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { blankToNull, isUuid } from "./input";
import { organisationAdmin, type OrganisationAdminActions } from "./organisation-admin";
import { cancelMeetup, createMeetup, editMeetup, handOverMeetup, inbox, joinMeetup, leaveMeetup, listMeetups, meetupChoices, viewMeetup, type CreateMeetupInput, type EditMeetupInput, type MeetupChoices, type MeetupDetail, type MeetupSummary, type Notice } from "./meetups";
import { departments, interestAliases, interests, memberInterests, members, organisations, sites } from "./schema";
import type { InterestKind } from "../ports";
import { confirmInterest, listInterests, memberInterestList, resolveInterest, setInterestStance, type ConfirmInterestInput, type Interest, type InterestResolution, type MemberInterest, type Stance } from "./interests";

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
  interests(): Promise<Interest[]>;
  myInterests(): Promise<MemberInterest[]>;
  resolveInterest(input: { phrase: string; kind: InterestKind }): Promise<InterestResolution>;
  confirmInterest(input: ConfirmInterestInput): Promise<MemberInterest[]>;
  setInterestStance(input: { interestId: string; stance: Stance }): Promise<MemberInterest[]>;
  organisationAdmin(): Promise<OrganisationAdminActions>;
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

  return {
    meetupChoices: () => meetupChoices(deps, actor),
    createMeetup: (input) => createMeetup(deps, actor, input),
    listMeetups: () => listMeetups(deps, actor),
    viewMeetup: (id) => viewMeetup(deps, actor, id),
    joinMeetup: (id) => joinMeetup(deps, actor, id),
    leaveMeetup: (id) => leaveMeetup(deps, actor, id),
    inbox: () => inbox(deps, actor),
    editMeetup: (id, input) => editMeetup(deps, actor, id, input),
    cancelMeetup: (id) => cancelMeetup(deps, actor, id),
    handOverMeetup: (id, participantMemberId) => handOverMeetup(deps, actor, id, participantMemberId),
    interests: () => afterNotice(() => listInterests(deps, actor)),
    myInterests: () => afterNotice(() => memberInterestList(deps, actor)),
    resolveInterest: (input) => afterNotice(() => resolveInterest(deps, actor, input)),
    confirmInterest: (input) => afterNotice(() => confirmInterest(deps, actor, input)),
    setInterestStance: (input) => afterNotice(() => setInterestStance(deps, actor, input)),
    organisationAdmin: () => organisationAdmin(deps, actor),
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

async function profile({ db }: Deps, actor: Actor): Promise<Profile> {
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

async function acknowledgeAdminVisibilityNotice({ db, clock }: Deps, actor: Actor): Promise<void> {
  await requireActiveMember(db, actor, false);
  const now = clock.now();
  await db
    .update(members)
    .set({ adminVisibilityNoticeAcknowledgedAt: now, updatedAt: now })
    .where(and(self(actor), isNull(members.adminVisibilityNoticeAcknowledgedAt)));
}

async function updateProfile(deps: Deps, actor: Actor, input: UpdateProfileInput): Promise<Profile> {
  const { db, clock } = deps;
  const department = blankToNull(input.department);
  const site = blankToNull(input.site);
  const current = await requireActiveMember(db, actor);
  const departmentId = department === null ? null : await findDepartment(db, actor.organisationId, department, current.departmentId);
  if (departmentId === undefined) {
    throw new InvalidInputError("unknown-department", `"${department}" is not a Department of this Organisation`);
  }
  const siteId = site === null ? null : await findSite(db, actor.organisationId, site, current.siteId);
  if (siteId === undefined) {
    throw new InvalidInputError("unknown-site", `"${site}" is not a Site of this Organisation`);
  }
  await db
    .update(members)
    .set({
      departmentId,
      siteId,
      departmentCorrectedByMember: sql`${members.departmentCorrectedByMember} or (${members.departmentId} is distinct from ${departmentId}::uuid)`,
      siteCorrectedByMember: sql`${members.siteCorrectedByMember} or (${members.siteId} is distinct from ${siteId}::uuid)`,
      updatedAt: clock.now(),
    })
    .where(self(actor));
  return profile(deps, actor);
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
  const declarations = await db.select({ memberId: memberInterests.memberId, interestId: interests.id, name: interests.name, kind: interests.kind, stance: memberInterests.stance })
    .from(memberInterests)
    .innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
    .where(and(eq(memberInterests.organisationId, actor.organisationId), inArray(memberInterests.memberId, rows.map((row) => row.memberId))))
    .orderBy(asc(interests.kind), asc(interests.name));
  return rows.map((row) => ({ ...row, interests: declarations.filter((declaration) => declaration.memberId === row.memberId).map(({ memberId: _, ...interest }) => interest) }));
}
