import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { AuthorizationRequest, OidcSettings } from "../../../application/ports";
import { OidcIdentity } from "../oidc";
import { startStubIssuer, type StubIssuer } from "./stub-issuer";

/**
 * Contract of the production identity adapter, against a stub issuer that
 * speaks OpenID Connect over loopback http.
 */

let stub: StubIssuer;

beforeAll(async () => {
  stub = await startStubIssuer();
});

afterAll(async () => {
  await stub.close();
});

const settings = (): OidcSettings => ({ issuer: stub.issuer, clientId: stub.clientId, clientSecret: stub.clientSecret });

const request: AuthorizationRequest = {
  redirectUri: "http://localhost:3000/auth/callback",
  state: "state-1",
  nonce: "nonce-1",
  codeVerifier: randomBytes(32).toString("base64url"),
};

const identity = () => new OidcIdentity({ allowInsecureRequests: true });

test("sends the browser to the issuer's authorization endpoint with PKCE, state and nonce", async () => {
  const url = new URL(await identity().authorizationUrl(settings(), request));

  expect(url.origin).toBe(stub.issuer);
  expect(url.pathname).toBe("/authorize");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: stub.clientId,
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: "state-1",
    nonce: "nonce-1",
    code_challenge_method: "S256",
  });
  expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("turns the issuer's callback into the ID token's claims, filled in from userinfo", async () => {
  const adapter = identity();
  const authorizationUrl = await adapter.authorizationUrl(settings(), request);
  const callbackUrl = stub.answer(authorizationUrl, {
    idToken: { sub: "ana-1", email: "ana@ministry-a.example" },
    userinfo: { name: "Ana Silva", department: "Finance" },
  });

  const claims = await adapter.claimsFromCallback(settings(), {
    callbackUrl,
    redirectUri: request.redirectUri,
    expectedState: request.state,
    expectedNonce: request.nonce,
    codeVerifier: request.codeVerifier,
  });

  expect(claims).toMatchObject({
    iss: stub.issuer,
    sub: "ana-1",
    email: "ana@ministry-a.example",
    name: "Ana Silva",
    department: "Finance",
  });
});

test("refuses a callback that answers a sign-in this browser did not start", async () => {
  const adapter = identity();
  const callbackUrl = stub.answer(await adapter.authorizationUrl(settings(), request), {
    idToken: { sub: "ana-1", email: "ana@ministry-a.example" },
  });

  await expect(
    adapter.claimsFromCallback(settings(), {
      callbackUrl,
      redirectUri: request.redirectUri,
      expectedState: "a-different-state",
      expectedNonce: request.nonce,
      codeVerifier: request.codeVerifier,
    }),
  ).rejects.toMatchObject({ name: "IdentityError" });
});

test("refuses an ID token whose nonce is not the one this browser started with", async () => {
  const adapter = identity();
  const callbackUrl = stub.answer(await adapter.authorizationUrl(settings(), request), {
    idToken: { sub: "ana-1", email: "ana@ministry-a.example" },
  });

  await expect(
    adapter.claimsFromCallback(settings(), {
      callbackUrl,
      redirectUri: request.redirectUri,
      expectedState: request.state,
      expectedNonce: "a-different-nonce",
      codeVerifier: request.codeVerifier,
    }),
  ).rejects.toMatchObject({ name: "IdentityError" });
});

test("refuses a code exchange with the wrong PKCE verifier", async () => {
  const adapter = identity();
  const callbackUrl = stub.answer(await adapter.authorizationUrl(settings(), request), {
    idToken: { sub: "ana-1", email: "ana@ministry-a.example" },
  });

  await expect(
    adapter.claimsFromCallback(settings(), {
      callbackUrl,
      redirectUri: request.redirectUri,
      expectedState: request.state,
      expectedNonce: request.nonce,
      codeVerifier: randomBytes(32).toString("base64url"),
    }),
  ).rejects.toMatchObject({ name: "IdentityError" });
});

test("an issuer that cannot be discovered is reported, not swallowed", async () => {
  const unreachable: OidcSettings = { issuer: "http://127.0.0.1:1", clientId: "x", clientSecret: null };

  await expect(identity().authorizationUrl(unreachable, request)).rejects.toMatchObject({ name: "IdentityError" });
});
