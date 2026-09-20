import { deploymentDefaults, parseSettings, type DeploymentSettings } from "./deployment-settings-input";
export type { DeploymentSettings } from "./deployment-settings-input";
import { eq, isNull } from "drizzle-orm";
import type { AiRequestSettings } from "../ports";
import type { Deps } from "./deps";
import type { Queryable } from "./departments-and-sites";
import { platformConfiguration } from "./schema";

export async function readDeploymentSettings(db: Queryable, defaults: DeploymentSettings): Promise<DeploymentSettings> {
  const [configuration] = await db.select({ settings: platformConfiguration.settings }).from(platformConfiguration).where(eq(platformConfiguration.id, 1));
  return configuration?.settings ?? defaults;
}

export async function deploymentTimeZone(db: Queryable): Promise<string> {
  return (await readDeploymentSettings(db, deploymentDefaults())).timeZone;
}

export async function initializeDeploymentSettings(db: Queryable, defaults: DeploymentSettings): Promise<void> {
  await db.insert(platformConfiguration).values({ id: 1, settings: defaults })
    .onConflictDoUpdate({ target: platformConfiguration.id, set: { settings: defaults }, setWhere: isNull(platformConfiguration.settings) });
}

export async function updateDeploymentSettings(db: Queryable, input: DeploymentSettings): Promise<void> {
  const settings = parseSettings(input);
  await db.update(platformConfiguration).set({ settings }).where(eq(platformConfiguration.id, 1));
}

export async function extractionSettings(deps: Deps): Promise<AiRequestSettings> {
  const settings = await readDeploymentSettings(deps.db, deps.deploymentDefaults);
  return { baseUrl: settings.aiBaseUrl, model: settings.extractionModel };
}

export async function emailSender(deps: Deps): Promise<string> {
  const settings = await readDeploymentSettings(deps.db, deps.deploymentDefaults);
  if (!settings.emailFrom) throw new Error("An email sender has not been configured.");
  return settings.emailFrom;
}
