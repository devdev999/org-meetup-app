"use server";

import { revalidatePath } from "next/cache";
import { isInvalidInputError } from "../../application/index";
import { formText } from "../../web/forms";
import { requireMemberPastWelcome } from "../../web/session";

export interface AvailabilityActionState { error?: string; message?: string }

export async function postAvailability(_previous: AvailabilityActionState, form: FormData): Promise<AvailabilityActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    const posted = await member.postAvailability({
      activityId: formText(form.get("activityId")) ?? "",
      startsAt: new Date(`${formText(form.get("startsAt")) ?? ""}Z`),
      endsAt: new Date(`${formText(form.get("endsAt")) ?? ""}Z`),
      kind: form.get("kind") === "virtual" ? "virtual" : "physical",
    });
    revalidatePath("/availability");
    revalidatePath("/inbox");
    return { message: `Availability posted for ${posted.activity.name}, ${posted.startsAt.toISOString().slice(11, 16)} to ${posted.endsAt.toISOString().slice(11, 16)} UTC.` };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}
