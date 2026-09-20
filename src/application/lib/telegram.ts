import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Deps } from "./deps";
import { AccessDeniedError, AdminVisibilityNoticeRequiredError, InvalidInputError } from "./errors";
import { answerInvite, joinMeetup, meetupChoices } from "./meetups";
import { deliverSoon } from "./notifications";
import { organisations, telegramLinkCodes, telegramLinks } from "./schema";
import { postAvailability } from "./availability";
import type { TelegramMessage } from "../ports";

export interface TelegramLink { url: string; expiresAt: Date }
export type TelegramCommand = { kind: "link"; chatId: string; code: string }
  | { kind: "join"; chatId: string; callbackId: string; meetupId: string }
  | { kind: "answer-invite"; chatId: string; callbackId: string; inviteId: string; answer: "accept" | "decline" }
  | { kind: "availability-menu"; chatId: string }
  | { kind: "availability-choice"; chatId: string; callbackId: string; choice: string };

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
  if (command.kind === "availability-menu" || command.kind === "availability-choice") {
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

async function handleAvailabilityTelegram(deps: Deps, command: Extract<TelegramCommand, { kind: "availability-menu" | "availability-choice" }>): Promise<void> {
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
          buttons: choices.activities.map((activity) => [{ text: activity.name, data: `av-activity:${activity.id}` }]),
        };
      } else if (command.choice.startsWith("av-activity:")) {
        const activity = choices.activities.find((entry) => entry.id === command.choice.slice(12));
        if (!activity) throw new InvalidInputError("invalid-availability", "Activity unavailable.");
        const issued = Math.floor(deps.clock.now().getTime() / 1000).toString(36);
        const kinds = choices.sites.some((site) => site.id === choices.defaultSiteId) ? ["p", "v"] : ["v"];
        message = {
          chatId: command.chatId, text: `${activity.name}: choose a window. Windows end by midnight UTC.`,
          buttons: kinds.flatMap((kind) => [30, 60].map((minutes) => [{
            text: `Now for ${minutes} minutes ${kind === "p" ? "at my Site" : "virtually"}`,
            data: `av-post:${activity.id}:${issued}:${kind}:${minutes}`,
          }])),
        };
        text = "Choose a window.";
      } else {
        const selected = command.choice.match(/^av-post:([a-f0-9-]{36}):([a-z0-9]{1,10}):(p|v):(30|60)$/);
        const now = deps.clock.now();
        const issued = selected ? Number.parseInt(selected[2]!, 36) * 1000 : NaN;
        if (!selected || !Number.isSafeInteger(issued) || issued > now.getTime() || now.getTime() - issued >= 10 * 60_000) {
          throw new InvalidInputError("invalid-availability", "Window unavailable.");
        }
        const endOfDay = new Date(issued);
        endOfDay.setUTCHours(24, 0, 0, 0);
        await postAvailability(deps, actor, {
          activityId: selected[1]!, startsAt: new Date(issued), kind: selected[3] === "p" ? "physical" : "virtual",
          endsAt: new Date(Math.min(issued + Number(selected[4]) * 60_000, endOfDay.getTime())),
        });
        posted = true;
        text = "Availability posted.";
      }
    } catch (error) {
      if (!(error instanceof AccessDeniedError || error instanceof AdminVisibilityNoticeRequiredError || error instanceof InvalidInputError)) throw error;
      text = "This Availability choice is unavailable. Send /available to choose again.";
    }
  }
  try {
    if (command.kind === "availability-choice") await deps.telegram.answerCallback({ callbackId: command.callbackId, text });
    if (message) await deps.telegram.sendMessage(message);
    else if (command.kind === "availability-menu") await deps.telegram.sendMessage({ chatId: command.chatId, text });
  } catch {
    console.error("telegram: sending the Availability response failed");
  }
  if (actor && posted) await deliverSoon(deps, { organisationId: actor.organisationId, kind: "availability-overlap" });
}
