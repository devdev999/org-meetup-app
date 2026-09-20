import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { NOTICE_KINDS, type NoticeKind } from "./notice-kinds";
import { activities, gatheringRsvps, gatherings, invites, members, noticeDeliveries, noticePreferences, notices, recurrenceMembers, sites, telegramLinks } from "./schema";

export interface NoticePreference { kind: NoticeKind; telegram: boolean; email: boolean }

export function gatheringNoticeText(input: { message: string; activity: string; startsAt: Date; place: string; externalPlace: string }) {
  const time = `${input.startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const line = (place: string) => `${input.message} ${input.activity}, ${time}, ${place}.`;
  return { message: line(input.place), externalMessage: line(input.externalPlace), messagePrefix: input.message };
}

const URGENT_KINDS: NoticeKind[] = ["meetup-joined", "meetup-promoted", "meetup-cancelled", "meetup-edited", "invite-received", "invite-accepted", "availability-overlap", "rsvp-prompt"];

const DIGEST_HOUR_UTC = 9;
const BATCH = 100;
const LEASE_MS = 60_000;
const RENEW_EVERY_MS = 20_000;
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 15;

function nextDigest(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(DIGEST_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function channelEnabled(preference: { telegram: boolean; email: boolean } | undefined, channel: "telegram" | "email"): boolean {
  if (!preference) return true;
  return channel === "telegram" ? preference.telegram : preference.email;
}

export interface NotificationSettings {
  telegramAvailable: boolean;
  telegramLinked: boolean;
  preferences: NoticePreference[];
}

export async function notificationSettings(deps: Deps, actor: Actor): Promise<NotificationSettings> {
  await requireActiveMember(deps.db, actor);
  const [[link], preferences] = await Promise.all([
    deps.db.select().from(telegramLinks)
      .where(and(eq(telegramLinks.organisationId, actor.organisationId), eq(telegramLinks.memberId, actor.memberId))),
    deps.db.select({ kind: noticePreferences.kind, telegram: noticePreferences.telegram, email: noticePreferences.email })
      .from(noticePreferences).where(and(eq(noticePreferences.organisationId, actor.organisationId), eq(noticePreferences.memberId, actor.memberId))),
  ]);
  return {
    telegramAvailable: deps.telegram.botUsername !== null, telegramLinked: Boolean(link),
    preferences: NOTICE_KINDS.map((kind) => preferences.find((preference) => preference.kind === kind) ?? { kind, telegram: true, email: true }),
  };
}

export async function setNoticePreference(deps: Deps, actor: Actor, input: NoticePreference): Promise<void> {
  const parsed = z.object({ kind: z.enum(NOTICE_KINDS), telegram: z.boolean(), email: z.boolean() }).safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-notice-preference", "Choose a notice kind and a preference for each channel.");
  await withActiveMember(deps, actor, async (db) => {
    await db.insert(noticePreferences).values({ ...actor, ...parsed.data }).onConflictDoUpdate({
      target: [noticePreferences.organisationId, noticePreferences.memberId, noticePreferences.kind],
      set: { telegram: parsed.data.telegram, email: parsed.data.email },
    });
  });
}

export async function recordNotices(db: Queryable, organisationId: string, recipients: string[],
  input: Pick<typeof notices.$inferInsert, "gatheringId" | "kind" | "message" | "externalMessage" | "messagePrefix">, now: Date): Promise<void> {
  if (!recipients.length) return;
  const memberIds = [...new Set(recipients)];
  const created = await db.insert(notices).values(memberIds.map((memberId) => ({ ...input, organisationId, memberId, createdAt: now }))).returning();
  const links = await db.select().from(telegramLinks)
    .where(and(eq(telegramLinks.organisationId, organisationId), inArray(telegramLinks.memberId, memberIds)));
  const preferences = await db.select().from(noticePreferences)
    .where(and(eq(noticePreferences.organisationId, organisationId), inArray(noticePreferences.memberId, memberIds), eq(noticePreferences.kind, input.kind)));
  const deliveries: Array<typeof noticeDeliveries.$inferInsert> = [];
  for (const notice of created) {
    const base = { organisationId, noticeId: notice.id, mode: "immediate" as const, scheduledFor: now, availableAt: now };
    const preference = preferences.find((entry) => entry.memberId === notice.memberId);
    if (channelEnabled(preference, "email")) {
      const urgent = URGENT_KINDS.includes(notice.kind);
      const scheduledFor = urgent ? now : nextDigest(now);
      deliveries.push({ ...base, channel: "email", mode: urgent ? "immediate" : "digest", scheduledFor, availableAt: scheduledFor });
    }
    if (channelEnabled(preference, "telegram") && links.some((link) => link.memberId === notice.memberId)) deliveries.push({ ...base, channel: "telegram" });
  }
  if (deliveries.length) await db.insert(noticeDeliveries).values(deliveries);
}

export async function supersedeDeliveries(db: Queryable, organisationId: string, gatheringId: string, kind: "invite-received" | "meetup-edited" | "rsvp-prompt", now: Date, memberId?: string): Promise<void> {
  await db.update(noticeDeliveries).set({ finishedAt: now }).where(and(
    eq(noticeDeliveries.organisationId, organisationId), isNull(noticeDeliveries.finishedAt),
    inArray(noticeDeliveries.noticeId, db.select({ id: notices.id }).from(notices).where(and(
      eq(notices.organisationId, organisationId), eq(notices.gatheringId, gatheringId), eq(notices.kind, kind),
      memberId ? eq(notices.memberId, memberId) : undefined,
    ))),
  ));
}

function deliveryWhere(delivery: Pick<typeof noticeDeliveries.$inferSelect, "organisationId" | "noticeId" | "channel">) {
  return and(eq(noticeDeliveries.organisationId, delivery.organisationId), eq(noticeDeliveries.noticeId, delivery.noticeId), eq(noticeDeliveries.channel, delivery.channel));
}

function duePredicate(mode: (typeof noticeDeliveries.$inferSelect)["mode"], now: Date) {
  return and(isNull(noticeDeliveries.finishedAt), eq(noticeDeliveries.mode, mode), lte(noticeDeliveries.availableAt, now));
}

const digestNoticeJoin = and(eq(notices.organisationId, noticeDeliveries.organisationId), eq(notices.id, noticeDeliveries.noticeId));

interface DeliveryJob { where: SQL | undefined; send: () => Promise<void> }

async function claimLease(db: Queryable, where: SQL | undefined, now: Date) {
  const claimToken = randomUUID();
  await db.update(noticeDeliveries).set({ claimToken, availableAt: new Date(now.getTime() + LEASE_MS) }).where(where);
  return and(where, eq(noticeDeliveries.claimToken, claimToken), isNull(noticeDeliveries.finishedAt));
}

/**
 * Provider calls hold no transaction. Renew the claim while sending, then settle
 * only that claim. A stopped process leaves its lease to expire for another worker.
 */
async function runJob(deps: Deps, job: DeliveryJob): Promise<void> {
  const stopRenewing = deps.clock.every(RENEW_EVERY_MS, async () => {
    try {
      await deps.db.update(noticeDeliveries)
        .set({ availableAt: new Date(deps.clock.now().getTime() + LEASE_MS) }).where(job.where);
    } catch {
      console.error("notices: delivery lease renewal failed");
    }
  });
  let ok = true;
  try {
    await job.send();
  } catch {
    ok = false;
  } finally {
    await stopRenewing();
  }
  const now = deps.clock.now();
  await deps.db.transaction(async (db) => {
    if (ok) {
      await db.update(noticeDeliveries).set({ finishedAt: now }).where(job.where);
      return;
    }
    const rows = await db.update(noticeDeliveries)
      .set({ attempts: sql`${noticeDeliveries.attempts} + 1`, availableAt: new Date(now.getTime() + RETRY_DELAY_MS) })
      .where(job.where).returning({ attempts: noticeDeliveries.attempts });
    if (rows.some((row) => row.attempts >= MAX_ATTEMPTS)) {
      await db.update(noticeDeliveries).set({ finishedAt: now, deadLetteredAt: now }).where(job.where);
    }
  });
}

async function claimImmediate(deps: Deps, candidate: Pick<typeof noticeDeliveries.$inferSelect, "organisationId" | "noticeId" | "channel">): Promise<DeliveryJob | null> {
  return deps.db.transaction(async (db) => {
    const now = deps.clock.now();
    const where = deliveryWhere(candidate);
    const [delivery] = await db.select().from(noticeDeliveries).where(and(where, duePredicate("immediate", now))).for("update", { skipLocked: true });
    if (!delivery) return null;
    const [row] = await db.select({ notice: notices, member: members, meetup: gatherings, activityName: activities.name, siteName: sites.name }).from(notices)
      .innerJoin(members, and(eq(members.organisationId, notices.organisationId), eq(members.id, notices.memberId)))
      .leftJoin(gatherings, and(eq(gatherings.organisationId, notices.organisationId), eq(gatherings.id, notices.gatheringId)))
      .leftJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
      .leftJoin(sites, and(eq(sites.organisationId, gatherings.organisationId), eq(sites.id, gatherings.placeSiteId)))
      .where(and(eq(notices.organisationId, delivery.organisationId), eq(notices.id, delivery.noticeId)));
    const [preference] = row ? await db.select().from(noticePreferences).where(and(
      eq(noticePreferences.organisationId, delivery.organisationId), eq(noticePreferences.memberId, row.member.id), eq(noticePreferences.kind, row.notice.kind),
    )) : [];
    let link: typeof telegramLinks.$inferSelect | undefined;
    if (row && delivery.channel === "telegram") {
      [link] = await db.select().from(telegramLinks).where(and(eq(telegramLinks.organisationId, delivery.organisationId), eq(telegramLinks.memberId, row.member.id)));
    }
    const [invite] = row?.meetup && (row.notice.kind === "invite-received" || row.notice.kind === "meetup-edited") && delivery.channel === "telegram" ? await db.select({ id: invites.id }).from(invites)
      .where(and(eq(invites.organisationId, row.notice.organisationId), eq(invites.gatheringId, row.meetup.id),
        eq(invites.memberId, row.member.id), eq(invites.state, "pending"))) : [];
    const canAnswer = row?.meetup?.status === "scheduled" && row.meetup.startsAt > now;
    const [rsvp] = row?.meetup && row.notice.kind === "rsvp-prompt" ? await db.select({ memberId: gatheringRsvps.memberId }).from(gatheringRsvps)
      .innerJoin(recurrenceMembers, and(eq(recurrenceMembers.organisationId, gatheringRsvps.organisationId), eq(recurrenceMembers.memberId, gatheringRsvps.memberId), eq(recurrenceMembers.recurrenceId, row.meetup.recurrenceId!)))
      .where(and(eq(gatheringRsvps.organisationId, row.notice.organisationId), eq(gatheringRsvps.gatheringId, row.meetup.id), eq(gatheringRsvps.memberId, row.member.id), eq(gatheringRsvps.promptedAt, row.notice.createdAt))) : [];
    const owned = await claimLease(db, where, now);
    const content = row?.notice.kind === "invite-received" && row.meetup && row.activityName && row.notice.messagePrefix
      ? gatheringNoticeText({
        message: row.notice.messagePrefix,
        activity: row.activityName, startsAt: row.meetup.startsAt,
        place: row.meetup.placeKind === "physical" ? `${row.meetup.placeSpot}, ${row.siteName}` : row.meetup.placeUrl!,
        externalPlace: row.meetup.placeKind === "physical" ? `${row.meetup.placeSpot}, ${row.siteName}` : "Online",
      }) : row?.notice;
    const send = async () => {
      if (!row || !VISIBLE_MEMBER_STATUSES.includes(row.member.status) || !channelEnabled(preference, delivery.channel)) return;
      if (row.notice.kind === "rsvp-prompt" && (!canAnswer || !rsvp)) return;
      if (delivery.channel === "email") {
        await deps.email.sendMessage({ id: row.notice.id, to: row.member.email, subject: row.notice.kind === "availability-overlap" ? "Availability overlap" : row.meetup?.kind === "event" ? "Event notice" : "Meetup notice", text: content!.message });
      } else if (link) {
        await deps.telegram.sendMessage({
          chatId: link.chatId, text: content!.externalMessage,
          ...(canAnswer && row.notice.kind === "rsvp-prompt" ? row.meetup!.kind === "event" ? { rsvpEventId: row.meetup!.id } : { rsvpMeetupId: row.meetup!.id }
            : canAnswer && invite ? { inviteId: invite.id }
            : canAnswer && row.meetup?.audienceKind === "open" && !row.notice.kind.startsWith("invite-") ? row.meetup.kind === "event" ? { joinEventId: row.meetup.id } : { joinMeetupId: row.meetup.id } : {}),
        });
      }
    };
    return { where: owned, send };
  });
}

export async function deliverNotices(deps: Deps, scope?: { organisationId?: string; gatheringId?: string; kind?: NoticeKind }): Promise<void> {
  const now = deps.clock.now();
  const candidates = await deps.db
    .select({ organisationId: noticeDeliveries.organisationId, noticeId: noticeDeliveries.noticeId, channel: noticeDeliveries.channel })
    .from(noticeDeliveries).innerJoin(notices, digestNoticeJoin)
    .where(and(
      duePredicate("immediate", now),
      scope?.organisationId ? eq(noticeDeliveries.organisationId, scope.organisationId) : undefined,
      scope?.gatheringId ? eq(notices.gatheringId, scope.gatheringId) : undefined,
      scope?.kind ? eq(notices.kind, scope.kind) : undefined,
    ))
    .orderBy(noticeDeliveries.availableAt, noticeDeliveries.noticeId).limit(BATCH);
  for (const candidate of candidates) {
    const job = await claimImmediate(deps, candidate);
    if (job) await runJob(deps, job);
  }
}

export async function deliverSoon(deps: Deps, scope: { organisationId: string; gatheringId?: string; kind?: NoticeKind }): Promise<void> {
  await deliverNotices(deps, scope).catch(() => console.error("notices: immediate delivery deferred to the worker"));
}

async function claimDigest(deps: Deps, group: { organisationId: string; memberId: string; scheduledFor: Date }): Promise<DeliveryJob | null> {
  return deps.db.transaction(async (db) => {
    const now = deps.clock.now();
    const due = duePredicate("digest", now);
    const [member] = await db.select().from(members)
      .where(and(eq(members.organisationId, group.organisationId), eq(members.id, group.memberId))).for("update");
    const rows = await db.select({ notice: notices, gatheringKind: gatherings.kind }).from(noticeDeliveries).innerJoin(notices, digestNoticeJoin)
      .leftJoin(gatherings, and(eq(gatherings.organisationId, notices.organisationId), eq(gatherings.id, notices.gatheringId)))
      .where(and(due, eq(notices.organisationId, group.organisationId), eq(notices.memberId, group.memberId), eq(noticeDeliveries.scheduledFor, group.scheduledFor)))
      .orderBy(notices.position);
    if (!rows.length) return null;
    const preferences = await db.select().from(noticePreferences)
      .where(and(eq(noticePreferences.organisationId, group.organisationId), eq(noticePreferences.memberId, group.memberId)));
    const enabled = rows.filter(({ notice }) => channelEnabled(preferences.find((preference) => preference.kind === notice.kind), "email"));
    const where = and(eq(noticeDeliveries.organisationId, group.organisationId), eq(noticeDeliveries.channel, "email"), inArray(noticeDeliveries.noticeId, rows.map(({ notice }) => notice.id)));
    const owned = await claimLease(db, where, now);
    const send = async () => {
      if (!member || !VISIBLE_MEMBER_STATUSES.includes(member.status) || !enabled.length) return;
      const hasEvents = enabled.some((row) => row.gatheringKind === "event");
      const hasMeetups = enabled.some((row) => row.gatheringKind === "meetup");
      await deps.email.sendMessage({
        id: `digest:${group.organisationId}:${group.memberId}:${group.scheduledFor.toISOString()}`,
        to: member.email, subject: hasEvents ? hasMeetups ? "Daily Meetup and Event digest" : "Daily Event digest" : "Daily Meetup digest", text: enabled.map(({ notice }) => notice.message).join("\n\n"),
      });
    };
    return { where: owned, send };
  });
}

export async function sendDailyDigests(deps: Deps): Promise<void> {
  const now = deps.clock.now();
  const groups = await deps.db.selectDistinct({ organisationId: notices.organisationId, memberId: notices.memberId, scheduledFor: noticeDeliveries.scheduledFor })
    .from(noticeDeliveries).innerJoin(notices, digestNoticeJoin).where(duePredicate("digest", now)).orderBy(noticeDeliveries.scheduledFor).limit(BATCH);
  for (const group of groups) {
    const job = await claimDigest(deps, group);
    if (job) await runJob(deps, job);
  }
}
