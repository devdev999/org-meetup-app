import { Pool } from "pg";
import { ChatCompletionAi } from "../adapters/ai/chat-completion";
import { MemoryAi } from "../adapters/ai/memory";
import { MemoryTelegram } from "../adapters/telegram/memory";
import { MemoryEmail } from "../adapters/email/memory";
import { SmtpEmail } from "../adapters/email/smtp";
import { GrammyTelegram } from "../adapters/telegram/grammy";
import { SystemClock } from "../adapters/clock/system";
import { FakeIdentity } from "../adapters/identity/fake";
import { OidcIdentity } from "../adapters/identity/oidc";
import { createApplication, type Application } from "../application/index";
import type { AiPort, EmailPort, IdentityPort, TelegramPort } from "../application/ports";
import { aiConfig, assertFakeIssuerAllowed, deploymentSettingsFromEnv, databaseUrl, emailConfig, fakeIssuerEnabled, oidcCredentials, telegramConfig } from "./env";

/**
 * Production wiring, shared by the web process, the worker and the setup
 * script: one connection pool, the adapters the environment asks for, and
 * the application on top.
 */

export function connectPool(): Pool {
  return new Pool({ connectionString: databaseUrl() });
}

export function identityFromEnv(): IdentityPort {
  const credentials = oidcCredentials();
  if (fakeIssuerEnabled()) {
    assertFakeIssuerAllowed();
    console.warn("IDENTITY_PROVIDER=fake: anyone can sign in as anyone. Local development only.");
    return new FakeIdentity(Object.keys(credentials));
  }
  return new OidcIdentity({ credentials });
}

export function applicationFromEnv(pool: Pool): Application {
  return createApplication({ deploymentDefaults: deploymentSettingsFromEnv(), pool, identity: identityFromEnv(), clock: new SystemClock(), ai: aiFromEnv(), telegram: telegramFromEnv(), email: emailFromEnv() });
}

export function telegramFromEnv(): TelegramPort {
  const config = telegramConfig();
  return config.provider === "memory" ? new MemoryTelegram() : new GrammyTelegram(config);
}

export function emailFromEnv(): EmailPort {
  const config = emailConfig();
  return config.provider === "memory" ? new MemoryEmail() : new SmtpEmail(config);
}

export function aiFromEnv(): AiPort {
  const config = aiConfig();
  return config.provider === "memory" ? new MemoryAi() : new ChatCompletionAi(config);
}
