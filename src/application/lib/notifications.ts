import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { NOTICE_KINDS, type NoticeKind } from "./notice-kinds";
import { gatherings, members, noticeDeliveries, noticePreferences, notices, telegramLinks } from "./schema";

export interface NoticePreference { kind: NoticeKind; telegram: boolean; email: boolean }

const URGENT_KINDS: NoticeKind[] = ["meetup-joined", "meetup-promoted", "meetup-cancelled"];

function nextDigest(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(9, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export interface NotificationSettings {
  telegramAvailable: boolean;
  telegramLinked: boolean;
  preferences: NoticePreference[];
}

export async function notificationSettings(deps: Deps, actor: Actor): Promise<NotificationSettings> {
  await requireActiveMember(deps.db, actor);
  const [link] = await deps.db.select().from(telegramLinks)
    .where(and(eq(telegramLinks.organisationId, actor.organisationId), eq(telegramLinks.memberId, actor.memberId)));
  const preferences = await deps.db.select({ kind: noticePreferences.kind, telegram: noticePreferences.telegram, email: noticePreferences.email })
    .from(noticePreferences).where(and(eq(noticePreferences.organisationId, actor.organisationId), eq(noticePreferences.memberId, actor.memberId)));
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
  input: Pick<typeof notices.$inferInsert, "gatheringId" | "kind" | "message" | "externalMessage">, now: Date): Promise<void> {
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
    if (preference?.email !== false) {
      const urgent = URGENT_KINDS.includes(notice.kind);
      const scheduledFor = urgent ? now : nextDigest(now);
      deliveries.push({ ...base, channel: "email", mode: urgent ? "immediate" : "digest", scheduledFor, availableAt: scheduledFor });
    }
    if (preference?.telegram !== false && links.some((link) => link.memberId === notice.memberId)) deliveries.push({ ...base, channel: "telegram" });
  }
  if (deliveries.length) await db.insert(noticeDeliveries).values(deliveries);
}

function deliveryWhere(delivery: typeof noticeDeliveries.$inferSelect) {
  return and(eq(noticeDeliveries.organisationId, delivery.organisationId), eq(noticeDeliveries.noticeId, delivery.noticeId), eq(noticeDeliveries.channel, delivery.channel));
}

export async function deliverNotices(deps: Deps, organisationId?: string): Promise<void> {
  const now = deps.clock.now();
  const due = and(isNull(noticeDeliveries.finishedAt), eq(noticeDeliveries.mode, "immediate"), lte(noticeDeliveries.availableAt, now));
  const pending = await deps.db.select().from(noticeDeliveries)
    .where(and(due, organisationId ? eq(noticeDeliveries.organisationId, organisationId) : undefined))
    .orderBy(noticeDeliveries.availableAt, noticeDeliveries.noticeId).limit(100);
  for (const candidate of pending) {
    await deps.db.transaction(async (db) => {
      const where = deliveryWhere(candidate);
      const [delivery] = await db.select().from(noticeDeliveries).where(and(where, due)).for("update", { skipLocked: true });
      if (!delivery) return;
      const [row] = await db.select({ notice: notices, member: members, meetup: gatherings }).from(notices)
        .innerJoin(members, and(eq(members.organisationId, notices.organisationId), eq(members.id, notices.memberId)))
        .innerJoin(gatherings, and(eq(gatherings.organisationId, notices.organisationId), eq(gatherings.id, notices.gatheringId)))
        .where(and(eq(notices.organisationId, delivery.organisationId), eq(notices.id, delivery.noticeId)));
      const [preference] = row ? await db.select().from(noticePreferences).where(and(
        eq(noticePreferences.organisationId, delivery.organisationId), eq(noticePreferences.memberId, row.member.id), eq(noticePreferences.kind, row.notice.kind),
      )) : [];
      try {
        if (row?.member.status === "active" && preference?.[delivery.channel] !== false) {
          if (delivery.channel === "email") {
            await deps.email.sendMessage({ id: row.notice.id, to: row.member.email, subject: "Meetup notice", text: row.notice.externalMessage });
          } else {
            const [link] = await db.select().from(telegramLinks)
              .where(and(eq(telegramLinks.organisationId, delivery.organisationId), eq(telegramLinks.memberId, row.member.id)));
            if (link) await deps.telegram.sendMessage({
              chatId: link.chatId, text: row.notice.externalMessage,
              ...(row.meetup.audienceKind === "open" && row.meetup.status === "scheduled" && row.meetup.startsAt > now ? { joinMeetupId: row.meetup.id } : {}),
            });
          }
        }
        await db.update(noticeDeliveries).set({ finishedAt: now }).where(where);
      } catch {
        await db.update(noticeDeliveries).set({ availableAt: new Date(now.getTime() + 60_000) }).where(where);
      }
    });
  }
}

export async function sendDailyDigests(deps: Deps): Promise<void> {
  const now = deps.clock.now();
  const due = and(isNull(noticeDeliveries.finishedAt), eq(noticeDeliveries.mode, "digest"), lte(noticeDeliveries.availableAt, now));
  const sameNotice = and(eq(notices.organisationId, noticeDeliveries.organisationId), eq(notices.id, noticeDeliveries.noticeId));
  const groups = await deps.db.selectDistinct({ organisationId: notices.organisationId, memberId: notices.memberId, scheduledFor: noticeDeliveries.scheduledFor })
    .from(noticeDeliveries).innerJoin(notices, sameNotice).where(due).orderBy(noticeDeliveries.scheduledFor).limit(100);
  for (const group of groups) {
    await deps.db.transaction(async (db) => {
      const [member] = await db.select().from(members)
        .where(and(eq(members.organisationId, group.organisationId), eq(members.id, group.memberId))).for("update");
      const rows = await db.select({ notice: notices }).from(noticeDeliveries).innerJoin(notices, sameNotice)
        .where(and(due, eq(notices.organisationId, group.organisationId), eq(notices.memberId, group.memberId), eq(noticeDeliveries.scheduledFor, group.scheduledFor)))
        .orderBy(notices.position);
      if (!rows.length) return;
      const preferences = await db.select().from(noticePreferences)
        .where(and(eq(noticePreferences.organisationId, group.organisationId), eq(noticePreferences.memberId, group.memberId)));
      const enabled = rows.filter(({ notice }) => preferences.find((preference) => preference.kind === notice.kind)?.email !== false);
      const where = and(eq(noticeDeliveries.organisationId, group.organisationId), eq(noticeDeliveries.channel, "email"), inArray(noticeDeliveries.noticeId, rows.map(({ notice }) => notice.id)));
      try {
        if (member?.status === "active" && enabled.length) {
          await deps.email.sendMessage({
            id: `digest:${group.organisationId}:${group.memberId}:${group.scheduledFor.toISOString()}`,
            to: member.email, subject: "Daily Meetup digest", text: enabled.map(({ notice }) => notice.externalMessage).join("\n\n"),
          });
        }
        await db.update(noticeDeliveries).set({ finishedAt: now }).where(where);
      } catch {
        await db.update(noticeDeliveries).set({ availableAt: new Date(now.getTime() + 60_000) }).where(where);
      }
    });
  }
}
