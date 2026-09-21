import type { AiClusteringRequest, AiExtractionRequest, AiExtractedInterest, AiInterestRequest, AiInterestResolution, AiRequestSettings, AiPort } from "../../application/ports";
import type { AiCompletion, AiCompletionRequest, AiToolProtocol } from "../../application/ports";
import { completionRequest, completionResult } from "./completion-protocol";

export class MemoryAi implements AiPort {
  constructor(private readonly toolProtocol: AiToolProtocol = "native") {}

  readonly completionRequests: ReturnType<typeof completionRequest>[] = [];
  readonly completionResponses: Array<AiCompletion | Error | ((input: AiCompletionRequest) => Promise<AiCompletion>)> = [];

  async complete(input: AiCompletionRequest, settings: AiRequestSettings): Promise<AiCompletion> {
    this.completionRequests.push(structuredClone(completionRequest(input, settings, this.toolProtocol)));
    const response = this.completionResponses.shift();
    const scripted = typeof response === "function" ? await response(structuredClone(input)) : response;
    if (scripted instanceof Error) throw scripted;
    const result = scripted ?? defaultCompletion(input);
    const body = this.toolProtocol === "native" && result.kind === "tool"
      ? { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: result.call.id, type: "function",
        function: { name: result.call.name, arguments: JSON.stringify(result.call.arguments) } }] } }] }
      : { choices: [{ finish_reason: "stop", message: { content: this.toolProtocol === "structured" && input.tools.length
        ? JSON.stringify(result) : result.kind === "answer" ? result.text : "" } }] };
    return completionResult(body, this.toolProtocol, input.tools.length > 0);
  }

  readonly clusteringSettings: AiRequestSettings[] = [];
  readonly clusteringRequests: AiClusteringRequest[] = [];
  readonly clusteringResponses: Array<string[][] | Error> = [];
  readonly requestSettings: AiRequestSettings[] = [];
  readonly extractionSettings: AiRequestSettings[] = [];
  readonly requests: AiInterestRequest[] = [];
  readonly responses: Array<AiInterestResolution | Error> = [];
  readonly extractionRequests: AiExtractionRequest[] = [];
  readonly extractionResponses: Array<AiExtractedInterest[] | Error> = [];

  async clusterInterests(input: AiClusteringRequest, settings: AiRequestSettings): Promise<string[][]> {
    this.clusteringSettings.push(structuredClone(settings));
    this.clusteringRequests.push(structuredClone(input));
    const response = this.clusteringResponses.shift();
    if (response instanceof Error) throw response;
    if (response) return structuredClone(response);
    const canonicalNames: Record<string, string> = { structuredquerylanguage: "sql", rustlang: "rust", boardgames: "boardgames" };
    const grouped = Map.groupBy(input.interests, ({ name }) => {
      const normalized = name.toLowerCase().replace(/\s+/g, "");
      return Object.hasOwn(canonicalNames, normalized) ? canonicalNames[normalized]! : normalized;
    });
    return [...grouped.values()].filter((entries) => entries.length > 1).map((entries) => entries.map(({ name }) => name));
  }

  async extractInterests(input: AiExtractionRequest, settings: AiRequestSettings): Promise<AiExtractedInterest[]> {
    this.extractionSettings.push(structuredClone(settings));
    this.extractionRequests.push(structuredClone(input));
    const response = this.extractionResponses.shift();
    if (response instanceof Error) throw response;
    if (response) return structuredClone(response);
    const content = `${input.activity} ${input.description}`.toLowerCase();
    return [
      { phrase: "SQL", kind: "skill" as const }, { phrase: "Rust", kind: "skill" as const },
      { phrase: "Python", kind: "skill" as const },
      { phrase: "Board games", kind: "hobby" as const }, { phrase: "Running", kind: "hobby" as const },
    ].filter((interest) => content.includes(interest.phrase.toLowerCase()));
  }

  async resolveInterest(input: AiInterestRequest, settings: AiRequestSettings): Promise<AiInterestResolution> {
    this.requestSettings.push(structuredClone(settings));
    this.requests.push(structuredClone(input));
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    if (response) return structuredClone(response);

    const phrase = input.phrase.trim().replace(/\s+/g, " ");
    const normalized = phrase.toLowerCase();
    const existing = input.shortlist.find(({ name }) => name.toLowerCase() === normalized
      || (normalized === "rustlang" && name.toLowerCase() === "rust"));
    return existing ? { existingName: existing.name } : { name: phrase, kind: "skill" };
  }

  reset(): void {
    this.completionRequests.length = 0;
    this.completionResponses.length = 0;
    this.clusteringSettings.length = 0;
    this.clusteringRequests.length = 0;
    this.clusteringResponses.length = 0;
    this.requestSettings.length = 0;
    this.extractionSettings.length = 0;
    this.requests.length = 0;
    this.responses.length = 0;
    this.extractionRequests.length = 0;
    this.extractionResponses.length = 0;
  }
}

function defaultCompletion(input: AiCompletionRequest): AiCompletion {
  const latest = input.messages.at(-1);
  if (latest?.role === "tool") {
    const result: { items: Array<{ name?: string; member?: { name: string }; activity?: { name: string }; startsAt?: string; kind?: string }>; total: number } = JSON.parse(latest.content);
    const lines = result.items.map((item) => {
      if (latest.call.name === "available_now") return `${item.member!.name} is available for ${item.activity!.name}.`;
      if (latest.call.name === "members_by_interest") return `${item.name} matches your Interest search.`;
      if (latest.call.name === "my_connections") return `You met ${item.member!.name}.`;
      return `${item.kind === "event" ? "Event" : "Meetup"}: ${item.activity!.name}, ${item.startsAt}.`;
    });
    return { kind: "answer", text: lines.length ? lines.join("\n") : "No results are available for this question." };
  }
  const question = latest?.content ?? "";
  if (/\b(create|join|invite|merge|change|cancel|delete|approve|remove)\b/i.test(question)) {
    return { kind: "answer", text: "Open the relevant screen to take that action yourself." };
  }
  const interest = question.match(/\b(shares?|seeks?)\s+(.+?)[?.!]*$/i);
  const call = /\b(connections|met)\b/i.test(question) ? { name: "my_connections", arguments: {} }
    : interest ? { name: "members_by_interest", arguments: { interest: interest[2]!.trim(), stance: interest[1]!.toLowerCase().startsWith("share") ? "shares" : "seeks" } }
      : /\b(upcoming|meetups|events|week)\b/i.test(question) ? { name: "upcoming_meetups_and_events", arguments: { from: null, until: null } }
        : /\b(available|availability|free)\b/i.test(question) ? { name: "available_now", arguments: { activity: question.match(/\b(coffee|lunch|walk|game|sport)\b/i)?.[1]?.toLowerCase() ?? null } }
          : undefined;
  return call && input.tools.some(({ name }) => name === call.name)
    ? { kind: "tool", call: { id: "memory-read", ...call } }
    : { kind: "answer", text: "Ask about current Availability, Members who Share or Seek an Interest, upcoming Meetups and Events, or your Connections." };
}
