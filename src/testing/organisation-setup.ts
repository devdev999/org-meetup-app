import { FakeIdentity } from "../adapters/identity/fake";
import type { Application, FirstPlatformAdminConfig, MemberActions } from "../application";
import type { RawClaims } from "../application/ports";

export interface TestOrganisationConfig extends FirstPlatformAdminConfig {
  organisation: FirstPlatformAdminConfig["organisation"] & { departments?: string[]; sites?: string[] };
  organisationAdmin?: { email: string; name: string };
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
