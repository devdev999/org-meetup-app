import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Deps } from "./deps";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError, InvalidInputError } from "./errors";
import { answerInvite, joinMeetup } from "./meetups";
import { deliverSoon } from "./notifications";
import { organisations, telegramLinkCodes, telegramLinks } from "./schema";

export interface TelegramLink { url: string; expiresAt: Date }
export type TelegramCommand = { kind: "link"; chatId: string; code: string }
  | { kind: "join"; chatId: string; callbackId: string; meetupId: string }
  | { kind: "answer-invite"; chatId: string; callbackId: string; inviteId: string; answer: "accept" | "decline" };

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function beginTelegramLink(deps: Deps, actor: Actor): Promise<TelegramLink> {
  if (!deps.telegram.botUsername) throw new InvalidInputError("invalid-telegram-link", "Telegram linking is unavailable.");
  const code = randomBytes(24).toString("base64url");
  const codeHash = hash(code);
  const expiresAt = new Date(deps.clock.now().getTime() + 10 * 60_000);
  await withActiveMember(deps, actor, async (db) => {
    await db.insert(telegramLinkCodes).values({ ...actor, codeHash, expiresAt })
      .onConflictDoUpdate({ target: [telegramLinkCodes.organisationId, telegramLinkCodes.memberId], set: { codeHash, expiresAt } });
  });
  return { url: `https://t.me/${deps.telegram.botUsername}?start=${code}`, expiresAt };
}

export async function unlinkTelegram(deps: Deps, actor: Actor): Promise<void> {
  await withActiveMember(deps, actor, async (db) => {
    await db.delete(telegramLinks).where(and(eq(telegramLinks.organisationId, actor.organisationId), eq(telegramLinks.memberId, actor.memberId)));
    await db.delete(telegramLinkCodes).where(and(eq(telegramLinkCodes.organisationId, actor.organisationId), eq(telegramLinkCodes.memberId, actor.memberId)));
  });
}

async function linkTelegram(deps: Deps, code: string, chatId: string): Promise<boolean> {
  const codeHash = hash(code);
  return deps.db.transaction(async (db) => {
    const [candidate] = await db.select().from(telegramLinkCodes).where(eq(telegramLinkCodes.codeHash, codeHash));
    if (!candidate) return false;
    await db.select().from(organisations).where(eq(organisations.id, candidate.organisationId)).for("update");
    const [current] = await db.select().from(telegramLinkCodes)
      .where(and(eq(telegramLinkCodes.codeHash, codeHash), gt(telegramLinkCodes.expiresAt, deps.clock.now())));
    if (!current) return false;
    await requireActiveMember(db, current);
    const [link] = await db.insert(telegramLinks).values({ organisationId: current.organisationId, memberId: current.memberId, chatId })
      .onConflictDoNothing().returning();
    if (!link) return false;
    await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.codeHash, codeHash));
    return true;
  });
}

export async function handleTelegram(deps: Deps, command: TelegramCommand): Promise<void> {
  if (command.kind !== "link") {
    const [actor] = await deps.db.select().from(telegramLinks).where(eq(telegramLinks.chatId, command.chatId));
    let text = "Link Telegram from notification settings in the app first.";
    let gatheringId: string | undefined;
    if (actor) {
      try {
        if (command.kind === "join") {
          const result = await joinMeetup(deps, actor, command.meetupId);
          gatheringId = command.meetupId;
          text = result === "participant" ? "You joined the Meetup." : "You are on the waitlist.";
        } else {
          const result = await answerInvite(deps, actor, command.inviteId, command.answer);
          gatheringId = result.meetupId;
          text = result.state === "declined" ? "Invite declined."
            : result.membership === null ? "Your Invite was accepted, but you no longer have a place in this Meetup."
            : result.membership === "waitlisted" ? "Invite accepted. You are on the waitlist." : "Invite accepted.";
        }
      } catch (error) {
        if (!(error instanceof AccessDeniedError || error instanceof AdminVisibilityNoticeRequiredError || error instanceof InvalidInputError)) throw error;
        text = "This Meetup or Invite is unavailable. Open the app to check your access.";
      }
    }
    try {
      await deps.telegram.answerCallback({ callbackId: command.callbackId, text });
    } catch {
      console.error("telegram: answering the callback failed");
    }
    if (actor && gatheringId) await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId });
    return;
  }
  let linked = false;
  try {
    linked = await linkTelegram(deps, command.code, command.chatId);
  } catch (error) {
    if (!(error instanceof AccessDeniedError || error instanceof AdminVisibilityNoticeRequiredError)) throw error;
  }
  try {
    await deps.telegram.sendMessage({
      chatId: command.chatId,
      text: linked ? "Telegram is linked. You can change your notice preferences in the app."
        : "This link cannot be used. Open notification settings in the app to get a new link, or unlink an existing account first.",
    });
  } catch {
    console.error("telegram: sending the link confirmation failed");
  }
}
