import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberActions, PendingSignIn } from "../application/index";
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

export function cookieOptions(timeToLiveMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: webConfig().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: Math.floor(timeToLiveMs / 1000),
  } as const;
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

/** Everything past the welcome page needs the first-login notice acknowledged first. */
export async function requireMemberPastWelcome(): Promise<MemberActions> {
  const member = await requireMember();
  const profile = await member.profile();
  if (profile.adminVisibilityNoticeAcknowledgedAt === null) redirect("/welcome");
  return member;
}
