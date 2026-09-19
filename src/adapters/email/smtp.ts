import { createHash } from "node:crypto";
import { createTransport } from "nodemailer";
import type { EmailMessage, EmailPort } from "../../application/ports";

export class SmtpEmail implements EmailPort {
  private readonly transport;

  constructor(private readonly config: { url: string; from: string }) {
    this.transport = createTransport({
      url: config.url, connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000,
      disableFileAccess: true, disableUrlAccess: true,
    });
  }

  async sendMessage(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from, to: message.to, subject: message.subject, text: message.text,
      messageId: `<${createHash("sha256").update(message.id).digest("hex")}@org-meetups>`,
    });
  }
}
