import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { FakeIdentity } from "../../../adapters/identity/fake";
import type { RawClaims } from "../../../application/ports";
import { fakeIssuerEnabled } from "../../../config/env";
import { formText } from "../../../web/forms";

export async function POST(request: Request) {
  if (!fakeIssuerEnabled()) notFound();
  const formData = await request.formData();
  const authorizationUrl = formText(formData.get("authorization_url"));
  if (authorizationUrl === null) notFound();
  const claims: RawClaims = {};
  for (const claim of ["email", "name", "department", "site"]) {
    const value = formText(formData.get(claim));
    if (value !== null) claims[claim] = value;
  }
  claims.sub = typeof claims.email === "string" ? claims.email : "anonymous";
  return NextResponse.redirect(FakeIdentity.callbackUrl(authorizationUrl, claims), 303);
}
