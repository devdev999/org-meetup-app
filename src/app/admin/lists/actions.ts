"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isInvalidInputError,
  type OrganisationAdminActions,
  type OrganisationListKind,
} from "../../../application/index";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";

async function save(operation: (admin: OrganisationAdminActions) => Promise<unknown>): Promise<void> {
  const admin = await requireOrganisationAdmin();
  try {
    await operation(admin);
  } catch (error) {
    if (isInvalidInputError(error)) redirect(`/admin/lists?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/admin/lists");
  revalidatePath("/profile");
  redirect("/admin/lists");
}

export async function createListEntry(kind: OrganisationListKind, form: FormData): Promise<void> {
  await save((admin) => admin.createListEntry(kind, formText(form.get("name")) ?? ""));
}

export async function renameListEntry(kind: OrganisationListKind, id: string, form: FormData): Promise<void> {
  await save((admin) => admin.renameListEntry(kind, id, formText(form.get("name")) ?? ""));
}

export async function retireListEntry(kind: OrganisationListKind, id: string): Promise<void> {
  await save((admin) => admin.retireListEntry(kind, id));
}
