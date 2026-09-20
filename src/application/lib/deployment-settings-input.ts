import { z } from "zod";
import { InvalidInputError } from "./errors";

const model = z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/);
const settingsSchema = z.object({
  aiBaseUrl: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }).nullable(),
  scoutModel: model,
  extractionModel: model,
  telegramBotUsername: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).nullable(),
  emailFrom: z.email().nullable(),
  timeZone: z.string().max(100).refine((value) => {
    if (/^[+-]/.test(value)) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }).transform((value) => new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone),
}).strict();

export type DeploymentSettings = z.infer<typeof settingsSchema>;

export function deploymentDefaults(input: Partial<DeploymentSettings> = {}): DeploymentSettings {
  return parseSettings({ aiBaseUrl: null, scoutModel: "gpt-5.6-luna", extractionModel: "gpt-5.6-luna",
    telegramBotUsername: null, emailFrom: null, timeZone: "UTC", ...input });
}

export function parseSettings(input: DeploymentSettings): DeploymentSettings {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-settings", "Supply an HTTP AI endpoint without credentials or query parameters, model names, a valid bot username, email sender and time zone. Leave unused integrations blank.");
  return parsed.data;
}
