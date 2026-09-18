"use server";

import { revalidatePath } from "next/cache";
import { parseRosterCsv } from "../../../adapters/roster/csv";
import { isInvalidInputError, type RosterPreview } from "../../../application/index";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";

export interface UploadState {
  error?: string;
  csv?: string;
  preview?: RosterPreview;
}

export async function previewRosterUpload(form: FormData): Promise<UploadState> {
  const admin = await requireOrganisationAdmin();
  const file = form.get("roster");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) {
    return { error: "Choose a CSV file up to 1 MB." };
  }
  try {
    const csv = await file.text();
    return { csv, preview: await admin.previewRoster(parseRosterCsv(csv)) };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}

export async function commitRosterUpload(form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const admin = await requireOrganisationAdmin();
  try {
    const rows = parseRosterCsv(formText(form.get("csv")) ?? "");
    await admin.commitRoster(rows, formText(form.get("revision")) ?? "");
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/profile");
  return { saved: true };
}
