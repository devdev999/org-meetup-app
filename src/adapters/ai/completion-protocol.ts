import { z } from "zod";
import type { AiCompletion, AiCompletionRequest, AiRequestSettings, AiToolProtocol } from "../../application/ports";

const answerSchema = z.string().trim().min(1).max(6000);
const callSchema = z.strictObject({ id: z.string().min(1).max(200), name: z.string().min(1).max(80), arguments: z.record(z.string(), z.unknown()) });
const structuredSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("answer"), text: answerSchema }),
  z.strictObject({ kind: z.literal("tool"), call: callSchema }),
]);
const completionSchema = z.object({ choices: z.array(z.object({
  finish_reason: z.enum(["stop", "tool_calls"]),
  message: z.object({ content: z.string().max(20_000).nullish(), refusal: z.literal("").nullish(), tool_calls: z.array(z.object({
    id: z.string().min(1).max(200), type: z.literal("function"),
    function: z.object({ name: z.string().min(1).max(80), arguments: z.string().max(8000) }),
  })).max(1).optional() }),
})).length(1) });

export function completionRequest(input: AiCompletionRequest, settings: AiRequestSettings, protocol: AiToolProtocol) {
  const instructions = protocol === "native" || !input.tools.length ? input.instructions : [input.instructions,
    "You return the next step for a separate application. The listed tools are NOT tools you can execute yourself. The application reads your final JSON response, executes the requested read, and supplies its result in the next message.",
    'Return exactly one JSON object and stop: {"kind":"answer","text":"your answer"} or {"kind":"tool","call":{"id":"unique call ID","name":"tool name","arguments":{}}}.',
    "Put the JSON object in your final answer, including when requesting a tool. A tool request IS your entire final answer for this step. Never simulate a tool result or add a second answer. Do not add Markdown fences or prose outside the object.",
    "Request only one tool at a time. Use only these tools and their argument schemas:", JSON.stringify(input.tools),
  ].join("\n");
  const messages: Record<string, unknown>[] = [{ role: "system", content: instructions }];
  for (const message of input.messages) {
    if (message.role !== "tool") {
      messages.push({ role: message.role, content: protocol === "structured" && input.tools.length && message.role === "assistant"
        ? JSON.stringify({ kind: "answer", text: message.content }) : message.content });
      continue;
    }
    if (protocol === "native") {
      messages.push({ role: "assistant", content: null, tool_calls: [{ id: message.call.id, type: "function",
        function: { name: message.call.name, arguments: JSON.stringify(message.call.arguments) } }] },
      { role: "tool", tool_call_id: message.call.id, content: message.content });
    } else {
      messages.push({ role: "assistant", content: JSON.stringify({ kind: "tool", call: message.call }) },
        { role: "user", content: JSON.stringify({ toolResult: { id: message.call.id, name: message.call.name, content: message.content } }) });
    }
  }
  return { model: settings.model, messages, stream: false,
    ...(protocol === "native" && input.tools.length ? {
      tools: input.tools.map((definition) => ({ type: "function", function: { ...definition, strict: true } })), parallel_tool_calls: false,
    } : {}),
  };
}

export function completionResult(body: unknown, protocol: AiToolProtocol, hasTools: boolean): AiCompletion {
  const choice = completionSchema.parse(body).choices[0]!;
  const call = choice.message.tool_calls?.[0];
  if (call) {
    if (protocol !== "native" || !hasTools || choice.finish_reason !== "tool_calls") throw new Error("Unexpected tool call.");
    return { kind: "tool", call: callSchema.parse({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) }) };
  }
  if (choice.finish_reason !== "stop") throw new Error("The completion did not finish.");
  return protocol === "structured" && hasTools ? structuredSchema.parse(JSON.parse(choice.message.content ?? ""))
    : { kind: "answer", text: answerSchema.parse(choice.message.content) };
}
