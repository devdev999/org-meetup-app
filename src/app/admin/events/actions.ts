"use server";

import { revalidatePath } from "next/cache";
import { isAccessDeniedError, isInvalidInputError } from "../../../application";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";
import type { MeetupActionState } from "../../meetups/actions";

export async function manageEvent(id: string, form: FormData): Promise<MeetupActionState> {
  const admin = await requireOrganisationAdmin();
  const operation = form.get("operation");
  try {
    if (operation === "approve") await admin.approveEvent(id, formText(form.get("note")) ?? "");
    else if (operation === "reject") await admin.rejectEvent(id, formText(form.get("note")) ?? "");
    else if (operation === "reassign") await admin.reassignEventHost(id, formText(form.get("memberId")) ?? "");
    else return { error: "Choose an Event action." };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    if (isAccessDeniedError(error)) return { error: "This Event is unavailable, or you cannot make this change." };
    throw error;
  }
  revalidatePath("/admin/events");
  revalidatePath("/events", "layout");
  revalidatePath("/inbox");
  revalidatePath("/");
  return { message: operation === "approve" ? "Event approved." : operation === "reject" ? "Event rejected. The proposer can read your note." : "Event Host reassigned." };
}
