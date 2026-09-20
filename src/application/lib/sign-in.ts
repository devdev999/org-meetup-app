import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { IdentityError, type RawClaims } from "../ports";
import { normaliseEmail } from "./db";
import { recordMemberActivity } from "./actor";
import { ensureDepartment, ensureSite, type Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { blankToNull } from "./input";
import {
  members,
  organisationAdminNotices,
  organisationOidcSettings,
  organisations,
  type ClaimMapping,
} from "./schema";

/** An Organisation a visitor can sign in to. */
export interface SignInOption {
  slug: string;
  name: string;
}

/** A sign-in must finish within this long of starting. */
export const SIGN_IN_TIME_LIMIT_MS = 10 * 60 * 1000;

/**
 * What the application remembers between sending the browser to the issuer
 * and getting it back. Opaque to the web adapter, which keeps it in a sealed
 * cookie so the callback is bound to the browser that started the sign-in.
 */
export interface PendingSignIn {
  organisationSlug: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  /** ISO 8601, so the whole record is JSON. */
  startedAt: string;
}

export type SignInErrorCode = "unknown-organisation" | "expired" | "rejected" | "no-email" | "unverified-email" | "inactive-member" | "not-configured";

export class SignInError extends Error {
  constructor(
    readonly code: SignInErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SignInError";
  }
}

export async function signInOptions({ db }: Deps): Promise<SignInOption[]> {
  return db
    .select({ slug: organisations.slug, name: organisations.name })
    .from(organisations)
    .orderBy(organisations.name);
}

export interface BeginSignInInput {
  organisationSlug: string;
  redirectUri: string;
}

export async function beginSignIn(
  { db, identity, clock }: Deps,
  input: BeginSignInInput,
): Promise<{ authorizationUrl: string; pending: PendingSignIn }> {
  const { oidc } = await issuerOf(db, input.organisationSlug);
  if (!identity.isConfigured(oidc)) throw new SignInError("not-configured", "The Organisation's sign-in credential is not installed.");
  const pending: PendingSignIn = {
    organisationSlug: input.organisationSlug,
    redirectUri: input.redirectUri,
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    startedAt: clock.now().toISOString(),
  };
  const authorizationUrl = await identity.authorizationUrl(oidc, {
    redirectUri: pending.redirectUri,
    state: pending.state,
    nonce: pending.nonce,
    codeVerifier: pending.codeVerifier,
  });
  return { authorizationUrl, pending };
}

export interface CompleteSignInInput {
  pending: PendingSignIn;
  /** The full URL the issuer sent the browser back to. */
  callbackUrl: string;
}

/**
 * Binds the login to a Member by email within the issuer's Organisation.
 * A Member on the roster becomes Active; an email nobody knows becomes a new
 * Active Member and raises a notice for the Organisation Admins.
 */
export async function completeSignIn(
  { db, identity, clock }: Deps,
  input: CompleteSignInInput,
): Promise<{ memberId: string }> {
  const { pending } = input;
  const { organisation, oidc, claimMapping } = await issuerOf(db, pending.organisationSlug);
  const now = clock.now();
  if (now.getTime() - Date.parse(pending.startedAt) > SIGN_IN_TIME_LIMIT_MS) {
    throw new SignInError("expired", "the sign-in took too long; start again");
  }

  let claims: RawClaims;
  try {
    claims = await identity.claimsFromCallback(oidc, {
      callbackUrl: input.callbackUrl,
      redirectUri: pending.redirectUri,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      codeVerifier: pending.codeVerifier,
    });
  } catch (error) {
    if (error instanceof IdentityError) {
      throw new SignInError("rejected", `the issuer's answer could not be trusted: ${error.message}`, { cause: error });
    }
    throw error;
  }
  const person = mapClaims(claims, claimMapping);

  return db.transaction(async (tx) => {
    await tx.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisation.id)).for("update");
    const memberId = await bindMember(tx, organisation.id, person, now);
    await fillBlanksFromLogin(tx, organisation.id, memberId, person, now);
    await recordMemberActivity(tx, { organisationId: organisation.id, memberId }, now);
    return { memberId };
  });
}

