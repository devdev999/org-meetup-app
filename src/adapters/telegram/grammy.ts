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
    const rsvpId = message.rsvpEventId ?? message.rsvpMeetupId;
    const joinId = message.joinEventId ?? message.joinMeetupId;
    const buttons = message.confirmAttendanceNoticeId ? [
      { text: "Everyone came, including me", callback_data: `attendance:${message.confirmAttendanceNoticeId}` },
    ] : message.inviteId ? [
      { text: "Accept", callback_data: `accept:${message.inviteId}` },
      { text: "Decline", callback_data: `decline:${message.inviteId}` },
    ] : rsvpId ? [
      { text: "Going", callback_data: `going${message.rsvpEventId ? "-event" : ""}:${rsvpId}` },
      { text: "Not going", callback_data: `not-going${message.rsvpEventId ? "-event" : ""}:${rsvpId}` },
    ] : joinId ? [{ text: message.joinEventId ? "Join Event" : "Join Meetup", callback_data: `join${message.joinEventId ? "-event" : ""}:${joinId}` }] : [];
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
