"use server";

import { revalidatePath } from "next/cache";
import { isAccessDeniedError, isInvalidInputError, type NoticeKind } from "../../application/index";
import { requireMemberPastWelcome } from "../../web/session";

export interface NotificationActionState {
  error?: string;
  message?: string;
  link?: { url: string; expiresAt: string };
}

function actionError(error: unknown): NotificationActionState {
  if (isInvalidInputError(error)) return { error: error.message };
  if (isAccessDeniedError(error)) return { error: "Sign in again to change your notification settings." };
  throw error;
}

export async function saveNoticePreference(kind: NoticeKind, form: FormData): Promise<NotificationActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    await member.setNoticePreference({ kind, telegram: form.get("telegram") === "on", email: form.get("email") === "on" });
    revalidatePath("/notifications");
    return { message: "Saved." };
  } catch (error) { return actionError(error); }
}

export async function changeTelegram(_previous: NotificationActionState, form: FormData): Promise<NotificationActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    if (form.get("operation") === "unlink") {
      await member.unlinkTelegram();
      revalidatePath("/notifications");
      return { message: "Telegram is unlinked." };
    }
    const link = await member.beginTelegramLink();
    return { link: { url: link.url, expiresAt: link.expiresAt.toISOString() } };
  } catch (error) { return actionError(error); }
}
