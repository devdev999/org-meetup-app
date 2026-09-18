import { NextResponse, type NextRequest } from "next/server";
import { isSignInError } from "../../../application/index";
import { webConfig } from "../../../config/env";
import { application } from "../../../web/application";
import {
  cookieOptions,
  PENDING_SIGN_IN_COOKIE,
  PENDING_SIGN_IN_TIME_TO_LIVE_MS,
  sealPendingSignIn,
  signInFailedRedirect,
} from "../../../web/session";

/** Starts a sign-in with one Organisation's issuer and sends the browser there. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { authorizationUrl, pending } = await application().beginSignIn({
      organisationSlug: slug,
      redirectUri: new URL("/auth/callback", webConfig().APP_URL).href,
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(PENDING_SIGN_IN_COOKIE, sealPendingSignIn(pending), cookieOptions(PENDING_SIGN_IN_TIME_TO_LIVE_MS));
    return response;
  } catch (error) {
    if (isSignInError(error)) return signInFailedRedirect(error.code);
    throw error;
  }
}
