import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Application } from "../../application/index";

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
    }
    if (callback?.message && !callback.from.is_bot && callback.message.chat.type === "private" && callback.message.chat.id === callback.from.id) {
      const meetupId = callback.data?.startsWith("join:") ? callback.data.slice(5) : undefined;
      if (meetupId) await application.handleTelegram({ kind: "join", chatId: String(callback.from.id), callbackId: callback.id, meetupId });
    }
    return Response.json({ ok: true });
  };
}
