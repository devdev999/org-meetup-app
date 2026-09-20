import type { PreviewInviteSuggestionsInput } from "../../../application";
import { memberQuery } from "../../../web/member-query";

export async function POST(request: Request): Promise<Response> {
  return memberQuery(request, async (member, input: PreviewInviteSuggestionsInput) => ({ suggestions: await member.previewInviteSuggestions(input) }));
}
