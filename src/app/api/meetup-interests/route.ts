import type { ExtractMeetupInterestsInput } from "../../../application";
import { memberQuery } from "../../../web/member-query";

export async function POST(request: Request): Promise<Response> {
  return memberQuery(request, async (member, input: ExtractMeetupInterestsInput) => ({ proposals: await member.extractMeetupInterests(input) }));
}
