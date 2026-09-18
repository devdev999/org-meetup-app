import {
  IdentityError,
  type AuthorizationRequest,
  type IdentityPort,
  type OidcSettings,
  type RawClaims,
  type SignInCallback,
} from "../../application/ports";

/**
 * In-memory identity adapter: an issuer that states whatever claims it is told to.
 *
 * It is stateless so that it works across processes: the authorization URL
 * carries the sign-in's state and issuer, and the "code" the issuer hands back
 * is the claims themselves, encoded. Tests and the local development sign-in
 * page both act as the issuer through `FakeIdentity.callbackUrl`.
 */
export class FakeIdentity implements IdentityPort {
  async authorizationUrl(settings: OidcSettings, request: AuthorizationRequest): Promise<string> {
    const url = new URL("authorize", withTrailingSlash(settings.issuer));
    url.searchParams.set("iss", settings.issuer);
    url.searchParams.set("client_id", settings.clientId);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    return url.toString();
  }

  async claimsFromCallback(settings: OidcSettings, callback: SignInCallback): Promise<RawClaims> {
    const url = new URL(callback.callbackUrl);
    if (url.searchParams.get("state") !== callback.expectedState) {
      throw new IdentityError("state does not match the sign-in that was started");
    }
    const code = url.searchParams.get("code");
    if (!code) {
      throw new IdentityError("callback carries no code");
    }
    const issued = decode(code);
    if (issued.iss !== settings.issuer) {
      throw new IdentityError("claims were issued by a different issuer");
    }
    return issued.claims;
  }

  /**
   * Acts as the issuer: answers the authorization request at `authorizationUrl`
   * by sending the browser back with `claims`.
   */
  static callbackUrl(authorizationUrl: string, claims: RawClaims): string {
    const request = new URL(authorizationUrl);
    const iss = request.searchParams.get("iss");
    const redirectUri = request.searchParams.get("redirect_uri");
    const state = request.searchParams.get("state");
    if (!iss || !redirectUri || !state) {
      throw new Error("not an authorization URL produced by FakeIdentity");
    }
    const callback = new URL(redirectUri);
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", encode({ iss, claims }));
    return callback.toString();
  }
}

interface IssuedCode {
  iss: string;
  claims: RawClaims;
}

function encode(issued: IssuedCode): string {
  return Buffer.from(JSON.stringify(issued), "utf8").toString("base64url");
}

function decode(code: string): IssuedCode {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(code, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as IssuedCode).iss === "string" &&
      typeof (parsed as IssuedCode).claims === "object"
    ) {
      return parsed as IssuedCode;
    }
  } catch {
    // not JSON: handled below
  }
  throw new IdentityError("code is not one this issuer handed out");
}

function withTrailingSlash(issuer: string): string {
  return issuer.endsWith("/") ? issuer : `${issuer}/`;
}
