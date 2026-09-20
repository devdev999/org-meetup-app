import type { RawClaims } from "../ports";
import type { TestOrganisationConfig } from "../../testing/organisation-setup";
export { organisationSetup, signInAs, signInAndAcknowledgeAs, signInForId, REDIRECT_URI, type TestOrganisationConfig } from "../../testing/organisation-setup";

/** Two Organisations, each with its own issuer, for tenancy tests. */
export const ministryA: TestOrganisationConfig = {
  organisation: { slug: "ministry-a", name: "Ministry A" },
  oidc: {
    issuer: "https://idp.ministry-a.example",
    clientId: "meetups",
    credentialRef: null,
    claimMapping: { email: "email", name: "name" },
  },
  platformAdmin: { email: "pat@ministry-a.example", name: "Pat Platform" },
};

export const ministryB: TestOrganisationConfig = {
  organisation: { slug: "ministry-b", name: "Ministry B" },
  oidc: {
    issuer: "https://login.ministry-b.example/realms/staff",
    clientId: "org-meetups",
    credentialRef: null,
    claimMapping: { email: "email", name: "name" },
  },
  platformAdmin: { email: "pat@ministry-b.example", name: "Pat Platform B" },
};

/** The same Organisation, but its issuer also states where people work: `ou` and `building` claims. */
export function withDepartmentAndSiteClaims(config: TestOrganisationConfig): TestOrganisationConfig {
  return {
    ...config,
    oidc: {
      ...config.oidc,
      claimMapping: { email: "email", name: "name", department: "ou", site: "building", staffIdentifier: "employee_number" },
    },
  };
}

/** Claims for a Member of Ministry A who is not on any roster. */
export const ana: RawClaims = { sub: "ana-1", email: "Ana.Silva@ministry-a.example", name: "Ana Silva" };
