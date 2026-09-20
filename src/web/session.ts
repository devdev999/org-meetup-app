import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  isAdminVisibilityNoticeRequiredError,
  isAccessDeniedError,
  type MemberActions,
  type PendingSignIn,
  type Profile,
  type SignInErrorCode,
} from "../application/index";
import { webConfig } from "../config/env";
import { application } from "./application";
import { seal, unseal } from "./sealed";

/**
 * Sessions are sealed cookies holding the Member's id. The Organisation is
 * never in the cookie: the application derives it from the Member.
 */

export const SESSION_COOKIE = "session";
export const PENDING_SIGN_IN_COOKIE = "pending_sign_in";

export const SESSION_TIME_TO_LIVE_MS = 12 * 60 * 60 * 1000;
export const PENDING_SIGN_IN_TIME_TO_LIVE_MS = 10 * 60 * 1000;

/** Why a sign-in failed: the application's reasons, plus the web's own "no sign-in was started here". */
export type SignInFailure = SignInErrorCode | "no-pending";

export function cookieOptions(timeToLiveMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: webConfig().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: Math.floor(timeToLiveMs / 1000),
  } as const;
}

export async function requireOrganisationAdmin() {
  const { member } = await requireMemberPastWelcome();
  try {
    return await member.organisationAdmin();
  } catch (error) {
    if (isAccessDeniedError(error)) notFound();
    throw error;
  }
}

export async function requirePlatformAdmin() {
  const { member } = await requireMemberPastWelcome();
  try { return await member.platformAdmin(); }
  catch (error) {
    if (isAccessDeniedError(error)) notFound();
    throw error;
  }
}

export function sealSession(memberId: string): string {
  return seal({ memberId }, webConfig().SESSION_SECRET, SESSION_TIME_TO_LIVE_MS);
}

export function sealPendingSignIn(pending: PendingSignIn): string {
  return seal(pending, webConfig().SESSION_SECRET, PENDING_SIGN_IN_TIME_TO_LIVE_MS);
}

export function unsealPendingSignIn(token: string | undefined): PendingSignIn | undefined {
  const value = unseal(token, webConfig().SESSION_SECRET);
  if (typeof value !== "object" || value === null) return undefined;
  const pending = value as Partial<PendingSignIn>;
  return typeof pending.organisationSlug === "string" && typeof pending.state === "string"
    ? (pending as PendingSignIn)
    : undefined;
}

/** Sends the browser back to the sign-in page with the reason, and forgets any sign-in in progress. */
export function signInFailedRedirect(code: SignInFailure): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?error=${code}`, webConfig().APP_URL));
  response.cookies.delete(PENDING_SIGN_IN_COOKIE);
  return response;
}

/** The signed-in Member as an actor, or undefined when nobody is signed in. */
export async function currentMember(): Promise<MemberActions | undefined> {
  const store = await cookies();
  const session = unseal(store.get(SESSION_COOKIE)?.value, webConfig().SESSION_SECRET);
  if (typeof session !== "object" || session === null) return undefined;
  const { memberId } = session as { memberId?: unknown };
  if (typeof memberId !== "string") return undefined;
  return application().asMember(memberId);
}

/** For pages that need a signed-in Member: the actor, or a redirect to sign in. */
export async function requireMember(): Promise<MemberActions> {
  const member = await currentMember();
  if (!member) redirect("/sign-in");
  return member;
}

/** Translates the application's notice prerequisite into a browser redirect. */
export async function requireMemberPastWelcome(): Promise<{ member: MemberActions; profile: Profile }> {
  const member = await requireMember();
  try {
    return { member, profile: await member.profile() };
  } catch (error) {
    if (isAdminVisibilityNoticeRequiredError(error)) redirect("/welcome");
    throw error;
  }
}
