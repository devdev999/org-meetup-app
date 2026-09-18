import type { AiInterestRequest, AiInterestResolution, AiPort } from "../../application/ports";

export class MemoryAi implements AiPort {
  readonly requests: AiInterestRequest[] = [];
  readonly responses: Array<AiInterestResolution | Error> = [];

  async resolveInterest(input: AiInterestRequest): Promise<AiInterestResolution> {
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
    this.requests.length = 0;
    this.responses.length = 0;
  }
}
