import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { AiInterestRequest, AiCompletionRequest } from "../../../application/ports";
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

const adapter = () => new ChatCompletionAi({ apiKey: "provider-key" });
const settings = () => ({ baseUrl, model: "interest-model" });
const input: AiInterestRequest = { phrase: "rustlang", shortlist: [{ name: "Rust", kind: "skill", count: 3 }] };

const scoutInput: AiCompletionRequest = { instructions: "Read only.", messages: [{ role: "user", content: "Who is available?" }],
  tools: [{ name: "available_now", description: "Current Availability", parameters: { type: "object", properties: {}, additionalProperties: false } }] };

test.each(["native", "structured"] as const)("Scout supports plain completion without tools in %s mode", async (toolProtocol) => {
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content: "Open Meetups to join one." } }] } };
  expect(await new ChatCompletionAi({ apiKey: "provider-key", toolProtocol }).complete({ ...scoutInput, tools: [] }, settings()))
    .toEqual({ kind: "answer", text: "Open Meetups to join one." });
  expect(requests[0]!.body).toEqual({ model: "interest-model", stream: false,
    messages: [{ role: "system", content: "Read only." }, ...scoutInput.messages] });
});

test.each([
  { choices: [] },
  { choices: [{ finish_reason: "length", message: { content: "Incomplete" } }] },
  { choices: [{ finish_reason: "stop", message: { content: "Refused", refusal: "No" } }] },
  { choices: [{ finish_reason: "stop", message: { content: " " } }] },
  { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [] } }] },
  { choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "call-1", type: "function", function: { name: "available_now", arguments: "[]" } }] } }] },
])("Scout rejects unusable native provider output: %j", async (body) => {
  reply = { status: 200, body };
  await expect(adapter().complete(scoutInput, settings())).rejects.toThrow();
});

test.each(["not JSON", '{"kind":"answer","text":""}', '{"kind":"tool","call":{"id":"one","name":"available_now","arguments":[]}}'])
  ("Scout rejects unusable structured output: %s", async (content) => {
    reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content } }] } };
    await expect(new ChatCompletionAi({ apiKey: "provider-key", toolProtocol: "structured" }).complete(scoutInput, settings())).rejects.toThrow();
  });

test("Scout rejects missing endpoints and provider errors", async () => {
  await expect(adapter().complete(scoutInput, { baseUrl: null, model: "scout" })).rejects.toThrow("not been configured");
  expect(requests).toHaveLength(0);
  reply!.status = 503;
  await expect(adapter().complete(scoutInput, settings())).rejects.toThrow("503");
});

test("Scout times out an unresponsive endpoint and supports cancellation", async () => {
  reply = null;
  await expect(new ChatCompletionAi({ apiKey: "provider-key", timeoutMs: 50 }).complete(scoutInput, settings()))
    .rejects.toMatchObject({ name: "TimeoutError" });
  const controller = new AbortController();
  const pending = adapter().complete(scoutInput, settings(), controller.signal).catch((error: unknown) => error);
  await expect.poll(() => requests.length).toBe(2);
  controller.abort();
  expect(await pending).toMatchObject({ name: "AbortError" });
}, 1_000);

test.each(["native", "structured"] as const)("Scout sends the complete conversation and tool result in %s mode", async (toolProtocol) => {
  const tool = { name: "members_by_interest", description: "Find Members by Interest and Stance.", parameters: {
    type: "object", properties: { interest: { type: "string" } }, required: ["interest"], additionalProperties: false,
  } };
  const call = { id: "call-ana", name: "members_by_interest", arguments: { interest: "Ana Silva's SQL" } };
  const result = '{"members":[{"name":"Maya Chen","department":"Finance","site":"Harbour House"}]}';
  const request: AiCompletionRequest = { instructions: "Read only.", tools: [tool], messages: [
    { role: "user", content: "I am Ana Silva." }, { role: "assistant", content: "You asked about Maya Chen." },
    { role: "user", content: "Who Shares Ana Silva's SQL?" }, { role: "tool", call, content: result },
  ] };
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content: toolProtocol === "native"
    ? "Maya Chen Shares it." : '{"kind":"answer","text":"Maya Chen Shares it."}' } }] } };

  expect(await new ChatCompletionAi({ apiKey: "provider-key", toolProtocol }).complete(request, { baseUrl, model: "scout-model" }))
    .toEqual({ kind: "answer", text: "Maya Chen Shares it." });

  expect(requests).toEqual([{ url: "/v1/chat/completions", authorization: "Bearer provider-key", body: {
    model: "scout-model", stream: false,
    messages: [
      { role: "system", content: toolProtocol === "native" ? "Read only." : expect.stringContaining(JSON.stringify([tool])) },
      { role: "user", content: "I am Ana Silva." }, { role: "assistant", content: toolProtocol === "native"
        ? "You asked about Maya Chen." : '{"kind":"answer","text":"You asked about Maya Chen."}' },
      { role: "user", content: "Who Shares Ana Silva's SQL?" },
      ...(toolProtocol === "native" ? [
        { role: "assistant", content: null, tool_calls: [{ id: "call-ana", type: "function", function: { name: "members_by_interest", arguments: '{"interest":"Ana Silva\'s SQL"}' } }] },
        { role: "tool", tool_call_id: "call-ana", content: result },
      ] : [
        { role: "assistant", content: JSON.stringify({ kind: "tool", call }) },
        { role: "user", content: JSON.stringify({ toolResult: { id: "call-ana", name: "members_by_interest", content: result } }) },
      ]),
    ],
    ...(toolProtocol === "native" ? { tools: [{ type: "function", function: { ...tool, strict: true } }], parallel_tool_calls: false } : {}),
  } }]);
});

