import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Deps } from "./deps";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError, InvalidInputError } from "./errors";
import { answerInvite, joinMeetup, meetupChoices } from "./meetups";
import { deliverSoon } from "./notifications";
import { organisations, telegramLinkCodes, telegramLinks } from "./schema";
import { postAvailability } from "./availability";
import type { TelegramAvailabilityAction, TelegramMessage } from "../ports";
import { answerRsvp } from "./recurring-meetups";

export interface TelegramLink { url: string; expiresAt: Date }
export type TelegramCommand = { kind: "link"; chatId: string; code: string }
  | { kind: "join"; chatId: string; callbackId: string; meetupId: string }
  | { kind: "answer-invite"; chatId: string; callbackId: string; inviteId: string; answer: "accept" | "decline" }
  | { kind: "answer-rsvp"; chatId: string; callbackId: string; meetupId: string; answer: "going" | "not-going" }
  | { kind: "availability-menu"; chatId: string }
  | (TelegramAvailabilityAction & { chatId: string; callbackId: string });

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
  if (command.kind === "availability-menu" || command.kind === "availability-activity" || command.kind === "availability-post") {
    await handleAvailabilityTelegram(deps, command);
    return;
  }
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
        } else if (command.kind === "answer-rsvp") {
          const status = await answerRsvp(deps, actor, command.meetupId, command.answer);
          gatheringId = command.meetupId;
          text = status === null ? "Not going recorded for this occurrence."
            : status === "waitlisted" ? "Going recorded. You are on the waitlist." : "Going recorded. You have a place.";
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

async function handleAvailabilityTelegram(deps: Deps, command: Extract<TelegramCommand, { kind: "availability-menu" | "availability-activity" | "availability-post" }>): Promise<void> {
  const [actor] = await deps.db.select().from(telegramLinks).where(eq(telegramLinks.chatId, command.chatId));
  let text = "Link Telegram from notification settings in the app first.";
  let message: TelegramMessage | undefined;
  let posted = false;
  if (actor) {
    try {
      const choices = await meetupChoices(deps, actor);
      if (command.kind === "availability-menu") {
        message = {
          chatId: command.chatId, text: choices.activities.length ? "What are you free for? Choose an Activity." : "No Activities are available. Open the app to check with your Organisation Admin.",
          buttons: choices.activities.map((activity) => [{ text: activity.name, action: { kind: "availability-activity", activityId: activity.id } }]),
        };
      } else if (command.kind === "availability-activity") {
        const activity = choices.activities.find((entry) => entry.id === command.activityId);
        if (!activity) throw new InvalidInputError("invalid-availability", "Activity unavailable.");
        const issuedAt = new Date(Math.floor(deps.clock.now().getTime() / 1000) * 1000);
        const kinds = choices.sites.some((site) => site.id === choices.defaultSiteId) ? ["physical", "virtual"] as const : ["virtual"] as const;
        message = {
          chatId: command.chatId, text: `${activity.name}: choose a window. Windows end by midnight UTC.`,
          buttons: kinds.flatMap((kind) => [30, 60].map((minutes) => [{
            text: `Now for ${minutes} minutes ${kind === "physical" ? "at my Site" : "virtually"}`,
            action: { kind: "availability-post" as const, activityId: activity.id, issuedAt, minutes, placeKind: kind },
          }])),
        };
        text = "Choose a window.";
      } else {
        const selected = z.object({ activityId: z.uuid(), issuedAt: z.date(), minutes: z.union([z.literal(30), z.literal(60)]), placeKind: z.enum(["physical", "virtual"]) }).safeParse(command);
        const now = deps.clock.now();
        const issued = selected.success ? selected.data.issuedAt.getTime() : NaN;
        if (!selected.success || issued > now.getTime() || now.getTime() - issued >= 10 * 60_000) {
          throw new InvalidInputError("invalid-availability", "Window unavailable.");
        }
        const endOfDay = new Date(issued);
        endOfDay.setUTCHours(24, 0, 0, 0);
        await postAvailability(deps, actor, {
          activityId: selected.data.activityId, startsAt: selected.data.issuedAt, kind: selected.data.placeKind,
          endsAt: new Date(Math.min(issued + selected.data.minutes * 60_000, endOfDay.getTime())),
        });
        posted = true;
        text = "Availability posted.";
      }
    } catch (error) {
      if (!(error instanceof AccessDeniedError || error instanceof AdminVisibilityNoticeRequiredError || error instanceof InvalidInputError)) throw error;
      text = "This Availability choice is unavailable. Send /available to choose again.";
    }
  }
  if (command.kind !== "availability-menu") {
    try { await deps.telegram.answerCallback({ callbackId: command.callbackId, text }); }
    catch { console.error("telegram: answering the Availability callback failed"); }
  }
  try {
    if (message) await deps.telegram.sendMessage(message);
    else if (command.kind === "availability-menu") await deps.telegram.sendMessage({ chatId: command.chatId, text });
  } catch {
    console.error("telegram: sending the Availability response failed");
  }
  if (actor && posted) await deliverSoon(deps, { organisationId: actor.organisationId, kind: "availability-overlap" });
}
