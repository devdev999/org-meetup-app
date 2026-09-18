"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formText } from "../../web/forms";
import { requireMember, SESSION_COOKIE } from "../../web/session";

export async function updateProfile(formData: FormData): Promise<void> {
  const member = await requireMember();
  await member.updateProfile({
    department: formText(formData.get("department")),
    site: formText(formData.get("site")),
  });
  revalidatePath("/profile");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
