import { expect, test } from "vitest";
import { createApplication, type Application } from "../index";
import { OidcIdentity } from "../../adapters/identity/oidc";
import { startStubIssuer, type StubIssuer } from "../../adapters/identity/tests/stub-issuer";
import { ControllableClock } from "../../adapters/clock/controllable";
import { MemoryAi } from "../../adapters/ai/memory";
import { MemoryTelegram } from "../../adapters/telegram/memory";
import { MemoryEmail } from "../../adapters/email/memory";
import { createTestDatabase } from "../../testing/test-database";
import { runMigrations } from "../../db/migrate";

async function signIn(app: Application, issuer: StubIssuer, slug: string, name: string, email: string) {
  const started = await app.beginSignIn({ organisationSlug: slug, redirectUri: "http://localhost:3000/auth/callback" });
  const result = await app.completeSignIn({ pending: started.pending, callbackUrl: issuer.answer(started.authorizationUrl, { idToken: { sub: email, name, email } }) });
  const actor = (await app.asMember(result.memberId))!;
  await actor.acknowledgeAdminVisibilityNotice();
  return actor;
}

test("new Organisations sign in through real OIDC, including a required credential installed on restart", async () => {
  const database = await createTestDatabase();
  const publicIssuer = await startStubIssuer({ tokenEndpointAuthMethods: ["none"] });
  const privateIssuer = await startStubIssuer();
  const dependencies = { pool: database.pool, clock: new ControllableClock(new Date()), ai: new MemoryAi(), telegram: new MemoryTelegram(), email: new MemoryEmail(),
    deploymentDefaults: { timeZone: "Asia/Singapore" } };
  try {
    await runMigrations(database.pool);
    const app = createApplication({ ...dependencies, identity: new OidcIdentity({ allowInsecureRequests: true }) });
    const oidc = { issuer: publicIssuer.issuer, clientId: publicIssuer.clientId, credentialRef: null, claimMapping: { email: "email", name: "name" } };
    await app.initializePlatform({ organisation: { slug: "owner", name: "Owner" }, oidc, platformAdmin: { name: "Pat", email: "pat@example.test" } });
    const changedDefaults = createApplication({ ...dependencies, deploymentDefaults: {}, identity: new OidcIdentity({ allowInsecureRequests: true }) });
    expect(await changedDefaults.timeZone()).toBe("Asia/Singapore");
    const platform = await (await signIn(app, publicIssuer, "owner", "Pat", "pat@example.test")).platformAdmin();
    const ready = await platform.createOrganisation({ organisation: { slug: "public-agency", name: "Public Agency" }, oidc,
      organisationAdmin: { name: "Olivia", email: "olivia@public-agency.example" } });
    expect(ready.signInReady).toBe(true);
    const olivia = await signIn(app, publicIssuer, "public-agency", "Olivia", "olivia@public-agency.example");
    expect((await (await olivia.organisationAdmin()).lists()).activities).toHaveLength(7);
    const awaiting = await platform.createOrganisation({ organisation: { slug: "private-agency", name: "Private Agency" },
      oidc: { ...oidc, issuer: privateIssuer.issuer, clientId: privateIssuer.clientId, credentialRef: "private-sso" },
      organisationAdmin: { name: "Priya", email: "priya@private-agency.example" } });
    expect(awaiting.signInReady).toBe(false);
    await expect(app.beginSignIn({ organisationSlug: awaiting.slug, redirectUri: "http://localhost:3000/auth/callback" }))
      .rejects.toMatchObject({ code: "not-configured" });
    const restarted = createApplication({ ...dependencies, identity: new OidcIdentity({ allowInsecureRequests: true, credentials: { "private-sso": privateIssuer.clientSecret } }) });
    const priya = await signIn(restarted, privateIssuer, awaiting.slug, "Priya", "priya@private-agency.example");
    expect(await priya.organisationAdmin()).toBeDefined();
    const restartedPlatform = await (await signIn(restarted, publicIssuer, "owner", "Pat", "pat@example.test")).platformAdmin();
    expect((await restartedPlatform.organisations()).find((organisation) => organisation.id === awaiting.id)!.signInReady).toBe(true);
    expect(JSON.stringify(await restartedPlatform.organisations())).not.toContain(privateIssuer.clientSecret);
    const sameOlivia = await signIn(restarted, publicIssuer, "public-agency", "Olivia", "olivia@public-agency.example");
    expect((await sameOlivia.profile()).memberId).toBe((await olivia.profile()).memberId);
  } finally {
    await publicIssuer.close();
    await privateIssuer.close();
    await database.dispose();
  }
});
