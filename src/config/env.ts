import { z } from "zod";
import type { BootstrapConfig } from "../application/index";

/**
 * Everything the processes read from the environment, parsed once and
 * validated. Bootstrap configuration is passed to the application to seed
 * the first Organisation, its choices, its OIDC settings and its Platform Admin.
 */

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

type AiConfig = { provider: "memory" } | {
  provider: "chat-completion";
  baseUrl: string;
  apiKey: string;
  model: string;
  extractionModel?: string;
};

const chatCompletionSchema = z.object({
  AI_BASE_URL: z.url({ protocol: /^https?$/ }),
  AI_API_KEY: z.string().trim().min(1),
  AI_MODEL: z.string().trim().min(1),
  AI_EXTRACTION_MODEL: z.string().trim().min(1).optional(),
});

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const values = present(env);
  const provider = z.enum(["memory", "chat-completion"]).default("memory").parse(values.AI_PROVIDER);
  if (provider === "memory") return { provider };
  const config = chatCompletionSchema.parse(values);
  return { provider, baseUrl: config.AI_BASE_URL, apiKey: config.AI_API_KEY, model: config.AI_MODEL,
    ...(config.AI_EXTRACTION_MODEL ? { extractionModel: config.AI_EXTRACTION_MODEL } : {}) };
}

const identityProviderSchema = z.enum(["oidc", "fake"]).default("oidc");

export function telegramConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = present(env);
  const provider = z.enum(["memory", "telegram"]).default("memory").parse(values.TELEGRAM_PROVIDER);
  const botUsername = z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional().parse(values.TELEGRAM_BOT_USERNAME);
  const webhookSecret = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional().parse(values.TELEGRAM_WEBHOOK_SECRET);
  if (provider === "memory") return { provider, botUsername: botUsername ?? null, webhookSecret: webhookSecret ?? null };
  return {
    provider,
    botUsername: z.string().min(1).parse(botUsername),
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
    from: z.email().parse(values.EMAIL_FROM),
  };
}

/** Which identity adapter to wire: the real OIDC one, or the in-memory issuer for local runs. */
export function identityProvider(env: NodeJS.ProcessEnv = process.env): "oidc" | "fake" {
  return identityProviderSchema.parse(present(env).IDENTITY_PROVIDER);
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

const bootstrapNamesSchema = z.string().transform((value, context): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    context.addIssue({ code: "custom", message: "expected a JSON array of names" });
    return z.NEVER;
  }
}).pipe(z.array(z.string().trim().min(1))).default([]);

const bootstrapSchema = z.object({
  BOOTSTRAP_ORGANISATION_SLUG: z.string().regex(/^[a-z0-9-]+$/, "slug: lower-case letters, digits and hyphens"),
  BOOTSTRAP_ORGANISATION_NAME: z.string().min(1),
  BOOTSTRAP_DEPARTMENTS: bootstrapNamesSchema,
  BOOTSTRAP_SITES: bootstrapNamesSchema,
  BOOTSTRAP_OIDC_ISSUER: z.url(),
  BOOTSTRAP_OIDC_CLIENT_ID: z.string().min(1),
  BOOTSTRAP_OIDC_CLIENT_SECRET: z.string().optional(),
  BOOTSTRAP_OIDC_CLAIM_EMAIL: z.string().default("email"),
  BOOTSTRAP_OIDC_CLAIM_NAME: z.string().default("name"),
  BOOTSTRAP_OIDC_CLAIM_DEPARTMENT: z.string().optional(),
  BOOTSTRAP_OIDC_CLAIM_SITE: z.string().optional(),
  BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER: z.string().optional(),
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL: z.email(),
  BOOTSTRAP_PLATFORM_ADMIN_NAME: z.string().min(1),
  BOOTSTRAP_ORGANISATION_ADMIN_EMAIL: z.email().optional(),
  BOOTSTRAP_ORGANISATION_ADMIN_NAME: z.string().trim().min(1).optional(),
}).refine((value) => Boolean(value.BOOTSTRAP_ORGANISATION_ADMIN_EMAIL) === Boolean(value.BOOTSTRAP_ORGANISATION_ADMIN_NAME), {
  message: "BOOTSTRAP_ORGANISATION_ADMIN_EMAIL and BOOTSTRAP_ORGANISATION_ADMIN_NAME must be set together",
});

/**
 * The first Organisation, its OIDC settings and the first Platform Admin, or
 * undefined when no BOOTSTRAP_ variables are set at all.
 */
export function bootstrapConfig(env: NodeJS.ProcessEnv = process.env): BootstrapConfig | undefined {
  const values = present(env);
  if (!Object.keys(values).some((key) => key.startsWith("BOOTSTRAP_"))) return undefined;
  const v = bootstrapSchema.parse(values);
  return {
    organisation: {
      slug: v.BOOTSTRAP_ORGANISATION_SLUG,
      name: v.BOOTSTRAP_ORGANISATION_NAME,
      departments: v.BOOTSTRAP_DEPARTMENTS,
      sites: v.BOOTSTRAP_SITES,
    },
    oidc: {
      issuer: v.BOOTSTRAP_OIDC_ISSUER,
      clientId: v.BOOTSTRAP_OIDC_CLIENT_ID,
      clientSecret: v.BOOTSTRAP_OIDC_CLIENT_SECRET ?? null,
      claimMapping: {
        email: v.BOOTSTRAP_OIDC_CLAIM_EMAIL,
        name: v.BOOTSTRAP_OIDC_CLAIM_NAME,
        ...(v.BOOTSTRAP_OIDC_CLAIM_DEPARTMENT ? { department: v.BOOTSTRAP_OIDC_CLAIM_DEPARTMENT } : {}),
        ...(v.BOOTSTRAP_OIDC_CLAIM_SITE ? { site: v.BOOTSTRAP_OIDC_CLAIM_SITE } : {}),
        ...(v.BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER ? { staffIdentifier: v.BOOTSTRAP_OIDC_CLAIM_STAFF_IDENTIFIER } : {}),
      },
    },
    platformAdmin: { email: v.BOOTSTRAP_PLATFORM_ADMIN_EMAIL, name: v.BOOTSTRAP_PLATFORM_ADMIN_NAME },
    ...(v.BOOTSTRAP_ORGANISATION_ADMIN_EMAIL && v.BOOTSTRAP_ORGANISATION_ADMIN_NAME ? {
      organisationAdmin: { email: v.BOOTSTRAP_ORGANISATION_ADMIN_EMAIL, name: v.BOOTSTRAP_ORGANISATION_ADMIN_NAME },
    } : {}),
  };
}
