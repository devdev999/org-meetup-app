import type { TelegramMessage, TelegramPort } from "../../application/ports";

export class MemoryTelegram implements TelegramPort {
  readonly outbox: TelegramMessage[] = [];
  readonly answers: Array<{ callbackId: string; text: string }> = [];
  failure: Error | undefined;
  sendDelay: Promise<void> | undefined;

  constructor(readonly botUsername: string | null = null) {}

  async sendMessage(message: TelegramMessage): Promise<void> {
    await this.sendDelay;
    if (this.failure) throw this.failure;
    this.outbox.push(structuredClone(message));
  }

  async answerCallback(input: { callbackId: string; text: string }): Promise<void> {
    if (this.failure) throw this.failure;
    this.answers.push({ ...input });
  }

  reset(): void {
    this.outbox.length = 0;
    this.answers.length = 0;
    this.failure = undefined;
    this.sendDelay = undefined;
  }
}
