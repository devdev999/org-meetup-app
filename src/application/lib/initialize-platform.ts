import { eq } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail } from "./db";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { createOrganisationSchema, insertOrganisation } from "./platform-organisations";
import { members, platformConfiguration } from "./schema";
import { initializeDeploymentSettings } from "./deployment-settings";

const initialPlatformSchema = createOrganisationSchema.omit({ organisationAdmin: true }).extend({
  platformAdmin: createOrganisationSchema.shape.organisationAdmin,
});
export type FirstPlatformAdminConfig = z.infer<typeof initialPlatformSchema>;

export async function initializePlatform({ db, clock, deploymentDefaults }: Deps, input: FirstPlatformAdminConfig): Promise<void> {
  await db.transaction(async (tx) => {
    await initializeDeploymentSettings(tx, deploymentDefaults);
    const [configuration] = await tx.select().from(platformConfiguration).where(eq(platformConfiguration.id, 1)).for("update");
    if (configuration!.ownerOrganisationId) return;
    const parsed = initialPlatformSchema.safeParse(input);
    if (!parsed.success) throw new InvalidInputError("invalid-organisation", "Supply the platform owner's Organisation, issuer and first Platform Admin.");
    const now = clock.now();
    const organisation = await insertOrganisation(tx, parsed.data, now);
    await tx.insert(members).values({ organisationId: organisation.id, email: normaliseEmail(parsed.data.platformAdmin.email),
      name: parsed.data.platformAdmin.name, status: "provisioned", isPlatformAdmin: true, createdAt: now, updatedAt: now });
    await tx.update(platformConfiguration).set({ ownerOrganisationId: organisation.id }).where(eq(platformConfiguration.id, 1));
  });
}
