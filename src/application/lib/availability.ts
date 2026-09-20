import { and, eq, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { deliverSoon, recordNotices } from "./notifications";
import { activities, availabilities, availabilityNoticePairs, members, organisations, sites } from "./schema";

export interface PostAvailabilityInput {
  activityId: string;
  startsAt: Date;
  endsAt: Date;
  kind: "physical" | "virtual";
}

export interface Availability {
  id: string;
  member: { memberId: string; name: string };
  activity: { id: string; name: string };
  startsAt: Date;
  endsAt: Date;
  place: { kind: "physical"; siteId: string; siteName: string } | { kind: "virtual" };
}

export interface AvailabilitySuggestion extends Omit<Availability, "id"> {
  ownAvailabilityId: string;
  otherAvailabilityId: string;
}

export interface AvailabilityBoard {
  open: Availability[];
  suggestions: AvailabilitySuggestion[];
}

export const availabilityOverlapSchema = z.object({ ownAvailabilityId: z.uuid(), otherAvailabilityId: z.uuid() });
export type AvailabilityOverlap = z.infer<typeof availabilityOverlapSchema>;

function invalid(message: string): never {
  throw new InvalidInputError("invalid-availability", message);
}

export async function postAvailability(deps: Deps, actor: Actor, input: PostAvailabilityInput): Promise<Availability> {
  return withActiveMember(deps, actor, async (db) => {
    const parsed = z.object({ activityId: z.uuid(), startsAt: z.date(), endsAt: z.date(), kind: z.enum(["physical", "virtual"]) }).safeParse(input);
    if (!parsed.success) invalid("Choose an Activity, a Place setting and a valid window.");
    const data = parsed.data;
    const now = deps.clock.now();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0);
    if (data.startsAt.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)
      || data.startsAt >= data.endsAt || data.endsAt <= now || data.endsAt > endOfDay) {
      invalid("Choose a window today in UTC that has not ended.");
    }
    const [current] = await db.select().from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, actor.memberId))).for("update");
    const [activity] = await db.select({ id: activities.id, name: activities.name }).from(activities)
      .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, data.activityId), eq(activities.retired, false)));
    if (!activity) invalid("Choose a current Activity in your Organisation.");
    const [site] = data.kind === "physical" && current?.siteId ? await db.select({ id: sites.id, name: sites.name }).from(sites)
      .where(and(eq(sites.organisationId, actor.organisationId), eq(sites.id, current.siteId), eq(sites.retired, false))) : [];
    if (data.kind === "physical" && !site) invalid("Set a current Site in your profile before posting physical Availability.");
    const [existing] = await db.select({ id: availabilities.id }).from(availabilities).where(and(
      eq(availabilities.organisationId, actor.organisationId), eq(availabilities.memberId, actor.memberId),
      eq(availabilities.activityId, activity.id), eq(availabilities.startsAt, data.startsAt), eq(availabilities.endsAt, data.endsAt),
      site ? eq(availabilities.siteId, site.id) : isNull(availabilities.siteId), isNull(availabilities.expiredAt),
    ));
    const [saved] = existing ? [existing] : await db.insert(availabilities).values({
      ...actor, activityId: activity.id, siteId: site?.id ?? null,
      startsAt: data.startsAt, endsAt: data.endsAt, createdAt: now,
    }).returning({ id: availabilities.id });
    await recordOverlaps(db, actor.organisationId, now);
    return {
      id: saved!.id, member: { memberId: actor.memberId, name: current!.name }, activity,
      startsAt: data.startsAt, endsAt: data.endsAt,
      place: site ? { kind: "physical", siteId: site.id, siteName: site.name } : { kind: "virtual" },
    };
  });
}

async function openAvailabilities(db: Queryable, organisationId: string, now: Date, scope?: { ids?: string[]; siteId?: string | null }): Promise<Availability[]> {
  const rows = await db.select({ availability: availabilities, name: members.name, activityName: activities.name, siteName: sites.name })
    .from(availabilities)
    .innerJoin(members, and(eq(members.organisationId, availabilities.organisationId), eq(members.id, availabilities.memberId)))
    .innerJoin(activities, and(eq(activities.organisationId, availabilities.organisationId), eq(activities.id, availabilities.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, availabilities.organisationId), eq(sites.id, availabilities.siteId)))
    .where(and(
      eq(availabilities.organisationId, organisationId), isNull(availabilities.expiredAt),
      scope?.ids ? inArray(availabilities.id, scope.ids) : undefined,
      scope?.siteId !== undefined ? or(isNull(availabilities.siteId), scope.siteId ? eq(availabilities.siteId, scope.siteId) : undefined) : undefined,
      lte(availabilities.startsAt, now), gt(availabilities.endsAt, now), eq(members.status, "active"), eq(activities.retired, false),
      or(isNull(availabilities.siteId), and(eq(availabilities.siteId, members.siteId), eq(sites.retired, false))),
    )).orderBy(availabilities.endsAt, availabilities.id);
  return rows.map(({ availability: row, name, activityName, siteName }) => ({
    id: row.id, member: { memberId: row.memberId, name }, activity: { id: row.activityId, name: activityName },
    startsAt: row.startsAt, endsAt: row.endsAt,
    place: row.siteId ? { kind: "physical", siteId: row.siteId, siteName: siteName! } : { kind: "virtual" },
  }));
}

