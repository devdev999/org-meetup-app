import { Api } from "grammy";
import type { TelegramMessage, TelegramPort } from "../../application/ports";

export class GrammyTelegram implements TelegramPort {
  private readonly api: Api;
  readonly botUsername: string;

  constructor(config: { token: string; botUsername: string; apiRoot?: string }) {
    this.botUsername = config.botUsername;
    this.api = new Api(config.token, { timeoutSeconds: 10, apiRoot: config.apiRoot });
  }

  async sendMessage(message: TelegramMessage): Promise<void> {
    await this.api.sendMessage(message.chatId, message.text, {
      link_preview_options: { is_disabled: true },
      ...(message.joinMeetupId ? { reply_markup: { inline_keyboard: [[{ text: "Join Meetup", callback_data: `join:${message.joinMeetupId}` }]] } } : {}),
    });
  }

  async answerCallback(input: { callbackId: string; text: string }): Promise<void> {
    await this.api.answerCallbackQuery(input.callbackId, { text: input.text });
  }
}
