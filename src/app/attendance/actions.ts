"use server";

import { revalidatePath } from "next/cache";
import { isAccessDeniedError, isInvalidInputError } from "../../application";
import { requireMemberPastWelcome } from "../../web/session";

export interface AttendanceActionState { error?: string }

export async function saveAttendance(id: string, operation: "confirm" | "rate", form: FormData): Promise<AttendanceActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    if (operation === "confirm") await member.confirmAttendance(id, form.getAll("memberId").filter((value): value is string => typeof value === "string"));
    else if (operation === "rate") await member.rateOccurrence(id, Number(form.get("rating")));
    else return { error: "Choose an Attendance action." };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    if (isAccessDeniedError(error)) return { error: "This occurrence is unavailable, or you cannot make this change." };
    throw error;
  }
  for (const path of ["/meetups", "/events", "/attendance", "/connections", "/admin/attendance", "/inbox", "/"]) revalidatePath(path, "layout");
  return {};
}
