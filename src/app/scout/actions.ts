"use server";

import { isInvalidInputError, type ScoutConversation } from "../../application/index";
import { webConfig } from "../../config/env";
import { formText } from "../../web/forms";
import { seal, unseal } from "../../web/sealed";
import { requireMemberPastWelcome } from "../../web/session";

interface SavedConversation { purpose: "scout-conversation"; conversation: ScoutConversation }
export interface ScoutState { conversation?: ScoutConversation; token?: string; error?: string; reset?: boolean }

export async function askScout(previous: ScoutState, form: FormData): Promise<ScoutState> {
  const { member, profile } = await requireMemberPastWelcome();
  if (formText(form.get("intent")) === "clear") return {};
  const secret = webConfig().SESSION_SECRET;
  const saved = unseal(previous.token, secret) as SavedConversation | undefined;
  if (previous.token && (!saved || saved.purpose !== "scout-conversation" || saved.conversation.memberId !== profile.memberId)) {
    return { error: "This conversation has expired. Ask your question again." };
  }
  try {
    const answer = await member.askScout({ question: formText(form.get("question")) ?? "", conversation: saved?.conversation });
    const token = seal({ purpose: "scout-conversation", conversation: answer.conversation } satisfies SavedConversation, secret, 30 * 60 * 1000);
    return { conversation: answer.conversation, token, reset: answer.conversationReset };
  } catch (error) {
    if (isInvalidInputError(error)) return { error: error.message };
    throw error;
  }
}
