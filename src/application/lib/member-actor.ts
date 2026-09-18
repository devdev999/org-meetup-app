import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Clock } from "../ports";
import type { Database } from "./db";
import { ensureDepartment, ensureSite, listDepartmentsAndSites } from "./departments-and-sites";
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

/** Department and Site by name; null clears the value. Names are matched ignoring case. */
export interface UpdateProfileInput {
  department: string | null;
  site: string | null;
}

/** What a Member sees about a colleague in their Organisation. */
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
  /** Corrects the Member's own Department and Site. */
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
  /** The Departments and Sites of the Member's Organisation, to choose from. */
  departmentsAndSites(): Promise<{ departments: string[]; sites: string[] }>;
  /** A colleague in the Member's Organisation, or undefined if there is no such visible Member there. */
  viewMember(memberId: string): Promise<MemberSummary | undefined>;
}

interface Actor {
  memberId: string;
  organisationId: string;
}

interface Deps {
  db: Database;
  clock: Clock;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolves a session's Member to an actor, or undefined if they are not an Active Member. */
export async function asMember(deps: Deps, memberId: string): Promise<MemberActions | undefined> {
  if (!UUID.test(memberId)) return undefined;
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
    viewMember: (memberId) => viewMember(deps, actor, memberId),
  };
}

async function viewMember(deps: Deps, actor: Actor, memberId: string): Promise<MemberSummary | undefined> {
  if (!UUID.test(memberId)) return undefined;
  const [row] = await deps.db
    .select({ memberId: members.id, name: members.name, department: departments.name, site: sites.name })
    .from(members)
    .leftJoin(departments, eq(departments.id, members.departmentId))
    .leftJoin(sites, eq(sites.id, members.siteId))
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

/** The condition every query about the actor's own row carries: their id within their Organisation. */
function self(actor: Actor) {
  return and(eq(members.id, actor.memberId), eq(members.organisationId, actor.organisationId));
}

async function profile(deps: Deps, actor: Actor): Promise<Profile> {
  const [row] = await deps.db
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
    .leftJoin(departments, eq(departments.id, members.departmentId))
    .leftJoin(sites, eq(sites.id, members.siteId))
    .where(self(actor))
    .limit(1);
  if (!row) throw new Error("profile: the signed-in Member no longer exists");
  return row;
}

async function acknowledgeAdminVisibilityNotice(deps: Deps, actor: Actor): Promise<void> {
  const now = deps.clock.now();
  await deps.db
    .update(members)
    .set({ adminVisibilityNoticeAcknowledgedAt: now, updatedAt: now })
    .where(and(self(actor), isNull(members.adminVisibilityNoticeAcknowledgedAt)));
}

async function updateProfile(deps: Deps, actor: Actor, input: UpdateProfileInput): Promise<Profile> {
  const now = deps.clock.now();
  await deps.db.transaction(async (tx) => {
    const department = blankToNull(input.department);
    const site = blankToNull(input.site);
    const departmentId = department ? await ensureDepartment(tx, actor.organisationId, department, now) : null;
    const siteId = site ? await ensureSite(tx, actor.organisationId, site, now) : null;
    await tx.update(members).set({ departmentId, siteId, updatedAt: now }).where(self(actor));
  });
  return profile(deps, actor);
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
