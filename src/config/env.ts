import { z } from "zod";
import type { BootstrapConfig } from "../application/index";

/**
 * Everything the processes read from the environment, parsed once and
 * validated. Secrets come from the environment only (spec: Configuration and
 * operations); nothing here is ever written to the database.
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

const identityProviderSchema = z.enum(["oidc", "fake"]).default("oidc");

/** Which identity adapter to wire: the real OIDC one, or the in-memory issuer for local runs. */
export function identityProvider(env: NodeJS.ProcessEnv = process.env): "oidc" | "fake" {
  return identityProviderSchema.parse(present(env).IDENTITY_PROVIDER);
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

const bootstrapSchema = z.object({
  BOOTSTRAP_ORGANISATION_SLUG: z.string().regex(/^[a-z0-9-]+$/, "slug: lower-case letters, digits and hyphens"),
  BOOTSTRAP_ORGANISATION_NAME: z.string().min(1),
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
    organisation: { slug: v.BOOTSTRAP_ORGANISATION_SLUG, name: v.BOOTSTRAP_ORGANISATION_NAME },
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
  };
}
