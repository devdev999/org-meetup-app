import { normaliseEmail } from "./db";
import type { Deps } from "./deps";
import { members, organisationOidcSettings, organisations, type ClaimMapping } from "./schema";

/**
 * Configuration-driven seed of the first Organisation, its OIDC settings and
 * the first Platform Admin. Idempotent: configuration is the source of truth
 * until the Platform Admin ticket replaces this.
 */
export interface BootstrapConfig {
  organisation: { slug: string; name: string };
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string | null;
    claimMapping: ClaimMapping;
  };
  platformAdmin: { email: string; name: string };
}

export async function bootstrap({ db, clock }: Deps, config: BootstrapConfig): Promise<void> {
  const now = clock.now();
  await db.transaction(async (tx) => {
    const [organisation] = await tx
      .insert(organisations)
      .values({ slug: config.organisation.slug, name: config.organisation.name, createdAt: now })
      .onConflictDoUpdate({ target: organisations.slug, set: { name: config.organisation.name } })
      .returning({ id: organisations.id });
    if (!organisation) throw new Error("bootstrap: Organisation upsert returned no row");

    const oidc = {
      issuer: config.oidc.issuer,
      clientId: config.oidc.clientId,
      clientSecret: config.oidc.clientSecret,
      claimMapping: config.oidc.claimMapping,
      updatedAt: now,
    };
    await tx
      .insert(organisationOidcSettings)
      .values({ organisationId: organisation.id, ...oidc })
      .onConflictDoUpdate({ target: organisationOidcSettings.organisationId, set: oidc });

    await tx
      .insert(members)
      .values({
        organisationId: organisation.id,
        email: normaliseEmail(config.platformAdmin.email),
        name: config.platformAdmin.name,
        status: "provisioned",
        isPlatformAdmin: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [members.organisationId, members.email],
        set: { isPlatformAdmin: true, updatedAt: now },
      });
  });
}
