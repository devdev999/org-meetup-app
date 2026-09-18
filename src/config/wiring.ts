import { Pool } from "pg";
import { SystemClock } from "../adapters/clock/system";
import { FakeIdentity } from "../adapters/identity/fake";
import { OidcIdentity } from "../adapters/identity/oidc";
import { createApplication, type Application } from "../application/index";
import type { IdentityPort } from "../application/ports";
import { databaseUrl, identityProvider } from "./env";

/**
 * Production wiring, shared by the web process, the worker and the setup
 * script: one connection pool, the adapters the environment asks for, and
 * the application on top.
 */

export function connectPool(): Pool {
  return new Pool({ connectionString: databaseUrl() });
}

export function identityFromEnv(): IdentityPort {
  if (identityProvider() === "fake") {
    console.warn("IDENTITY_PROVIDER=fake: anyone can sign in as anyone. Local development only.");
    return new FakeIdentity();
  }
  return new OidcIdentity();
}

export function applicationFromEnv(pool: Pool): Application {
  return createApplication({ pool, identity: identityFromEnv(), clock: new SystemClock() });
}
