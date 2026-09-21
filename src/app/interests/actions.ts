"use server";

import { revalidatePath } from "next/cache";
import { isInvalidInputError, type InterestKind, type InterestResolution, type InterestSelection } from "../../application/index";
import { webConfig } from "../../config/env";
import { formText } from "../../web/forms";
import { seal, unseal } from "../../web/sealed";
import { requireMemberPastWelcome } from "../../web/session";

interface PendingInterest {
  purpose: "interest-preview";
  memberId: string;
  resolution: InterestResolution;
  kind: InterestKind;
  stance: "shares" | "seeks";
}

export interface InterestPreviewState {
  error?: string;
  preview?: Omit<PendingInterest, "memberId" | "purpose"> & { token: string };
}

export interface InterestSaveState {
  error?: string;
  saved?: boolean;
}

function inputErrorState(error: unknown): { error: string } {
  if (isInvalidInputError(error)) return { error: error.message };
  throw error;
}

function revalidateInterests(): void {
  revalidatePath("/interests");
  revalidatePath("/members", "layout");
}

export async function previewInterest(form: FormData): Promise<InterestPreviewState> {
  const { member, profile } = await requireMemberPastWelcome();
  const phrase = formText(form.get("phrase")) ?? "";
  const kind = formText(form.get("kind"));
  const stance = formText(form.get("stance"));
  if (kind !== "skill" && kind !== "hobby") return { error: "Choose Skill or Hobby." };
  if (stance !== "shares" && stance !== "seeks") return { error: "Choose Shares or Seeks." };
  try {
    const resolution = await member.resolveInterest({ phrase, kind });
    const pending: PendingInterest = { purpose: "interest-preview", memberId: profile.memberId, resolution, kind, stance };
    const token = seal(pending, webConfig().SESSION_SECRET, 15 * 60 * 1000);
    return { preview: { resolution, kind, stance, token } };
  } catch (error) {
    return inputErrorState(error);
  }
}

export async function confirmInterest(form: FormData): Promise<InterestSaveState> {
  const { member, profile } = await requireMemberPastWelcome();
  const pending = unseal(formText(form.get("token")) ?? undefined, webConfig().SESSION_SECRET) as PendingInterest | undefined;
  if (!pending || pending.purpose !== "interest-preview" || pending.memberId !== profile.memberId) {
    return { error: "This preview has expired. Preview your Interest again." };
  }
  const choice = formText(form.get("choice"));
  let selection: InterestSelection;
  if (choice === "proposed") {
    selection = pending.resolution.proposed;
  } else if (choice === "original") {
    selection = { name: pending.resolution.phrase, kind: pending.kind };
  } else {
    const selected = pending.resolution.shortlist.find((interest) => interest.interestId === choice);
    if (!selected) return { error: "Choose an Interest from this preview." };
    selection = { interestId: selected.interestId };
  }
  try {
    await member.confirmInterest({ phrase: pending.resolution.phrase, selection, stance: pending.stance });
  } catch (error) {
    return inputErrorState(error);
  }
  revalidateInterests();
  return { saved: true };
}

export async function updateInterestStance(form: FormData): Promise<InterestSaveState> {
  const { member } = await requireMemberPastWelcome();
  const stance = formText(form.get("stance"));
  if (stance !== "shares" && stance !== "seeks") return { error: "Choose Shares or Seeks." };
  try {
    await member.setInterestStance({ interestId: formText(form.get("interestId")) ?? "", stance });
  } catch (error) {
    return inputErrorState(error);
  }
  revalidateInterests();
  return { saved: true };
}

export async function removeInterest(form: FormData): Promise<InterestSaveState> {
  const { member } = await requireMemberPastWelcome();
  try {
    await member.removeInterest(formText(form.get("interestId")) ?? "");
  } catch (error) {
    return inputErrorState(error);
  }
  revalidateInterests();
  return { saved: true };
}
