import { and, eq, inArray, isNull } from "drizzle-orm";
import { findDepartment, findSite, listDepartmentsAndSites } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { blankToNull, isUuid } from "./input";
import { departments, members, organisations, sites } from "./schema";

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
  /** Null until the Member has acknowledged the notice about what Organisation Admins can see. */
  adminVisibilityNoticeAcknowledgedAt: Date | null;
}

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

/** Members in these statuses appear in Member-facing views; Suspended and Departed ones are hidden. */
const VISIBLE_STATUSES: MemberStatus[] = ["provisioned", "active"];

/**
 * The actor-scoped interface: everything a signed-in Member can do. The
 * Organisation is fixed when the actor is created and every query is scoped
 * to it, so nothing a page passes in can reach another Organisation.
 */
export interface MemberActions {
  profile(): Promise<Profile>;
  /** Records that the Member has read the notice about admin visibility. The first time counts. */
  acknowledgeAdminVisibilityNotice(): Promise<void>;
  /** Corrects the Member's own Department and Site. Throws `InvalidInputError` for a name the Organisation does not have. */
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
  /** The Departments and Sites of the Member's Organisation, to choose from. */
  departmentsAndSites(): Promise<{ departments: string[]; sites: string[] }>;
  /** Another Member of the same Organisation, or undefined if there is no such visible Member there. */
  viewMember(memberId: string): Promise<MemberSummary | undefined>;
}

interface Actor {
  memberId: string;
  organisationId: string;
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
  return {
    profile: () => profile(deps, actor),
    acknowledgeAdminVisibilityNotice: () => acknowledgeAdminVisibilityNotice(deps, actor),
    updateProfile: (input) => updateProfile(deps, actor, input),
    departmentsAndSites: () => listDepartmentsAndSites(deps.db, actor.organisationId),
    viewMember: (id) => viewMember(deps, actor, id),
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
  const departmentId = department === null ? null : await findDepartment(db, actor.organisationId, department);
  if (departmentId === undefined) {
    throw new InvalidInputError("unknown-department", `"${department}" is not a Department of this Organisation`);
  }
  const siteId = site === null ? null : await findSite(db, actor.organisationId, site);
  if (siteId === undefined) {
    throw new InvalidInputError("unknown-site", `"${site}" is not a Site of this Organisation`);
  }
  await db.update(members).set({ departmentId, siteId, updatedAt: clock.now() }).where(self(actor));
  return profile(deps, actor);
}

async function viewMember({ db }: Deps, actor: Actor, memberId: string): Promise<MemberSummary | undefined> {
  if (!isUuid(memberId)) return undefined;
  const [row] = await db
    .select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name })
    .from(members)
    .leftJoin(departments, sameOrganisation(departments.id, members.departmentId, departments.organisationId))
    .leftJoin(sites, sameOrganisation(sites.id, members.siteId, sites.organisationId))
    .where(
      and(
        eq(members.id, memberId),
        eq(members.organisationId, actor.organisationId),
        inArray(members.status, VISIBLE_STATUSES),
      ),
    )
    .limit(1);
  return row;
}
