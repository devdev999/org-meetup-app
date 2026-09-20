import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { AiInterestRequest } from "../../../application/ports";
import { ChatCompletionAi } from "../chat-completion";

const requests: Array<{ url: string | undefined; authorization: string | undefined; body: unknown }> = [];
let reply: { status: number; body: unknown } | null;
let baseUrl: string;

const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
  if (!reply) return;
  response.writeHead(reply.status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(reply.body));
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

beforeEach(() => {
  requests.length = 0;
  reply = {
    status: 200,
    body: { choices: [{ finish_reason: "stop", message: { content: '{"existingName":"Rust"}' } }] },
  };
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const adapter = () => new ChatCompletionAi({ baseUrl, apiKey: "provider-key", model: "interest-model" });
const input: AiInterestRequest = { phrase: "rustlang", shortlist: [{ name: "Rust", kind: "skill", count: 3 }] };

test("resolves Interest text through the configured chat-completion endpoint", async () => {
  expect(await adapter().resolveInterest(input)).toEqual({ existingName: "Rust" });
  expect(requests).toEqual([{
    url: "/v1/chat/completions",
    authorization: "Bearer provider-key",
    body: {
      model: "interest-model",
      messages: [
        { role: "system", content: expect.stringContaining("JSON") },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: { type: "json_object" },
      stream: false,
    },
  }]);
});

test("rejects an unsuccessful provider response even when it contains a result", async () => {
  reply!.status = 503;
  await expect(adapter().resolveInterest(input)).rejects.toThrow("503");
});

test.each([
  { choices: [] },
  { choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] },
  { choices: [{ finish_reason: "stop", message: { content: '{"name":"Rust","kind":"other"}' } }] },
  { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ name: "x".repeat(121), kind: "skill" }) } }] },
  { choices: [{ finish_reason: "length", message: { content: '{"existingName":"Rust"}' } }] },
  { choices: [{ finish_reason: "stop", message: { content: '{"existingName":"Rust"}', refusal: "Refused" } }] },
])("rejects malformed, incomplete or refused provider output: %j", async (body) => {
  reply = { status: 200, body };
  await expect(adapter().resolveInterest(input)).rejects.toThrow();
});

test("sends only Interest text, kinds and counts even when input includes extra fields", async () => {
  const request = { ...input, memberId: "member-123", shortlist: [{ ...input.shortlist[0]!, organisationId: "secret" }] };
  await adapter().resolveInterest(request);
  expect(JSON.stringify(requests)).not.toContain("member-123");
  expect(JSON.stringify(requests)).not.toContain("secret");
});

test("times out an unresponsive provider so Interest resolution can fall back", async () => {
  reply = null;
  const ai = new ChatCompletionAi({ baseUrl, apiKey: "provider-key", model: "interest-model", timeoutMs: 50 });
  await expect(ai.resolveInterest(input)).rejects.toMatchObject({ name: "TimeoutError" });
}, 1_000);

test("extracts Interests from Activity and description through the configured extraction model", async () => {
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: {
    content: JSON.stringify({ interests: [{ phrase: "Chess", kind: "hobby" }] }),
  } }] } };
  const ai = new ChatCompletionAi({ baseUrl, apiKey: "provider-key", model: "canonical-model", extractionModel: "small-model" });
  const input = { activity: "coffee", description: "Chess with Ana in Finance." };
  expect(await ai.extractInterests(input)).toEqual([{ phrase: "Chess", kind: "hobby" }]);
  expect(requests[0]?.body).toMatchObject({ model: "small-model", messages: [
    { role: "system", content: expect.stringContaining("Interests") },
    { role: "user", content: JSON.stringify(input) },
  ] });
});

test.each([
  { interests: [{ phrase: "Chess", kind: "other" }] },
  { interests: [{ phrase: "", kind: "hobby" }] },
  { interests: "Chess" },
])("rejects unusable extraction output: %j", async (output) => {
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] } };
  await expect(adapter().extractInterests({ activity: "coffee", description: "Chess" })).rejects.toThrow();
});

test("extraction times out an unresponsive provider", async () => {
  reply = null;
  const ai = new ChatCompletionAi({ baseUrl, apiKey: "provider-key", model: "interest-model", timeoutMs: 50 });
  await expect(ai.extractInterests({ activity: "coffee", description: "SQL" })).rejects.toMatchObject({ name: "TimeoutError" });
}, 1_000);

test.each(["canonicalisation", "extraction"])("cancelling %s aborts the provider request", async (operation) => {
  reply = null;
  const ai = new ChatCompletionAi({ baseUrl, apiKey: "provider-key", model: "interest-model", timeoutMs: 500 });
  const controller = new AbortController();
  const pending = operation === "canonicalisation" ? ai.resolveInterest(input, controller.signal)
    : ai.extractInterests({ activity: "coffee", description: "Python" }, controller.signal);
  const result = pending.catch((error: unknown) => error);
  await expect.poll(() => requests.length).toBe(1);
  controller.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
});
