import type { AiExtractionRequest, AiExtractedInterest, AiInterestRequest, AiInterestResolution, AiRequestSettings, AiPort } from "../../application/ports";

export class MemoryAi implements AiPort {
  readonly requestSettings: AiRequestSettings[] = [];
  readonly extractionSettings: AiRequestSettings[] = [];
  readonly requests: AiInterestRequest[] = [];
  readonly responses: Array<AiInterestResolution | Error> = [];
  readonly extractionRequests: AiExtractionRequest[] = [];
  readonly extractionResponses: Array<AiExtractedInterest[] | Error> = [];

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
    this.requestSettings.length = 0;
    this.extractionSettings.length = 0;
    this.requests.length = 0;
    this.responses.length = 0;
    this.extractionRequests.length = 0;
    this.extractionResponses.length = 0;
  }
}
