import type { AiPort, Clock, EmailPort, IdentityPort, TelegramPort } from "../ports";
import type { Database } from "./db";
import type { DeploymentSettings } from "./deployment-settings-input";

/** What every command and query needs: the database and the ports. */
export interface Deps {
  deploymentDefaults: DeploymentSettings;
  db: Database;
  identity: IdentityPort;
  clock: Clock;
  ai: AiPort;
  telegram: TelegramPort;
  email: EmailPort;
}
