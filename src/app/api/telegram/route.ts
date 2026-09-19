import { createTelegramWebhook } from "../../../adapters/telegram/webhook";
import { telegramConfig } from "../../../config/env";
import { application } from "../../../web/application";

export async function POST(request: Request): Promise<Response> {
  return createTelegramWebhook(application(), telegramConfig().webhookSecret)(request);
}
