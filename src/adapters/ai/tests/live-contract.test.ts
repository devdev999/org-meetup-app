import { expect, test } from "vitest";
import { aiConfig } from "../../../config/env";
import { ChatCompletionAi } from "../chat-completion";

const configured = process.env.AI_CONTRACT_TEST === "yes"
  && Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);

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
