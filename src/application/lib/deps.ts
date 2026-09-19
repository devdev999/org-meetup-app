import type { AiPort, Clock, EmailPort, IdentityPort, TelegramPort } from "../ports";
import type { Database } from "./db";

/** What every command and query needs: the database and the ports. */
export interface Deps {
  db: Database;
  identity: IdentityPort;
  clock: Clock;
  ai: AiPort;
  telegram: TelegramPort;
  email: EmailPort;
}
