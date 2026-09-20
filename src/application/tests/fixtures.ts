import { FakeIdentity } from "../../adapters/identity/fake";
import type { Application, FirstPlatformAdminConfig, MemberActions } from "../index";
import type { RawClaims } from "../ports";

export interface TestOrganisationConfig extends FirstPlatformAdminConfig {
  organisation: FirstPlatformAdminConfig["organisation"] & { departments?: string[]; sites?: string[] };
  organisationAdmin?: { email: string; name: string };
}

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

export const REDIRECT_URI = "https://meetups.example/auth/callback";

export function organisationSetup(h: { app: Application }) {
  let owner: TestOrganisationConfig | undefined;
  const configured = new Set<string>();
  const records = new Map<string, TestOrganisationConfig>();
  const claims = (settings: TestOrganisationConfig, person: { email: string; name: string }) => ({
    sub: person.email, [settings.oidc.claimMapping.email]: person.email, [settings.oidc.claimMapping.name]: person.name,
  });
  async function setupOrganisation(config: TestOrganisationConfig): Promise<void> {
    const key = JSON.stringify(config);
    if (configured.has(key)) return;
    if (!owner) {
      owner = config;
      await h.app.initializePlatform({ organisation: { slug: config.organisation.slug, name: config.organisation.name },
        oidc: config.oidc, platformAdmin: config.platformAdmin });
      if (!config.organisationAdmin && !config.organisation.departments?.length && !config.organisation.sites?.length) {
        configured.add(key);
        records.set(config.organisation.slug, config);
        return;
      }
    }
    const platform = await (await signInAndAcknowledgeAs(h, owner.organisation.slug, claims(owner, owner.platformAdmin))).platformAdmin();
    const existing = (await platform.organisations()).find((organisation) => organisation.slug === config.organisation.slug);
    const person = config.organisationAdmin ?? config.platformAdmin;
    const organisationAdmin = { email: person.email, name: person.name };
    if (!existing) {
      await platform.createOrganisation({ organisation: { slug: config.organisation.slug, name: config.organisation.name }, oidc: config.oidc, organisationAdmin });
    } else if (config.organisationAdmin || config.organisation.departments?.length || config.organisation.sites?.length) {
      await platform.setFirstOrganisationAdmin(existing.id, organisationAdmin);
    }
    if (config.organisation.departments?.length || config.organisation.sites?.length) {
      const admin = await (await signInAndAcknowledgeAs(h, config.organisation.slug, claims(config, organisationAdmin))).organisationAdmin();
      const lists = await admin.lists();
      for (const [kind, names, entries] of [["department", config.organisation.departments ?? [], lists.departments],
        ["site", config.organisation.sites ?? [], lists.sites]] as const) {
        for (const name of names) if (!entries.some((entry) => entry.name.toLowerCase() === name.trim().toLowerCase())) await admin.createListEntry(kind, name);
      }
    }
    configured.add(key);
    records.set(config.organisation.slug, { ...config, organisationAdmin });
  }
  async function organisationAdmin(slug = "ministry-a") {
    const config = records.get(slug);
    if (!config) throw new Error("Set up the Organisation before requesting its admin fixture.");
    const person = config.organisationAdmin ?? { email: "fixture-admin@example.test", name: "Organisation Admin" };
    await setupOrganisation({ ...config, organisationAdmin: person });
    return (await signInAndAcknowledgeAs(h, slug, claims(config, person))).organisationAdmin();
  }
  return { setupOrganisation, organisationAdmin };
}

/** Claims for a Member of Ministry A who is not on any roster. */
export const ana: RawClaims = { sub: "ana-1", email: "Ana.Silva@ministry-a.example", name: "Ana Silva" };

/** Runs a whole sign-in through the fake issuer and returns the Member as an actor. */
export async function signInAs(h: { app: Application }, organisationSlug: string, claims: RawClaims): Promise<MemberActions> {
  const memberId = await signInForId(h, organisationSlug, claims);
  const actor = await h.app.asMember(memberId);
  if (!actor) throw new Error(`signed in as ${memberId} but they are not an Active Member`);
  return actor;
}

export async function signInAndAcknowledgeAs(h: { app: Application }, organisationSlug: string, claims: RawClaims): Promise<MemberActions> {
  const actor = await signInAs(h, organisationSlug, claims);
  await actor.acknowledgeAdminVisibilityNotice();
  return actor;
}

export async function signInForId(h: { app: Application }, organisationSlug: string, claims: RawClaims): Promise<string> {
  const started = await h.app.beginSignIn({ organisationSlug, redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, claims);
  const { memberId } = await h.app.completeSignIn({ pending: started.pending, callbackUrl });
  return memberId;
}
