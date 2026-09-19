import { Pool } from "pg";
import { ChatCompletionAi } from "../adapters/ai/chat-completion";
import { MemoryAi } from "../adapters/ai/memory";
import { SystemClock } from "../adapters/clock/system";
import { FakeIdentity } from "../adapters/identity/fake";
import { OidcIdentity } from "../adapters/identity/oidc";
import { createApplication, type Application } from "../application/index";
import type { AiPort, IdentityPort } from "../application/ports";
import { aiConfig, assertFakeIssuerAllowed, databaseUrl, fakeIssuerEnabled } from "./env";

/**
 * Production wiring, shared by the web process, the worker and the setup
 * script: one connection pool, the adapters the environment asks for, and
 * the application on top.
 */

export function connectPool(): Pool {
  return new Pool({ connectionString: databaseUrl() });
}

export function identityFromEnv(): IdentityPort {
  if (fakeIssuerEnabled()) {
    assertFakeIssuerAllowed();
    console.warn("IDENTITY_PROVIDER=fake: anyone can sign in as anyone. Local development only.");
    return new FakeIdentity();
  }
  return new OidcIdentity();
}

export function applicationFromEnv(pool: Pool): Application {
  return createApplication({ pool, identity: identityFromEnv(), clock: new SystemClock(), ai: aiFromEnv() });
}

export function aiFromEnv(): AiPort {
  const config = aiConfig();
  return config.provider === "memory" ? new MemoryAi() : new ChatCompletionAi(config);
}
