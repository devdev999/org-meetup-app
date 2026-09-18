"use server";

import { notFound, redirect } from "next/navigation";
import { FakeIdentity } from "../../../adapters/identity/fake";
import type { RawClaims } from "../../../application/ports";
import { identityProvider } from "../../../config/env";

/** The fake issuer answers the sign-in with whatever the form said. */
export async function issueClaims(formData: FormData): Promise<void> {
  if (identityProvider() !== "fake") notFound();
  const authorizationUrl = formData.get("authorization_url");
  if (typeof authorizationUrl !== "string") notFound();

  const claims: RawClaims = {};
  for (const claim of ["email", "name", "department", "site", "staff_identifier"]) {
    const value = formData.get(claim);
    if (typeof value === "string" && value.trim() !== "") claims[claim] = value.trim();
  }
  claims.sub = typeof claims.email === "string" ? claims.email : "anonymous";

  redirect(FakeIdentity.callbackUrl(authorizationUrl, claims));
}
