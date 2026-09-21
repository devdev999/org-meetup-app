import { z } from "zod";
import type { DeploymentSettings, FirstPlatformAdminConfig } from "../application/index";
import type { AiToolProtocol } from "../application/ports";

export const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5439/org_meetup";

/** Drops empty strings so that `KEY=` in a compose file reads as "not set". */
function present(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""),
  );
}

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return present(env).DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

type AiConfig = { provider: "memory"; toolProtocol: AiToolProtocol } | { provider: "chat-completion"; apiKey: string; toolProtocol: AiToolProtocol };

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const values = present(env);
  const provider = z.enum(["memory", "chat-completion"]).default("memory").parse(values.AI_PROVIDER);
  const toolProtocol = z.enum(["native", "structured"]).default("native").parse(values.AI_TOOL_PROTOCOL);
  return provider === "memory" ? { provider, toolProtocol } : { provider, toolProtocol, apiKey: z.string().trim().min(1).parse(values.AI_API_KEY) };
}

export function deploymentSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): DeploymentSettings {
  const values = present(env);
  return { aiBaseUrl: values.AI_BASE_URL ?? null, scoutModel: values.AI_MODEL ?? "gpt-5.6-luna",
    extractionModel: values.AI_EXTRACTION_MODEL ?? values.AI_MODEL ?? "gpt-5.6-luna", telegramBotUsername: values.TELEGRAM_BOT_USERNAME ?? null,
    emailFrom: values.EMAIL_FROM ?? null, timeZone: values.TIME_ZONE ?? "UTC" };
}

const identityProviderSchema = z.enum(["oidc", "fake"]).default("oidc");

export function telegramConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = present(env);
  const provider = z.enum(["memory", "telegram"]).default("memory").parse(values.TELEGRAM_PROVIDER);
  const webhookSecret = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional().parse(values.TELEGRAM_WEBHOOK_SECRET);
  if (provider === "memory") return { provider, webhookSecret: webhookSecret ?? null };
  return {
    provider,
    webhookSecret: z.string().min(1).parse(webhookSecret),
    token: z.string().min(1).parse(values.TELEGRAM_BOT_TOKEN),
  };
}

export function emailConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = present(env);
  const provider = z.enum(["memory", "smtp"]).default("memory").parse(values.EMAIL_PROVIDER);
  if (provider === "memory") return { provider };
  return {
    provider,
    url: z.url({ protocol: /^smtps?$/ }).parse(values.SMTP_URL),
  };
}

/** Which identity adapter to wire: the real OIDC one, or the in-memory issuer for local runs. */
export function identityProvider(env: NodeJS.ProcessEnv = process.env): "oidc" | "fake" {
  return identityProviderSchema.parse(present(env).IDENTITY_PROVIDER);
}

export function oidcCredentials(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  try {
    return z.record(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/), z.string().min(1))
      .parse(JSON.parse(present(env).OIDC_CREDENTIALS ?? "{}"));
  } catch {
    throw new Error("OIDC_CREDENTIALS must be a JSON object of credential references and installed secrets.");
  }
}

/** Whether the built-in fake issuer, and its sign-in page, are switched on. */
export function fakeIssuerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return identityProvider(env) === "fake";
}

/**
 * The fake issuer lets anyone sign in as anyone, so a production build refuses
 * it unless the deployment says, in so many words, that it is a local run.
 */
export function assertFakeIssuerAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && present(env).ALLOW_FAKE_IDENTITY !== "yes") {
    throw new Error(
      "IDENTITY_PROVIDER=fake is refused when NODE_ENV=production. For a local run of the production images set ALLOW_FAKE_IDENTITY=yes; otherwise use IDENTITY_PROVIDER=oidc.",
    );
  }
}

const webSchema = z.object({
  /** Public base URL of the web process, used to build the sign-in redirect URI. */
  APP_URL: z.url().default("http://localhost:3000"),
  /** Seals the session and pending-sign-in cookies. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  IDENTITY_PROVIDER: identityProviderSchema,
});

export type WebConfig = z.infer<typeof webSchema>;

export function webConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  return webSchema.parse(present(env));
}

const firstPlatformSchema = z.object({
  BOOTSTRAP_ORGANISATION_SLUG: z.string().regex(/^[a-z0-9-]+$/),
  BOOTSTRAP_ORGANISATION_NAME: z.string().trim().min(1),
  BOOTSTRAP_OIDC_ISSUER: z.url(),
  BOOTSTRAP_OIDC_CLIENT_ID: z.string().trim().min(1),
  BOOTSTRAP_OIDC_CREDENTIAL_REF: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/).optional(),
  BOOTSTRAP_OIDC_CLAIM_EMAIL: z.string().default("email"),
  BOOTSTRAP_OIDC_CLAIM_NAME: z.string().default("name"),
  BOOTSTRAP_OIDC_CLAIM_DEPARTMENT: z.string().optional(),
  BOOTSTRAP_OIDC_CLAIM_SITE: z.string().optional(),
  BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER: z.string().optional(),
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: z.email(),
  BOOTSTRAP_PLATFORM_ADMIN_NAME: z.string().trim().min(1),
});

export function firstPlatformAdminConfig(env: NodeJS.ProcessEnv = process.env): FirstPlatformAdminConfig | undefined {
  const values = present(env);
  if (values.BOOTSTRAP_OIDC_CLIENT_SECRET) throw new Error("Install OIDC secrets through OIDC_CREDENTIALS and set BOOTSTRAP_OIDC_CREDENTIAL_REF.");
  if (!Object.keys(firstPlatformSchema.shape).some((key) => values[key] !== undefined)) return undefined;
  const v = firstPlatformSchema.parse(values);
  return {
    organisation: { slug: v.BOOTSTRAP_ORGANISATION_SLUG, name: v.BOOTSTRAP_ORGANISATION_NAME },
    oidc: {
      issuer: v.BOOTSTRAP_OIDC_ISSUER,
      clientId: v.BOOTSTRAP_OIDC_CLIENT_ID,
      credentialRef: v.BOOTSTRAP_OIDC_CREDENTIAL_REF ?? null,
      claimMapping: {
        email: v.BOOTSTRAP_OIDC_CLAIM_EMAIL,
        name: v.BOOTSTRAP_OIDC_CLAIM_NAME,
        ...(v.BOOTSTRAP_OIDC_CLAIM_DEPARTMENT ? { department: v.BOOTSTRAP_OIDC_CLAIM_DEPARTMENT } : {}),
        ...(v.BOOTSTRAP_OIDC_CLAIM_SITE ? { site: v.BOOTSTRAP_OIDC_CLAIM_SITE } : {}),
        ...(v.BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER ? { staffIdentifier: v.BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER } : {}),
      },
    },
    platformAdmin: { email: v.BOOTSTRAP_PLATFORM_ADMIN_EMAIL, name: v.BOOTSTRAP_PLATFORM_ADMIN_NAME },
  };
}
