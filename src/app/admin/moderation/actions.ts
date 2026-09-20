"use server";

import { revalidatePath } from "next/cache";
import { isAccessDeniedError, isInvalidInputError } from "../../../application";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";
import type { MeetupActionState } from "../../meetups/actions";

export type ModerationOperation = "resolve" | "suspend" | "reinstate" | "cancel-meetup" | "cancel-event";

export async function moderate(id: string, operation: ModerationOperation, form: FormData): Promise<MeetupActionState> {
  const admin = await requireOrganisationAdmin();
  try {
    if (operation === "resolve") await admin.resolveFlag(id, formText(form.get("note")) ?? "");
    else if (operation === "suspend") await admin.suspendMember(id);
    else if (operation === "reinstate") await admin.reinstateMember(id);
    else if (operation === "cancel-meetup") await admin.cancelMeetup(id);
    else if (operation === "cancel-event") await admin.cancelEvent(id);
    else return { error: "Choose a moderation action." };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    if (isAccessDeniedError(error)) return { error: "This action is unavailable, or you cannot make this change." };
    throw error;
  }
  revalidatePath("/", "layout");
  return { message: operation === "resolve" ? "Flag resolved." : operation === "suspend" ? "Member suspended."
    : operation === "reinstate" ? "Member reinstated." : "Occurrence cancelled. Participants have been notified." };
}
