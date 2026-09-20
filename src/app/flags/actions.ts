"use server";

import { revalidatePath } from "next/cache";
import { isAccessDeniedError, isInvalidInputError, type FlagInput } from "../../application";
import { formText } from "../../web/forms";
import { requireMemberPastWelcome } from "../../web/session";
import type { MeetupActionState } from "../meetups/actions";

export async function sendFlag(target: FlagInput["target"], form: FormData): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    await member.flag({ target, reason: formText(form.get("reason")) ?? "" });
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    if (isAccessDeniedError(error)) return { error: "This Member, Meetup or Event is unavailable." };
    throw error;
  }
  revalidatePath("/admin/moderation");
  return { message: "Flag sent to your Organisation Admin." };
}