/** Finds the Member this login belongs to, making them Active, or creates one and raises a notice. */
async function bindMember(tx: Queryable, organisationId: string, person: Person, now: Date): Promise<string> {
  const byEmail = and(eq(members.organisationId, organisationId), eq(members.email, person.email));
  const [existing] = await tx
    .select({ id: members.id, status: members.status, name: members.name })
    .from(members)
    .where(byEmail)
    .limit(1);
  if (existing) {
    if (existing.status === "departed" || existing.status === "suspended") {
      throw new SignInError("inactive-member", "this Member no longer has access; contact your Organisation Admin");
    }
    const changes: Partial<typeof members.$inferInsert> = {};
    if (existing.status === "provisioned") changes.status = "active";
    // A Member created by a login that stated no name carries their email as a placeholder.
    if (existing.name === person.email && person.name) changes.name = person.name;
    if (Object.keys(changes).length > 0) {
      await tx
        .update(members)
        .set({ ...changes, updatedAt: now })
        .where(memberOf(organisationId, existing.id));
    }
    return existing.id;
  }

  const [created] = await tx
    .insert(members)
    .values({
      organisationId,
      email: person.email,
      name: person.name ?? person.email,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [members.organisationId, members.email] })
    .returning({ id: members.id });
  if (!created) {
    // Lost a race with a concurrent first sign-in of the same person.
    const [raced] = await tx.select({ id: members.id }).from(members).where(byEmail).limit(1);
    if (!raced) throw new Error("completeSignIn: Member vanished during sign-in");
    return raced.id;
  }
  await tx
    .insert(organisationAdminNotices)
    .values({ organisationId, kind: "unknown_login", memberId: created.id, createdAt: now });
  return created.id;
}

/**
 * The login fills in Department, Site and staff identifier only where the
 * Member has none and has not corrected the field, including clearing it.
 * Each field checks the correction marker and current value in one statement,
 * so a correction saved a moment earlier is never overwritten. The login's
 * Department and Site are directory data, so unknown names are added to the Organisation's lists.
 */
async function fillBlanksFromLogin(
  tx: Queryable,
  organisationId: string,
  memberId: string,
  person: Person,
  now: Date,
): Promise<void> {
  const changes: Partial<Record<"departmentId" | "siteId" | "staffIdentifier", ReturnType<typeof sql>>> = {};
  if (person.department) {
    const departmentId = await ensureDepartment(tx, organisationId, person.department, now);
    changes.departmentId = sql`case when ${members.departmentCorrectedByMember}
      then ${members.departmentId} else coalesce(${members.departmentId}, ${departmentId}::uuid) end`;
  }
  if (person.site) {
    const siteId = await ensureSite(tx, organisationId, person.site, now);
    changes.siteId = sql`case when ${members.siteCorrectedByMember}
      then ${members.siteId} else coalesce(${members.siteId}, ${siteId}::uuid) end`;
  }
  if (person.staffIdentifier) {
    changes.staffIdentifier = sql`coalesce(${members.staffIdentifier}, ${person.staffIdentifier})`;
  }
  if (Object.keys(changes).length === 0) return;
  await tx
    .update(members)
    .set({ ...changes, updatedAt: now })
    .where(memberOf(organisationId, memberId));
}

/** One Member within one Organisation: every query about a Member carries both (ADR 0005). */
function memberOf(organisationId: string, memberId: string) {
  return and(eq(members.organisationId, organisationId), eq(members.id, memberId));
}

async function issuerOf(db: Deps["db"], organisationSlug: string) {
  const [row] = await db
    .select({
      organisation: { id: organisations.id, slug: organisations.slug, name: organisations.name },
      issuer: organisationOidcSettings.issuer,
      clientId: organisationOidcSettings.clientId,
      credentialRef: organisationOidcSettings.credentialRef,
      claimMapping: organisationOidcSettings.claimMapping,
    })
    .from(organisations)
    .innerJoin(organisationOidcSettings, eq(organisationOidcSettings.organisationId, organisations.id))
    .where(eq(organisations.slug, organisationSlug))
    .limit(1);
  if (!row) {
    throw new SignInError("unknown-organisation", `no Organisation "${organisationSlug}" can be signed in to`);
  }
  return {
    organisation: row.organisation,
    oidc: { issuer: row.issuer, clientId: row.clientId, credentialRef: row.credentialRef },
    claimMapping: row.claimMapping,
  };
}

interface Person {
  email: string;
  /** Undefined when the issuer stated no usable name. */
  name: string | undefined;
  department: string | undefined;
  site: string | undefined;
  staffIdentifier: string | undefined;
}

/** The standard OpenID Connect claim that says whether the issuer verified the email address. */
const EMAIL_VERIFIED_CLAIM = "email_verified";

function mapClaims(claims: RawClaims, mapping: ClaimMapping): Person {
  const text = (claim: string | undefined): string | undefined => {
    if (!claim) return undefined;
    const value = claims[claim];
    return typeof value === "string" ? (blankToNull(value) ?? undefined) : undefined;
  };
  const email = text(mapping.email);
  if (!email) {
    throw new SignInError("no-email", `the issuer supplied no "${mapping.email}" claim, so the login cannot be bound to a Member`);
  }
  // Absent means the issuer, the Organisation's own directory, does not state it; false means it says no.
  const verified = claims[EMAIL_VERIFIED_CLAIM];
  if (verified === false || verified === "false") {
    throw new SignInError("unverified-email", `the issuer says ${email} is not a verified address, so it cannot be bound to a Member`);
  }
  return {
    email: normaliseEmail(email),
    name: text(mapping.name),
    department: text(mapping.department),
    site: text(mapping.site),
    staffIdentifier: text(mapping.staffIdentifier),
  };
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
