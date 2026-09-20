import { createServer } from "node:http";
import { expect, test } from "vitest";
import { GrammyTelegram } from "../grammy";

test("the Telegram adapter sends a plain notice with a join button and answers callbacks", async () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  let reject = false;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(reject ? { ok: false, error_code: 429, description: "Too many requests" } : { ok: true, result: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  try {
    const telegram = new GrammyTelegram({ token: "123:test", botUsername: "test_bot", apiRoot: `http://127.0.0.1:${address.port}` });
    await telegram.sendMessage({ chatId: "101", text: "Bo joined your Meetup.", joinMeetupId: "d9f1542a-5d3c-4bb2-83ec-a2c5ae0bc2a5" });
    await telegram.answerCallback({ callbackId: "callback-1", text: "You joined the Meetup." });
    expect(requests).toEqual([
      { path: "/bot123:test/sendMessage", body: {
        chat_id: "101", text: "Bo joined your Meetup.", link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [[{ text: "Join Meetup", callback_data: "join:d9f1542a-5d3c-4bb2-83ec-a2c5ae0bc2a5" }]] },
      } },
      { path: "/bot123:test/answerCallbackQuery", body: { callback_query_id: "callback-1", text: "You joined the Meetup." } },
    ]);
    await telegram.sendMessage({ chatId: "102", text: "Ana invited you to a Meetup.", inviteId: "7fe9a1aa-2ef9-4d8d-9d8c-8c412c134975" });
    expect(requests.at(-1)).toEqual({ path: "/bot123:test/sendMessage", body: {
      chat_id: "102", text: "Ana invited you to a Meetup.", link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[
        { text: "Accept", callback_data: "accept:7fe9a1aa-2ef9-4d8d-9d8c-8c412c134975" },
        { text: "Decline", callback_data: "decline:7fe9a1aa-2ef9-4d8d-9d8c-8c412c134975" },
      ]] },
    } });
    await telegram.sendMessage({ chatId: "101", text: "Choose an Activity.", buttons: [[{ text: "coffee", data: "av-activity:opaque-id" }], [{ text: "lunch", data: "av-activity:another-id" }]] });
    expect(requests.at(-1)).toEqual({ path: "/bot123:test/sendMessage", body: {
      chat_id: "101", text: "Choose an Activity.", link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: "coffee", callback_data: "av-activity:opaque-id" }], [{ text: "lunch", callback_data: "av-activity:another-id" }]] },
    } });
    reject = true;
    await expect(telegram.sendMessage({ chatId: "101", text: "Retry later" })).rejects.toThrow("Too many requests");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
