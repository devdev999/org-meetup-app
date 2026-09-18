import { expect, test } from "vitest";
import { FakeIdentity } from "../../adapters/identity/fake";
import { ana, ministryA, REDIRECT_URI, signInAndAcknowledgeAs, signInAs, signInForId } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("an email nobody knows signs in and becomes an Active Member of the issuer's Organisation", async () => {
  await h.app.bootstrap(ministryA);

  const started = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  expect(started.authorizationUrl).toMatch(/^https:\/\/idp\.ministry-a\.example\/authorize\?/);

  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, ana);
  const { memberId } = await h.app.completeSignIn({ pending: started.pending, callbackUrl });

  const actor = await h.app.asMember(memberId);
  await actor?.acknowledgeAdminVisibilityNotice();
  expect(await actor?.profile()).toMatchObject({
    memberId,
    name: "Ana Silva",
    email: "ana.silva@ministry-a.example",
    status: "active",
    organisation: { slug: "ministry-a", name: "Ministry A" },
    department: null,
    site: null,
    isPlatformAdmin: false,
  });
});

test("a Provisioned Member who signs in becomes that Member, Active, keeping their roster name", async () => {
  await h.app.bootstrap(ministryA);

  const pat = await signInAndAcknowledgeAs(h, "ministry-a", {
    sub: "pat-1",
    email: "PAT@ministry-a.example",
    name: "Patricia Platform",
  });

  expect(await pat.profile()).toMatchObject({
    name: "Pat Platform",
    email: "pat@ministry-a.example",
    status: "active",
    isPlatformAdmin: true,
  });
});

test("signing in again binds to the same Member", async () => {
  await h.app.bootstrap(ministryA);

  const first = await signInForId(h, "ministry-a", ana);
  const second = await signInForId(h, "ministry-a", { ...ana, sub: "ana-new-device" });

  expect(second).toBe(first);
});

test("the first sign-in asks the Member to acknowledge what Organisation Admins can see, once", async () => {
  await h.app.bootstrap(ministryA);
  const actor = await signInAs(h, "ministry-a", ana);
  expect(await actor.adminVisibilityNotice()).toEqual({
    name: "Ana Silva",
    organisation: { slug: "ministry-a", name: "Ministry A" },
  });

  h.clock.set(new Date("2026-09-18T09:05:00.000Z"));
  await actor.acknowledgeAdminVisibilityNotice();
  expect(await actor.adminVisibilityNotice()).toBeUndefined();
  expect((await actor.profile()).adminVisibilityNoticeAcknowledgedAt).toEqual(new Date("2026-09-18T09:05:00.000Z"));

  h.clock.set(new Date("2026-09-19T08:00:00.000Z"));
  const nextDay = await signInAs(h, "ministry-a", ana);
  expect(await nextDay.adminVisibilityNotice()).toBeUndefined();
  await nextDay.acknowledgeAdminVisibilityNotice();
  expect((await nextDay.profile()).adminVisibilityNoticeAcknowledgedAt).toEqual(new Date("2026-09-18T09:05:00.000Z"));
});

test("a sign-in that takes longer than ten minutes is refused", async () => {
  await h.app.bootstrap(ministryA);
  const started = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, ana);

  h.clock.advance(11 * 60 * 1000);

  await expect(h.app.completeSignIn({ pending: started.pending, callbackUrl })).rejects.toMatchObject({
    name: "SignInError",
    code: "expired",
  });
});

test("a callback that answers a different sign-in than the one this browser started is refused", async () => {
  await h.app.bootstrap(ministryA);
  const thisBrowser = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  const otherBrowser = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(otherBrowser.authorizationUrl, ana);

  await expect(h.app.completeSignIn({ pending: thisBrowser.pending, callbackUrl })).rejects.toMatchObject({
    name: "SignInError",
    code: "rejected",
  });
});

test("an Organisation nobody has heard of cannot be signed in to", async () => {
  await h.app.bootstrap(ministryA);

  await expect(h.app.beginSignIn({ organisationSlug: "nowhere", redirectUri: REDIRECT_URI })).rejects.toMatchObject({
    name: "SignInError",
    code: "unknown-organisation",
  });
});

test("a login whose claims carry no email cannot be bound to a Member", async () => {
  await h.app.bootstrap(ministryA);
  const started = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, { sub: "anon-1", name: "No Email" });

  await expect(h.app.completeSignIn({ pending: started.pending, callbackUrl })).rejects.toMatchObject({
    name: "SignInError",
    code: "no-email",
  });
});

test("a login whose issuer says the email is not verified is refused", async () => {
  await h.app.bootstrap(ministryA);
  const started = await h.app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: REDIRECT_URI });
  const callbackUrl = FakeIdentity.callbackUrl(started.authorizationUrl, { ...ana, email_verified: false });

  await expect(h.app.completeSignIn({ pending: started.pending, callbackUrl })).rejects.toMatchObject({
    name: "SignInError",
    code: "unverified-email",
  });
});

test("a login that states no name shows the email as the name until a later login supplies one", async () => {
  await h.app.bootstrap(ministryA);
  const nameless = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana-1", email: "ana.silva@ministry-a.example" });
  expect((await nameless.profile()).name).toBe("ana.silva@ministry-a.example");

  const named = await signInAs(h, "ministry-a", ana);

  expect((await named.profile()).name).toBe("Ana Silva");
});