export async function availability(deps: Deps, actor: Actor): Promise<AvailabilityBoard> {
  const current = await requireActiveMember(deps.db, actor);
  const open = await openAvailabilities(deps.db, actor.organisationId, deps.clock.now(), { siteId: current.siteId });
  const own = open.filter((entry) => entry.member.memberId === actor.memberId);
  const suggestions = own.flatMap((entry) => open.flatMap((other) => {
    const suggestion = overlap(entry, other);
    return suggestion ? [suggestion] : [];
  }));
  return { open, suggestions };
}

function overlap(own: Availability, other: Availability): AvailabilitySuggestion | undefined {
  if (own.member.memberId === other.member.memberId || own.activity.id !== other.activity.id
    || own.place.kind !== other.place.kind
    || own.place.kind === "physical" && other.place.kind === "physical" && own.place.siteId !== other.place.siteId) return;
  const startsAt = new Date(Math.max(own.startsAt.getTime(), other.startsAt.getTime()));
  const endsAt = new Date(Math.min(own.endsAt.getTime(), other.endsAt.getTime()));
  if (startsAt >= endsAt) return;
  return {
    ownAvailabilityId: own.id, otherAvailabilityId: other.id, member: other.member,
    activity: own.activity, place: own.place, startsAt, endsAt,
  };
}

export async function findAvailabilityOverlap(db: Queryable, actor: Actor, input: AvailabilityOverlap, now: Date, lockMembers = false): Promise<AvailabilitySuggestion | undefined> {
  const parsed = availabilityOverlapSchema.safeParse(input);
  if (!parsed.success) return;
  const ids = [parsed.data.ownAvailabilityId, parsed.data.otherAvailabilityId];
  if (lockMembers) {
    await db.select({ id: members.id }).from(members).where(and(
      eq(members.organisationId, actor.organisationId),
      inArray(members.id, db.select({ id: availabilities.memberId }).from(availabilities)
        .where(and(eq(availabilities.organisationId, actor.organisationId), inArray(availabilities.id, ids)))),
    )).orderBy(members.id).for("update");
  }
  const entries = await openAvailabilities(db, actor.organisationId, now, { ids });
  const own = entries.find((entry) => entry.id === input.ownAvailabilityId && entry.member.memberId === actor.memberId);
  const other = entries.find((entry) => entry.id === input.otherAvailabilityId);
  return own && other ? overlap(own, other) : undefined;
}

export async function availabilityMeetup(deps: Deps, actor: Actor, input: AvailabilityOverlap): Promise<AvailabilitySuggestion | undefined> {
  await requireActiveMember(deps.db, actor);
  return findAvailabilityOverlap(deps.db, actor, input, deps.clock.now());
}

async function recordOverlaps(db: Queryable, organisationId: string, now: Date): Promise<void> {
  const open = await openAvailabilities(db, organisationId, now);
  const day = now.toISOString().slice(0, 10);
  const recorded = await db.select({ first: availabilityNoticePairs.firstMemberId, second: availabilityNoticePairs.secondMemberId })
    .from(availabilityNoticePairs).where(and(eq(availabilityNoticePairs.organisationId, organisationId), eq(availabilityNoticePairs.day, day)));
  const seen = new Set(recorded.map((pair) => `${pair.first}:${pair.second}`));
  const groups = Map.groupBy(open, (entry) => `${entry.activity.id}:${entry.place.kind === "physical" ? entry.place.siteId : "virtual"}`);
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      const first = group[i]!;
      for (const second of group.slice(i + 1)) {
        const suggestion = overlap(first, second);
        if (!suggestion) continue;
        const [firstMemberId, secondMemberId] = [first.member.memberId, second.member.memberId].sort();
        const key = `${firstMemberId}:${secondMemberId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [created] = await db.insert(availabilityNoticePairs).values({
          organisationId, firstMemberId: firstMemberId!, secondMemberId: secondMemberId!, day,
        }).onConflictDoNothing().returning();
        if (!created) continue;
        const window = `${suggestion.startsAt.toISOString().slice(0, 16).replace("T", " ")} to ${suggestion.endsAt.toISOString().slice(11, 16)} UTC`;
        const place = suggestion.place.kind === "physical" ? suggestion.place.siteName : "Online";
        for (const [recipient, other] of [[first.member, second.member], [second.member, first.member]]) {
          const message = `${other!.name.trim().split(/\s+/)[0]} is free for ${suggestion.activity.name}, ${window}, ${place}. Your Availability overlaps. Open Availability in the app to plan a Meetup.`;
          await recordNotices(db, organisationId, [recipient!.memberId], { kind: "availability-overlap", message, externalMessage: message }, now);
        }
      }
    }
  }
}

export async function processAvailability(deps: Deps): Promise<void> {
  const pending = await deps.db.selectDistinct({ organisationId: availabilities.organisationId }).from(availabilities).where(isNull(availabilities.expiredAt));
  for (const { organisationId } of pending) {
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
      const now = deps.clock.now();
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      await db.update(availabilities).set({ expiredAt: now }).where(and(
        eq(availabilities.organisationId, organisationId), isNull(availabilities.expiredAt),
        or(lte(availabilities.endsAt, now), lt(availabilities.startsAt, dayStart)),
      ));
      await recordOverlaps(db, organisationId, now);
    });
    await deliverSoon(deps, { organisationId, kind: "availability-overlap" });
  }
}