test.each(["native", "structured"] as const)("Scout reads a provider tool request in %s mode", async (toolProtocol) => {
  reply = { status: 200, body: { choices: [toolProtocol === "native"
    ? { finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "available_now", arguments: '{"activity":"lunch"}' } }] } }
    : { finish_reason: "stop", message: { content: '{"kind":"tool","call":{"id":"call-1","name":"available_now","arguments":{"activity":"lunch"}}}' } }] } };
  const result = await new ChatCompletionAi({ apiKey: "provider-key", toolProtocol }).complete({ instructions: "Read only.",
    messages: [{ role: "user", content: "Who is free?" }], tools: [{ name: "available_now", description: "Availability", parameters: {} }],
  }, settings());
  expect(result).toEqual({ kind: "tool", call: { id: "call-1", name: "available_now", arguments: { activity: "lunch" } } });
});

test("clustering sends complete Interest names and counts without forwarding unrelated data", async () => {
  const cluster = ["Ana Silva's SQL", "SQL"];
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ clusters: [cluster] }) } }] } };
  const input = { organisationId: "not-for-ai", interests: [
    { name: cluster[0]!, count: 2, memberIds: ["not-for-ai"] }, { name: "SQL", count: 5, memberIds: [] },
  ] };
  expect(await adapter().clusterInterests(input, settings())).toEqual([cluster]);
  expect(requests).toEqual([{
    url: "/v1/chat/completions", authorization: "Bearer provider-key",
    body: { model: "interest-model", messages: [
      { role: "system", content: expect.stringContaining("clusters") },
      { role: "user", content: JSON.stringify({ interests: [{ name: "Ana Silva's SQL", count: 2 }, { name: "SQL", count: 5 }] }) },
    ], response_format: { type: "json_object" }, stream: false },
  }]);
});

test.each([{ clusters: [["SQL"]] }, { clusters: [["SQL", ""]] }, { clusters: "SQL" }, { clusters: [], extra: true }])("clustering rejects malformed output: %j", async (output) => {
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] } };
  await expect(adapter().clusterInterests({ interests: [{ name: "SQL", count: 2 }, { name: "Structured query language", count: 1 }] }, settings())).rejects.toThrow();
});

test("resolves Interest text through the configured chat-completion endpoint", async () => {
  expect(await adapter().resolveInterest(input, settings())).toEqual({ existingName: "Rust" });
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

test("the same adapter uses each request's current endpoint and model", async () => {
  const ai = adapter();
  await ai.resolveInterest(input, settings());
  await ai.resolveInterest(input, { baseUrl: baseUrl.replace("/v1", "/v2"), model: "replacement-model" });
  expect(requests.map((request) => request.url)).toEqual(["/v1/chat/completions", "/v2/chat/completions"]);
  expect(requests[1]).toMatchObject({ authorization: "Bearer provider-key", body: { model: "replacement-model" } });
  await expect(ai.resolveInterest(input, { baseUrl: null, model: "replacement-model" })).rejects.toThrow("not been configured");
  expect(requests).toHaveLength(2);
});

test("rejects an unsuccessful provider response even when it contains a result", async () => {
  reply!.status = 503;
  await expect(adapter().resolveInterest(input, settings())).rejects.toThrow("503");
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
  await expect(adapter().resolveInterest(input, settings())).rejects.toThrow();
});

test("sends only Interest text, kinds and counts even when input includes extra fields", async () => {
  const request = { ...input, memberId: "member-123", shortlist: [{ ...input.shortlist[0]!, organisationId: "secret" }] };
  await adapter().resolveInterest(request, settings());
  expect(JSON.stringify(requests)).not.toContain("member-123");
  expect(JSON.stringify(requests)).not.toContain("secret");
});

test("times out an unresponsive provider so Interest resolution can fall back", async () => {
  reply = null;
  const ai = new ChatCompletionAi({ apiKey: "provider-key", timeoutMs: 50 });
  await expect(ai.resolveInterest(input, settings())).rejects.toMatchObject({ name: "TimeoutError" });
}, 1_000);

test("extracts Interests from Activity and description through the configured extraction model", async () => {
  reply = { status: 200, body: { choices: [{ finish_reason: "stop", message: {
    content: JSON.stringify({ interests: [{ phrase: "Chess", kind: "hobby" }] }),
  } }] } };
  const ai = new ChatCompletionAi({ apiKey: "provider-key" });
  const input = { activity: "coffee", description: "Chess with Ana in Finance." };
  expect(await ai.extractInterests(input, { baseUrl, model: "small-model" })).toEqual([{ phrase: "Chess", kind: "hobby" }]);
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
  await expect(adapter().extractInterests({ activity: "coffee", description: "Chess" }, settings())).rejects.toThrow();
});

test("extraction times out an unresponsive provider", async () => {
  reply = null;
  const ai = new ChatCompletionAi({ apiKey: "provider-key", timeoutMs: 50 });
  await expect(ai.extractInterests({ activity: "coffee", description: "SQL" }, settings())).rejects.toMatchObject({ name: "TimeoutError" });
}, 1_000);

test.each(["canonicalisation", "extraction"])("cancelling %s aborts the provider request", async (operation) => {
  reply = null;
  const ai = new ChatCompletionAi({ apiKey: "provider-key", timeoutMs: 500 });
  const controller = new AbortController();
  const pending = operation === "canonicalisation" ? ai.resolveInterest(input, settings(), controller.signal)
    : ai.extractInterests({ activity: "coffee", description: "Python" }, settings(), controller.signal);
  const result = pending.catch((error: unknown) => error);
  await expect.poll(() => requests.length).toBe(1);
  controller.abort();
  expect(await result).toMatchObject({ name: "AbortError" });
});
