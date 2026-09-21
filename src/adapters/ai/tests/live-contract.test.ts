import { expect, test } from "vitest";
import { aiConfig } from "../../../config/env";
import { ChatCompletionAi } from "../chat-completion";
import type { AiCompletionRequest, AiMessage } from "../../../application/ports";

const configured = process.env.AI_CONTRACT_TEST === "yes"
  && Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);

test.skipIf(!configured).each(["native", "structured"] as const)("configured Scout completes a tool conversation and reuses its answer in %s mode", async (toolProtocol) => {
  const config = aiConfig({ ...process.env, AI_PROVIDER: "chat-completion", AI_TOOL_PROTOCOL: toolProtocol });
  if (config.provider !== "chat-completion") throw new Error("Expected chat-completion configuration");
  const ai = new ChatCompletionAi(config);
  const settings = { baseUrl: process.env.AI_BASE_URL!, model: process.env.AI_MODEL! };
  const messages: AiMessage[] = [{ role: "user", content: "I am Ana Silva in Finance. Who Shares SQL?" }];
  const request: AiCompletionRequest = { instructions: "You are Scout. Use the supplied read tool to find current Members. After a tool result, give a concise answer using its data. When asked to recall an earlier answer, use that answer without calling a tool.",
    messages, tools: [{ name: "members_by_interest", description: "Find Members by Interest and Stance.", parameters: {
      type: "object", properties: { interest: { type: "string" }, stance: { type: "string", enum: ["shares", "seeks"] } },
      required: ["interest", "stance"], additionalProperties: false,
    } }] };
  const first = await ai.complete(request, settings);
  expect(first.kind).toBe("tool");
  if (first.kind !== "tool") throw new Error("Expected the Member read tool");
  expect(first.call).toMatchObject({ name: "members_by_interest", arguments: { interest: "SQL", stance: "shares" } });
  messages.push({ role: "tool", call: first.call, content: JSON.stringify({ items: [{ name: "Maya Chen", department: "Finance", interests: [{ name: "SQL", stance: "shares" }] }], total: 1 }) });
  const answer = await ai.complete(request, settings);
  expect(answer.kind).toBe("answer");
  if (answer.kind !== "answer") throw new Error("Expected an answer after the tool result");
  expect(answer.text).toContain("Maya Chen");
  expect(answer.text).toContain("SQL");
  const followup = await ai.complete({ ...request, messages: [messages[0]!, { role: "assistant", content: answer.text },
    { role: "user", content: "Recall your previous answer. What Interest does Maya Chen Share? Do not look it up again." }] }, settings);
  expect(followup).toMatchObject({ kind: "answer", text: expect.stringContaining("SQL") });
}, 100_000);

test.skipIf(!configured)("configured AI endpoint clusters duplicate Interests without including an unrelated Interest", async () => {
  const config = aiConfig({ ...process.env, AI_PROVIDER: "chat-completion" });
  if (config.provider !== "chat-completion") throw new Error("Expected chat-completion configuration");
  const result = await new ChatCompletionAi(config).clusterInterests({ interests: [
    { name: "SQL", count: 5 }, { name: "Structured query language", count: 2 }, { name: "Rock climbing", count: 3 },
  ] }, { baseUrl: process.env.AI_BASE_URL!, model: process.env.AI_EXTRACTION_MODEL ?? process.env.AI_MODEL! });
  expect(result).toHaveLength(1);
  expect(result[0]?.toSorted()).toEqual(["SQL", "Structured query language"]);
}, 10_000);

test.skipIf(!configured).each([
  ["rustlang", "Rust"],
  ["sql", "SQL"],
  ["boardgames", "Board games"],
])("configured AI endpoint resolves %s to %s", async (phrase, expectedName) => {
  const config = aiConfig({ ...process.env, AI_PROVIDER: "chat-completion" });
  if (config.provider !== "chat-completion") throw new Error("Expected chat-completion configuration");
  const result = await new ChatCompletionAi(config).resolveInterest({
    phrase,
    shortlist: [
      { name: "Rust", kind: "skill", count: 3 },
      { name: "SQL", kind: "skill", count: 2 },
      { name: "Board games", kind: "hobby", count: 1 },
    ],
  }, { baseUrl: process.env.AI_BASE_URL!, model: process.env.AI_MODEL! });
  expect(result).toEqual({ existingName: expectedName });
}, 10_000);
