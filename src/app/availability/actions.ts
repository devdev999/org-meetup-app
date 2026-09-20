"use server";

import { revalidatePath } from "next/cache";
import { isInvalidInputError } from "../../application/index";
import { application } from "../../web/application";
import { formatTime, parseLocalDateTime } from "../../calendar";
import { formText } from "../../web/forms";
import { requireMemberPastWelcome } from "../../web/session";

export interface AvailabilityActionState { error?: string; message?: string }

export async function postAvailability(_previous: AvailabilityActionState, form: FormData): Promise<AvailabilityActionState> {
  const { member } = await requireMemberPastWelcome();
  const timeZone = await application().timeZone();
  if (form.get("timeZone") !== timeZone) return { error: "The deployment time zone changed. Reload and review the times before saving." };
  try {
    const posted = await member.postAvailability({
      activityId: formText(form.get("activityId")) ?? "",
      startsAt: parseLocalDateTime(formText(form.get("startsAt")) ?? "", timeZone),
      endsAt: parseLocalDateTime(formText(form.get("endsAt")) ?? "", timeZone),
      kind: form.get("kind") === "virtual" ? "virtual" : "physical",
    });
    revalidatePath("/availability");
    revalidatePath("/inbox");
    return { message: `Availability posted for ${posted.activity.name}, ${formatTime(posted.startsAt, timeZone)} to ${formatTime(posted.endsAt, timeZone)}.` };
  } catch (error) {
    if (error instanceof RangeError) return { error: "Choose valid local times. Daylight-saving transitions can skip or repeat a time." };
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}
