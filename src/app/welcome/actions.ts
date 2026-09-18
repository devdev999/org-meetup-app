"use server";

import { redirect } from "next/navigation";
import { requireMember } from "../../web/session";

export async function acknowledgeAdminVisibilityNotice(): Promise<void> {
  const member = await requireMember();
  await member.acknowledgeAdminVisibilityNotice();
  redirect("/profile");
}
