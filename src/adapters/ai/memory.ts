import type { AiClusteringRequest, AiExtractionRequest, AiExtractedInterest, AiInterestRequest, AiInterestResolution, AiRequestSettings, AiPort } from "../../application/ports";
import type { AiCompletion, AiCompletionRequest, AiToolProtocol } from "../../application/ports";
import { completionRequest, completionResult } from "./completion-protocol";
import type { InterestMergeProposal, Report } from "../../application";

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
    if (latest.call.name === "duplicate_interests") {
      const result: { items: InterestMergeProposal[]; total: number } = JSON.parse(latest.content);
      const lines = result.items.slice(0, 3).map(({ interests }) => `${interests.slice(0, 3).map(({ name }) => name).join(", ")}${interests.length > 3 ? ` and ${interests.length - 3} more` : ""}.`);
      const count = lines.length < result.total ? `Showing ${lines.length} of ${result.total} proposals` : `${result.total} ${result.total === 1 ? "proposal" : "proposals"}`;
      return { kind: "answer", text: lines.length ? `${count} in the Interest merge queue:\n${lines.join("\n")}` : "There are no duplicate Interest proposals in the queue." };
    }
    if (latest.call.name === "unshared_seeks") {
      const report: { tables: Array<Report["tables"][number] & { totalRows: number }> } = JSON.parse(latest.content);
      const table = report.tables[0]!;
      const lines = table.rows.map(([name, , seeks]) => `${name}: ${seeks} Seeks and no Shares.`);
      const limit = lines.length < table.totalRows ? `Showing ${lines.length} of ${table.totalRows} Interests.\n` : "";
      return { kind: "answer", text: lines.length ? limit + lines.join("\n") : "There are no Seeks with no Shares among current Active Members." };
    }
    if (latest.call.name === "report_headlines") {
      const report: Report = JSON.parse(latest.content);
      const tables = report.tables.filter(({ id }) => ["waitlists", "rsvp-attendance", "availability", "telegram", "activation"].includes(id));
      const lines = tables.map((table) => `${table.title}\n${table.basis}\n${table.rows.map((row) => row.map((value, index) => `${table.columns[index]}: ${value ?? "Not available"}`).join("; ")).join("\n")}`);
      return { kind: "answer", text: `Reports from ${report.period.from} through ${report.period.to}, ${report.timeZone}.\n${lines.join("\n")}` };
    }
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
  const intentText = question.replace(/\bmerge\s+(queue|proposals?)\b/gi, "duplicates");
  if (/\b(create|join|invite|merge|change|cancel|delete|approve|remove)\b/i.test(intentText)) {
    return { kind: "answer", text: "Open the relevant screen to take that action yourself." };
  }
  const unshared = /\b(nobody|no one)\s+shares\b|\bseeks\s+(with\s+)?no\s+shares\b/i.test(question);
  const interest = unshared ? null : question.match(/\b(shares?|seeks?)\s+(.+?)[?.!]*$/i);
  const dates = question.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  const call = interest ? { name: "members_by_interest", arguments: { interest: interest[2]!.trim(), stance: interest[1]!.toLowerCase().startsWith("share") ? "shares" : "seeks" } }
    : /\bduplicates?\b/i.test(intentText) ? { name: "duplicate_interests", arguments: {} }
    : unshared || /\b(unshared|unmet)\b/i.test(question) ? { name: "unshared_seeks", arguments: {} }
    : /\b(reports?|headlines?|figures|dashboard)\b/i.test(question) ? { name: "report_headlines", arguments: { from: dates?.[0] ?? null, to: dates?.[1] ?? null } }
    : /\b(connections|met)\b/i.test(question) ? { name: "my_connections", arguments: {} }
    : /\b(upcoming|meetups|events|week)\b/i.test(question) ? { name: "upcoming_meetups_and_events", arguments: { from: null, until: null } }
    : /\b(available|availability|free)\b/i.test(question) ? { name: "available_now", arguments: { activity: question.match(/\b(coffee|lunch|walk|game|sport)\b/i)?.[1]?.toLowerCase() ?? null } }
    : undefined;
  return call && input.tools.some(({ name }) => name === call.name)
    ? { kind: "tool", call: { id: "memory-read", ...call } }
    : { kind: "answer", text: "Ask about current Availability, Members who Share or Seek an Interest, upcoming Meetups and Events, or your Connections." };
}
