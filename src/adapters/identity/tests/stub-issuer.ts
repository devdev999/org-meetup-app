import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

/**
 * A minimal OpenID Connect issuer for testing the production identity adapter:
 * discovery, JWKS, token endpoint (authorization code with PKCE and
 * client_secret_post or client_secret_basic) and userinfo. The test plays the
 * person: `answer` takes the authorization URL the adapter built and returns
 * the callback URL the browser would be sent to.
 */
export interface StubIssuer {
  issuer: string;
  clientId: string;
  clientSecret: string;
  answer(authorizationUrl: string, identity: { idToken: Record<string, unknown>; userinfo?: Record<string, unknown> }): string;
  close(): Promise<void>;
}

interface IssuedCode {
  redirectUri: string;
  nonce: string;
  codeChallenge: string;
  idToken: Record<string, unknown>;
  userinfo: Record<string, unknown>;
}

export async function startStubIssuer(): Promise<StubIssuer> {
  const clientId = "org-meetups";
  const clientSecret = "stub-secret";
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "stub-1", alg: "RS256", use: "sig" };
  const codes = new Map<string, IssuedCode>();
  const accessTokens = new Map<string, Record<string, unknown>>();
  let issuer = "";

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === "/.well-known/openid-configuration") {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      });
    }
    if (url.pathname === "/jwks") {
      return json(200, { keys: [jwk] });
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const body = new URLSearchParams(await readBody(request));
      const credentials = clientCredentials(request, body);
      if (credentials.clientId !== clientId || credentials.clientSecret !== clientSecret) {
        return json(401, { error: "invalid_client" });
      }
      const issued = codes.get(body.get("code") ?? "");
      if (!issued || body.get("grant_type") !== "authorization_code") {
        return json(400, { error: "invalid_grant", error_description: "unknown code" });
      }
      codes.delete(body.get("code") ?? "");
      if (body.get("redirect_uri") !== issued.redirectUri) {
        return json(400, { error: "invalid_grant", error_description: "redirect_uri differs" });
      }
      const verifier = body.get("code_verifier");
      if (!verifier || s256(verifier) !== issued.codeChallenge) {
        return json(400, { error: "invalid_grant", error_description: "PKCE verifier does not match" });
      }
      const accessToken = randomBytes(16).toString("hex");
      accessTokens.set(accessToken, { sub: issued.idToken.sub, ...issued.userinfo });
      const idToken = await new SignJWT({ ...issued.idToken, nonce: issued.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "stub-1" })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setSubject(String(issued.idToken.sub))
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: 300, id_token: idToken });
    }
    if (url.pathname === "/userinfo") {
      const token = request.headers.authorization?.replace(/^Bearer /, "");
      const claims = token ? accessTokens.get(token) : undefined;
      if (!claims) return json(401, { error: "invalid_token" });
      return json(200, claims);
    }
    return json(404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    clientId,
    clientSecret,
    answer(authorizationUrl, identity) {
      const request = new URL(authorizationUrl);
      const p = (name: string) => {
        const value = request.searchParams.get(name);
        if (!value) throw new Error(`authorization request lacks ${name}`);
        return value;
      };
      if (p("response_type") !== "code") throw new Error("only response_type=code is supported");
      if (p("client_id") !== clientId) throw new Error("unknown client_id");
      if (p("code_challenge_method") !== "S256") throw new Error("only S256 PKCE is supported");
      if (!p("scope").split(" ").includes("openid")) throw new Error("scope lacks openid");
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        redirectUri: p("redirect_uri"),
        nonce: p("nonce"),
        codeChallenge: p("code_challenge"),
        idToken: identity.idToken,
        userinfo: identity.userinfo ?? {},
      });
      const callback = new URL(p("redirect_uri"));
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", p("state"));
      return callback.href;
    },
    close: () => closeServer(server),
  };
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function clientCredentials(request: IncomingMessage, body: URLSearchParams): { clientId?: string; clientSecret?: string } {
  const basic = request.headers.authorization?.match(/^Basic (.+)$/);
  if (basic?.[1]) {
    const [id, secret] = Buffer.from(basic[1], "base64").toString("utf8").split(":");
    return { clientId: decodeURIComponent(id ?? ""), clientSecret: decodeURIComponent(secret ?? "") };
  }
  return { clientId: body.get("client_id") ?? undefined, clientSecret: body.get("client_secret") ?? undefined };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
