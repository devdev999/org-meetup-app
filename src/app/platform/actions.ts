"use server";

import { revalidatePath } from "next/cache";
import { isInvalidInputError, type PlatformAdminActions } from "../../application";
import { formText } from "../../web/forms";
import { requirePlatformAdmin } from "../../web/session";

export interface PlatformActionState { error?: string; message?: string }

async function save(operation: (admin: PlatformAdminActions) => Promise<string>): Promise<PlatformActionState> {
  const admin = await requirePlatformAdmin();
  try {
    const message = await operation(admin);
    revalidatePath("/", "layout");
    return { message };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}

export async function createOrganisation(_previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  return save(async (admin) => {
    const optionalClaims = Object.fromEntries(["department", "site", "staffIdentifier"].flatMap((name) => {
      const value = formText(form.get(`claim-${name}`));
      return value ? [[name, value]] : [];
    }));
    const organisation = await admin.createOrganisation({
      organisation: { slug: formText(form.get("slug")) ?? "", name: formText(form.get("name")) ?? "" },
      oidc: { issuer: formText(form.get("issuer")) ?? "", clientId: formText(form.get("clientId")) ?? "",
        credentialRef: formText(form.get("credentialRef")), claimMapping: { email: formText(form.get("claim-email")) ?? "",
          name: formText(form.get("claim-name")) ?? "", ...optionalClaims } },
      organisationAdmin: { name: formText(form.get("adminName")) ?? "", email: formText(form.get("adminEmail")) ?? "" },
    });
    return organisation.signInReady ? `${organisation.name} created and ready for sign-in.`
      : `${organisation.name} created. Sign-in is waiting for an operator to install the required OIDC credential and restart the services.`;
  });
}

export async function setFirstOrganisationAdmin(id: string, _previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  return save(async (admin) => {
    await admin.setFirstOrganisationAdmin(id, { name: formText(form.get("name")) ?? "", email: formText(form.get("email")) ?? "" });
    return "First Organisation Admin appointed.";
  });
}

export async function createMinistry(_previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  return save(async (admin) => {
    const ministry = await admin.createMinistry(formText(form.get("name")) ?? "");
    return `${ministry.name} created.`;
  });
}

export async function assignMinistry(id: string, _previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  return save(async (admin) => {
    await admin.assignMinistry(id, formText(form.get("ministryId")));
    return "Ministry grouping saved.";
  });
}

export async function updateSettings(_previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  return save(async (admin) => {
    await admin.updateSettings({ aiBaseUrl: formText(form.get("aiBaseUrl")), scoutModel: formText(form.get("scoutModel")) ?? "",
      extractionModel: formText(form.get("extractionModel")) ?? "", telegramBotUsername: formText(form.get("telegramBotUsername")),
      emailFrom: formText(form.get("emailFrom")), timeZone: formText(form.get("timeZone")) ?? "" });
    return "Deployment settings saved.";
  });
}
