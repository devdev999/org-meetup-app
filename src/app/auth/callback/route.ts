import { NextResponse, type NextRequest } from "next/server";
import { isSignInError } from "../../../application/index";
import { webConfig } from "../../../config/env";
import { application } from "../../../web/application";
import {
  cookieOptions,
  PENDING_SIGN_IN_COOKIE,
  sealSession,
  SESSION_COOKIE,
  SESSION_TIME_TO_LIVE_MS,
  signInFailedRedirect,
  unsealPendingSignIn,
} from "../../../web/session";

/** Where the issuer sends the browser back. Finishes the sign-in and opens a session. */
export async function GET(request: NextRequest) {
  const pending = unsealPendingSignIn(request.cookies.get(PENDING_SIGN_IN_COOKIE)?.value);
  if (!pending) return signInFailedRedirect("no-pending");

  // The issuer's answer, on the redirect URI the sign-in was registered with.
  const callbackUrl = new URL(pending.redirectUri);
  callbackUrl.search = request.nextUrl.search;

  try {
    const { memberId } = await application().completeSignIn({ pending, callbackUrl: callbackUrl.href });
    const response = NextResponse.redirect(new URL("/profile", webConfig().APP_URL));
    response.cookies.set(SESSION_COOKIE, sealSession(memberId), cookieOptions(SESSION_TIME_TO_LIVE_MS));
    response.cookies.delete(PENDING_SIGN_IN_COOKIE);
    return response;
  } catch (error) {
    if (isSignInError(error)) return signInFailedRedirect(error.code);
    throw error;
  }
}
