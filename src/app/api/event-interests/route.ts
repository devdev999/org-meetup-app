import type { ExtractEventInterestsInput } from "../../../application";
import { memberQuery } from "../../../web/member-query";

export async function POST(request: Request): Promise<Response> {
  return memberQuery(request, async (member, input: ExtractEventInterestsInput) => ({ proposals: await member.extractEventInterests(input, request.signal) }));
}
