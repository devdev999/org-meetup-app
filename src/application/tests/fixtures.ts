import { FakeIdentity } from "../../adapters/identity/fake";
import type { BootstrapConfig, MemberActions } from "../index";
import type { RawClaims } from "../ports";
import type { Harness } from "./harness";

/** Two Organisations, each with its own issuer, for tenancy tests. */
export const ministryA: BootstrapConfig = {
  organisation: { slug: "ministry-a", name: "Ministry A" },
  oidc: {
    issuer: "https://idp.ministry-a.example",
    clientId: "meetups",
    clientSecret: "ministry-a-secret",
    claimMapping: { email: "email", name: "name" },
  },
  platformAdmin: { email: "pat@ministry-a.example", name: "Pat Platform" },
};

export const ministryB: BootstrapConfig = {
  organisation: { slug: "ministry-b", name: "Ministry B" },
  oidc: {
    issuer: "https://login.ministry-b.example/realms/staff",
    clientId: "org-meetups",
    clientSecret: null,
    claimMapping: { email: "email", name: "name" },
  },
  platformAdmin: { email: "pat@ministry-b.example", name: "Pat Platform B" },
};

/** The same Organisation, but its issuer also states where people work: `ou` and `building` claims. */
export function withDepartmentAndSiteClaims(config: BootstrapConfig): BootstrapConfig {
  return {
    ...config,
    oidc: {
      ...config.oidc,
      claimMapping: { email: "email", name: "name", department: "ou", site: "building", staffIdentifier: "employee_number" },
    },
  };
}

export const REDIRECT_URI = "https://meetups.example/auth/callback";

/** Claims for a Member of Ministry A who is not on any roster. */
export const ana: RawClaims = { sub: "ana-1", email: "Ana.Silva@ministry-a.example", name: "Ana Silva" };

/** Runs a whole sign-in through the fake issuer and returns the Member as an actor. */
export async function signInAs(h: Harness, organisationSlug: string, claims: RawClaims): Promise<MemberActions> {
  const memberId = await signInForId(h, organisationSlug, claims);
  const actor = await h.app.asMember(memberId);
  if (!actor) throw new Error(`signed in as ${memberId} but they are not an Active Member`);
  return actor;
}

export async function signInForId(h: Harness, organisationSlug: string, claims: RawClaims): Promise<string> {
  const started = await h.app.beginSignIn({ organisationSlug, redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, claims);
  const { memberId } = await h.app.completeSignIn({ pending: started.pending, callbackUrl });
  return memberId;
}
