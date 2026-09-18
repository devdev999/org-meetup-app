"use server";

import { notFound, redirect } from "next/navigation";
import { FakeIdentity } from "../../../adapters/identity/fake";
import type { RawClaims } from "../../../application/ports";
import { fakeIssuerEnabled } from "../../../config/env";
import { formText } from "../../../web/forms";

/** The fake issuer answers the sign-in with whatever the form said. */
export async function issueClaims(formData: FormData): Promise<void> {
  if (!fakeIssuerEnabled()) notFound();
  const authorizationUrl = formText(formData.get("authorization_url"));
  if (authorizationUrl === null) notFound();

  const claims: RawClaims = {};
  for (const claim of ["email", "name", "department", "site"]) {
    const value = formText(formData.get(claim));
    if (value !== null) claims[claim] = value;
  }
  claims.sub = typeof claims.email === "string" ? claims.email : "anonymous";

  redirect(FakeIdentity.callbackUrl(authorizationUrl, claims));
}
