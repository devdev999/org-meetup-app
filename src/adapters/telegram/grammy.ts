import { Api } from "grammy";
import type { TelegramMessage, TelegramPort } from "../../application/ports";
import { availabilityCallback } from "./availability-callback";

export class GrammyTelegram implements TelegramPort {
  private readonly api: Api;
  readonly botUsername: string;

  constructor(config: { token: string; botUsername: string; apiRoot?: string }) {
    this.botUsername = config.botUsername;
    this.api = new Api(config.token, { timeoutSeconds: 10, apiRoot: config.apiRoot });
  }

  async sendMessage(message: TelegramMessage): Promise<void> {
    const buttons = message.inviteId ? [
      { text: "Accept", callback_data: `accept:${message.inviteId}` },
      { text: "Decline", callback_data: `decline:${message.inviteId}` },
    ] : message.joinMeetupId ? [{ text: "Join Meetup", callback_data: `join:${message.joinMeetupId}` }] : [];
    const keyboard = message.buttons?.map((row) => row.map((button) => ({ text: button.text, callback_data: availabilityCallback(button.action) }))) ?? (buttons.length ? [buttons] : []);
    await this.api.sendMessage(message.chatId, message.text, {
      link_preview_options: { is_disabled: true },
      ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }

  async answerCallback(input: { callbackId: string; text: string }): Promise<void> {
    await this.api.answerCallbackQuery(input.callbackId, { text: input.text });
  }
}
