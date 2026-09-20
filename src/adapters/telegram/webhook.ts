import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Application } from "../../application/index";
import { parseAvailabilityCallback } from "./availability-callback";

const sender = z.object({ id: z.number().int().positive(), is_bot: z.boolean() });
const chat = z.object({ id: z.number().int(), type: z.string() });
const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z.object({ from: sender.optional(), chat, text: z.string().optional() }).optional(),
  callback_query: z.object({
    id: z.string().min(1), from: sender, message: z.object({ chat }).optional(), data: z.string().optional(),
  }).optional(),
});

export function createTelegramWebhook(application: Application, secret: string | null) {
  return async (request: Request): Promise<Response> => {
    if (!secret) return new Response("Telegram is unavailable", { status: 503 });
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(secret))) return new Response("Unauthorized", { status: 401 });
    let input: unknown;
    try { input = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return new Response("Invalid update", { status: 400 });
    const { message, callback_query: callback } = parsed.data;
    if (message?.from && !message.from.is_bot && message.chat.type === "private" && message.chat.id === message.from.id) {
      const code = message.text?.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{1,64})$/)?.[1];
      if (code) await application.handleTelegram({ kind: "link", chatId: String(message.chat.id), code });
      if (message.text?.match(/^\/available(?:@[A-Za-z0-9_]+)?$/)) {
        await application.handleTelegram({ kind: "availability-menu", chatId: String(message.chat.id) });
      }
    }
    if (callback?.message && !callback.from.is_bot && callback.message.chat.type === "private" && callback.message.chat.id === callback.from.id) {
      const availability = callback.data ? parseAvailabilityCallback(callback.data) : undefined;
      if (availability) await application.handleTelegram({ ...availability, chatId: String(callback.from.id), callbackId: callback.id });
      const join = callback.data?.match(/^(join|join-event):(.+)$/);
      if (join) await application.handleTelegram(join[1] === "join-event"
        ? { kind: "join-event", chatId: String(callback.from.id), callbackId: callback.id, eventId: join[2]! }
        : { kind: "join", chatId: String(callback.from.id), callbackId: callback.id, meetupId: join[2]! });
      const inviteAnswer = callback.data?.match(/^(accept|decline):(.+)$/);
      if (inviteAnswer) await application.handleTelegram({
        kind: "answer-invite", chatId: String(callback.from.id), callbackId: callback.id,
        inviteId: inviteAnswer[2]!, answer: inviteAnswer[1] === "accept" ? "accept" : "decline",
      });
      const rsvpAnswer = callback.data?.match(/^(going|not-going)(-event)?:(.+)$/);
      if (rsvpAnswer) {
        const reply = { chatId: String(callback.from.id), callbackId: callback.id, answer: rsvpAnswer[1] === "going" ? "going" as const : "not-going" as const };
        await application.handleTelegram(rsvpAnswer[2]
          ? { ...reply, kind: "answer-event-rsvp", eventId: rsvpAnswer[3]! }
          : { ...reply, kind: "answer-rsvp", meetupId: rsvpAnswer[3]! });
      }
    }
    return Response.json({ ok: true });
  };
}
