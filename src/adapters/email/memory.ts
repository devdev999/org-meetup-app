import type { EmailMessage, EmailPort } from "../../application/ports";

export class MemoryEmail implements EmailPort {
  readonly outbox: EmailMessage[] = [];
  readonly attempts: EmailMessage[] = [];
  failure: Error | undefined;
  sendDelay: Promise<void> | undefined;

  async sendMessage(message: EmailMessage): Promise<void> {
    this.attempts.push(structuredClone(message));
    await this.sendDelay;
    if (this.failure) throw this.failure;
    this.outbox.push(structuredClone(message));
  }

  reset(): void {
    this.outbox.length = 0;
    this.attempts.length = 0;
    this.failure = undefined;
    this.sendDelay = undefined;
  }
}
