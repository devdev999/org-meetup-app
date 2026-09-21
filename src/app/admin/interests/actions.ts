"use server";

import { revalidatePath } from "next/cache";
import { isInvalidInputError, type OrganisationAdminActions } from "../../../application";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";
import type { ActionState } from "../../_components/action-form";

async function save(operation: (admin: OrganisationAdminActions) => Promise<string>): Promise<ActionState> {
  const admin = await requireOrganisationAdmin();
  try {
    const message = await operation(admin);
    revalidatePath("/", "layout");
    return { message };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}

export async function proposeInterestMerges(): Promise<ActionState> {
  return save(async (admin) => {
    await admin.proposeInterestMerges();
    return "Duplicate check complete. Review any proposals below.";
  });
}

export async function approveInterestMerge(id: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  return save(async (admin) => {
    await admin.approveInterestMerge(id, formText(form.get("survivingInterestId")) ?? "");
    return "Interests merged.";
  });
}

export async function splitInterestMerge(id: string): Promise<ActionState> {
  return save(async (admin) => {
    await admin.splitInterestMerge(id);
    return "Merge split. Later Member and Host changes were preserved.";
  });
}

export async function updateInterest(id: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  const kind = formText(form.get("kind"));
  if (kind !== "skill" && kind !== "hobby") return { error: "Choose Skill or Hobby." };
  return save(async (admin) => {
    await admin.updateInterest(id, { name: formText(form.get("name")) ?? "", kind });
    return "Interest saved.";
  });
}
