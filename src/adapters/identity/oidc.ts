import * as client from "openid-client";
import {
  IdentityError,
  type AuthorizationRequest,
  type IdentityPort,
  type OidcSettings,
  type RawClaims,
  type SignInCallback,
} from "../../application/ports";

export interface OidcIdentityOptions {
  /** Lets an issuer be reached over plain http. Only for a stub issuer in tests. */
  allowInsecureRequests?: boolean;
}

/**
 * Production identity adapter: OpenID Connect authorization code flow with
 * PKCE, through openid-client. Issuer metadata is discovered once per issuer
 * and cached for the life of the process.
 */
export class OidcIdentity implements IdentityPort {
  readonly #configurations = new Map<string, Promise<client.Configuration>>();
  readonly #options: OidcIdentityOptions;

  constructor(options: OidcIdentityOptions = {}) {
    this.#options = options;
  }

  async authorizationUrl(settings: OidcSettings, request: AuthorizationRequest): Promise<string> {
    const configuration = await this.#configuration(settings);
    const codeChallenge = await client.calculatePKCECodeChallenge(request.codeVerifier);
    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: request.redirectUri,
      scope: "openid email profile",
      state: request.state,
      nonce: request.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return url.href;
  }

  async claimsFromCallback(settings: OidcSettings, callback: SignInCallback): Promise<RawClaims> {
    const configuration = await this.#configuration(settings);
    let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
    try {
      tokens = await client.authorizationCodeGrant(configuration, new URL(callback.callbackUrl), {
        pkceCodeVerifier: callback.codeVerifier,
        expectedState: callback.expectedState,
        expectedNonce: callback.expectedNonce,
        idTokenExpected: true,
      });
    } catch (error) {
      throw new IdentityError(error instanceof Error ? error.message : String(error), { cause: error });
    }
    const idToken = tokens.claims();
    if (!idToken) {
      throw new IdentityError("the issuer returned no ID token");
    }
    // The ID token is authoritative; userinfo fills in claims it left out.
    let userinfo: RawClaims = {};
    if (tokens.access_token && configuration.serverMetadata().userinfo_endpoint) {
      try {
        userinfo = await client.fetchUserInfo(configuration, tokens.access_token, idToken.sub);
      } catch {
        // The ID token alone is enough to sign in.
      }
    }
    return { ...userinfo, ...idToken };
  }

  #configuration(settings: OidcSettings): Promise<client.Configuration> {
    const key = `${settings.issuer} ${settings.clientId}`;
    let configuration = this.#configurations.get(key);
    if (!configuration) {
      configuration = client
        .discovery(
          new URL(settings.issuer),
          settings.clientId,
          settings.clientSecret ?? undefined,
          undefined,
          this.#options.allowInsecureRequests ? { execute: [client.allowInsecureRequests] } : undefined,
        )
        .catch((error: unknown) => {
          this.#configurations.delete(key);
          throw new IdentityError(
            `issuer ${settings.issuer} could not be discovered: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        });
      this.#configurations.set(key, configuration);
    }
    return configuration;
  }
}
