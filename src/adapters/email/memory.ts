import type { EmailMessage, EmailPort } from "../../application/ports";

export class MemoryEmail implements EmailPort {
  readonly outbox: EmailMessage[] = [];
  failure: Error | undefined;

  async sendMessage(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.outbox.push({ ...message });
  }

  reset(): void {
    this.outbox.length = 0;
    this.failure = undefined;
  }
}
