"use server";

import { revalidatePath } from "next/cache";
import { parseRosterCsv } from "../../../adapters/roster/csv";
import { isInvalidInputError, type RosterPreview, type RosterRow } from "../../../application/index";
import { formText } from "../../../web/forms";
import { requireOrganisationAdmin } from "../../../web/session";

export interface UploadState {
  error?: string;
  rows?: RosterRow[];
  preview?: RosterPreview;
}

export async function previewRosterUpload(_previous: UploadState, form: FormData): Promise<UploadState> {
  const admin = await requireOrganisationAdmin();
  const file = form.get("roster");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) {
    return { error: "Choose a CSV file up to 1 MB." };
  }
  try {
    const rows = parseRosterCsv(await file.text());
    return { rows, preview: await admin.previewRoster(rows) };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}

export async function commitRosterUpload(
  _previous: { error?: string; saved?: boolean },
  form: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const admin = await requireOrganisationAdmin();
  let rows: RosterRow[];
  try {
    rows = JSON.parse(formText(form.get("rows")) ?? "");
  } catch {
    return { error: "Upload the CSV again to get a new preview." };
  }
  try {
    await admin.commitRoster(rows, formText(form.get("revision")) ?? "");
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/profile");
  return { saved: true };
}
