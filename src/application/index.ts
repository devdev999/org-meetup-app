import type { Pool } from "pg";
import { bootstrap, type BootstrapConfig } from "./lib/bootstrap";
import { connectDatabase } from "./lib/db";
import type { Deps } from "./lib/deps";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError, InvalidInputError, type InvalidInputCode } from "./lib/errors";
import {
  asMember,
  type AdminVisibilityNotice,
  type MemberActions,
  type MemberStatus,
  type MemberSummary,
  type Profile,
  type UpdateProfileInput,
} from "./lib/member-actor";
import {
  beginSignIn,
  completeSignIn,
  signInOptions,
  SignInError,
  type BeginSignInInput,
  type CompleteSignInInput,
  type PendingSignIn,
  type SignInErrorCode,
  type SignInOption,
} from "./lib/sign-in";
import type { Clock, IdentityPort } from "./ports";

export { AccessDeniedError, AdminVisibilityNoticeRequiredError, InvalidInputError, SignInError };
export type { AdminAuditEntry, OrganisationAdminActions, UnknownLoginNotice } from "./lib/organisation-admin";
export type { OrganisationListEntry, OrganisationListKind, OrganisationLists } from "./lib/organisation-lists";
export type { RosterRow, RosterMember, RosterPreview } from "./lib/roster";
export type {
  AdminVisibilityNotice,
  BeginSignInInput,
  BootstrapConfig,
  CompleteSignInInput,
  InvalidInputCode,
  MemberActions,
  MemberStatus,
  MemberSummary,
  PendingSignIn,
  Profile,
  SignInErrorCode,
  SignInOption,
  UpdateProfileInput,
};
export type { ClaimMapping } from "./lib/schema";

/**
 * Recognises a `SignInError` by shape rather than class identity: the web
 * process is bundled into several layers (pages, route handlers, server
 * actions) that each hold their own copy of this module, so `instanceof`
 * across them is false.
 */
export function isSignInError(error: unknown): error is SignInError {
  return error instanceof Error && error.name === "SignInError" && typeof (error as SignInError).code === "string";
}

export function isAdminVisibilityNoticeRequiredError(error: unknown): error is AdminVisibilityNoticeRequiredError {
  return error instanceof Error && error.name === "AdminVisibilityNoticeRequiredError";
}

export function isAccessDeniedError(error: unknown): error is AccessDeniedError {
  return error instanceof Error && error.name === "AccessDeniedError";
}

export function isInvalidInputError(error: unknown): error is InvalidInputError {
  return error instanceof Error && error.name === "InvalidInputError";
}

export interface ApplicationDependencies {
  pool: Pool;
  identity: IdentityPort;
  clock: Clock;
}

/**
 * The application module. Every command and query is phrased in glossary
 * terms and, once someone is signed in, invoked through an actor whose
 * Organisation the application derives itself, never from input.
 */
export interface Application {
  /** Seeds the first Organisation, its choices, its OIDC settings and the first Platform Admin. Idempotent. */
  bootstrap(config: BootstrapConfig): Promise<void>;
  /** Anonymous: the Organisations a visitor can sign in to, in name order. */
  signInOptions(): Promise<SignInOption[]>;
  /** Anonymous: starts a sign-in with one Organisation's issuer. Throws `SignInError`. */
  beginSignIn(input: BeginSignInInput): Promise<{ authorizationUrl: string; pending: PendingSignIn }>;
  /** Anonymous: finishes a sign-in from the issuer's callback. Throws `SignInError`. */
  completeSignIn(input: CompleteSignInInput): Promise<{ memberId: string }>;
  /** Acts as a signed-in Member, or undefined when they are not an Active Member. */
  asMember(memberId: string): Promise<MemberActions | undefined>;
}

export function createApplication(dependencies: ApplicationDependencies): Application {
  const deps: Deps = {
    db: connectDatabase(dependencies.pool),
    identity: dependencies.identity,
    clock: dependencies.clock,
  };
  return {
    bootstrap: (config) => bootstrap(deps, config),
    signInOptions: () => signInOptions(deps),
    beginSignIn: (input) => beginSignIn(deps, input),
    completeSignIn: (input) => completeSignIn(deps, input),
    asMember: (memberId) => asMember(deps, memberId),
  };
}
