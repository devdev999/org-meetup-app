import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { IdentityError, type Clock, type IdentityPort, type RawClaims } from "../ports";
import { normaliseEmail, type Database } from "./db";
import { ensureDepartment, ensureSite, type Queryable } from "./departments-and-sites";
import { adminNotices, members, organisationOidcSettings, organisations, type ClaimMapping } from "./schema";

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

export type SignInErrorCode = "unknown-organisation" | "expired" | "rejected" | "no-email";

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

export async function signInOptions(db: Database): Promise<SignInOption[]> {
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
  db: Database,
  identity: IdentityPort,
  clock: Clock,
  input: BeginSignInInput,
): Promise<{ authorizationUrl: string; pending: PendingSignIn }> {
  const { oidc } = await issuerOf(db, input.organisationSlug);
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
  db: Database,
  identity: IdentityPort,
  clock: Clock,
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
    const memberId = await bindMember(tx, organisation.id, person, now);
    await fillPlacementFromLogin(tx, organisation.id, memberId, person, now);
    return { memberId };
  });
}

/** Finds the Member this login belongs to, making them Active, or creates one and raises a notice. */
async function bindMember(tx: Queryable, organisationId: string, person: Person, now: Date): Promise<string> {
  const byEmail = and(eq(members.organisationId, organisationId), eq(members.email, person.email));
  const [existing] = await tx.select({ id: members.id, status: members.status }).from(members).where(byEmail).limit(1);
  if (existing) {
    if (existing.status === "provisioned") {
      await tx.update(members).set({ status: "active", updatedAt: now }).where(eq(members.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await tx
    .insert(members)
    .values({
      organisationId,
      email: person.email,
      name: person.name,
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
  await tx.insert(adminNotices).values({ organisationId, kind: "unknown_login", memberId: created.id, createdAt: now });
  return created.id;
}

/**
 * The login fills in Department, Site and staff identifier only where the
 * Member has none: what the roster or the Member themselves set stays.
 */
async function fillPlacementFromLogin(
  tx: Queryable,
  organisationId: string,
  memberId: string,
  person: Person,
  now: Date,
): Promise<void> {
  const [current] = await tx
    .select({ departmentId: members.departmentId, siteId: members.siteId, staffIdentifier: members.staffIdentifier })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!current) return;
  const changes: Partial<typeof members.$inferInsert> = {};
  if (current.departmentId === null && person.department) {
    changes.departmentId = await ensureDepartment(tx, organisationId, person.department, now);
  }
  if (current.siteId === null && person.site) {
    changes.siteId = await ensureSite(tx, organisationId, person.site, now);
  }
  if (current.staffIdentifier === null && person.staffIdentifier) {
    changes.staffIdentifier = person.staffIdentifier;
  }
  if (Object.keys(changes).length > 0) {
    await tx.update(members).set({ ...changes, updatedAt: now }).where(eq(members.id, memberId));
  }
}

async function issuerOf(db: Database, organisationSlug: string) {
  const [row] = await db
    .select({
      organisation: { id: organisations.id, slug: organisations.slug, name: organisations.name },
      issuer: organisationOidcSettings.issuer,
      clientId: organisationOidcSettings.clientId,
      clientSecret: organisationOidcSettings.clientSecret,
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
    oidc: { issuer: row.issuer, clientId: row.clientId, clientSecret: row.clientSecret },
    claimMapping: row.claimMapping,
  };
}

interface Person {
  email: string;
  name: string;
  department: string | undefined;
  site: string | undefined;
  staffIdentifier: string | undefined;
}

function mapClaims(claims: RawClaims, mapping: ClaimMapping): Person {
  const text = (claim: string | undefined): string | undefined => {
    if (!claim) return undefined;
    const value = claims[claim];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const email = text(mapping.email);
  if (!email) {
    throw new SignInError("no-email", `the issuer supplied no "${mapping.email}" claim, so the login cannot be bound to a Member`);
  }
  return {
    email: normaliseEmail(email),
    name: text(mapping.name) ?? email,
    department: text(mapping.department),
    site: text(mapping.site),
    staffIdentifier: text(mapping.staffIdentifier),
  };
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
