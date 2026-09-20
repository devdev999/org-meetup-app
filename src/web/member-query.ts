import { isAccessDeniedError, isAdminVisibilityNoticeRequiredError, isInvalidInputError, type MemberActions } from "../application";
import { webConfig } from "../config/env";
import { currentMember } from "./session";

export async function memberQuery<Input, Output>(request: Request, query: (member: MemberActions, input: Input) => Promise<Output>): Promise<Response> {
  if (request.headers.get("origin") !== new URL(webConfig().APP_URL).origin) {
    return Response.json({ error: "Refresh this page and try again." }, { status: 403 });
  }
  const member = await currentMember();
  if (!member) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    return Response.json(await query(member, await request.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Submit valid JSON." }, { status: 400 });
    if (isInvalidInputError(error)) return Response.json({ error: error.message }, { status: 400 });
    if (isAccessDeniedError(error) || isAdminVisibilityNoticeRequiredError(error)) {
      return Response.json({ error: "Open the app to check your access." }, { status: 403 });
    }
    throw error;
  }
}
