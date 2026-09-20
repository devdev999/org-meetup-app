import { and, eq, gt, inArray } from "drizzle-orm";
import { expireIneligibleAvailabilities } from "./availability-records";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { VISIBLE_MEMBER_STATUSES, withActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError, InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { removeFromFutureOccurrences } from "./member-lifecycle";
import { cancelOccurrence, meetupOrEvent, readGathering, visibleGatherings, type GatheringKind, type GatheringSummary, type MeetupPerson } from "./meetups";
import { activities, flags, gatherings, members } from "./schema";

export interface FlagInput {
  target: { kind: "member" | "meetup" | "event"; id: string };
  reason: string;
}

export interface Flag {
  id: string;
  target: { id: string; label: string } & (
    { kind: "member"; email: string } | { kind: "meetup" | "event"; startsAt: Date; host: MeetupPerson }
  );
  reporter: MeetupPerson;
  reason: string;
  state: "open" | "resolved";
  createdAt: Date;
  resolution: { note: string; resolvedAt: Date; resolvedByMemberId: string } | null;
}

export type ModerationOccurrence = Pick<GatheringSummary, "id" | "kind" | "activity" | "host" | "startsAt">;

export function upcomingOccurrences(db: Queryable, organisationId: string, now: Date): Promise<ModerationOccurrence[]> {
  return db.select({ id: gatherings.id, kind: gatherings.kind, startsAt: gatherings.startsAt,
    activity: { id: activities.id, name: activities.name }, host: { memberId: members.id, name: members.name } }).from(gatherings)
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .innerJoin(members, and(eq(members.organisationId, gatherings.organisationId), eq(members.id, gatherings.hostMemberId)))
    .where(and(eq(gatherings.organisationId, organisationId), eq(gatherings.status, "scheduled"), gt(gatherings.startsAt, now)))
    .orderBy(gatherings.startsAt, gatherings.id);
}

const flagInput = z.object({
  target: z.object({ kind: z.enum(["member", "meetup", "event"]), id: z.uuid() }),
  reason: z.string().trim().min(1).max(2000),
});

export async function flag(deps: Deps, actor: Actor, input: FlagInput): Promise<void> {
  const parsed = flagInput.safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-flag", "Choose a target and give a reason of up to 2000 characters.");
  await withActiveMember(deps, actor, async (db, current) => {
    const input = parsed.data;
    const [target] = input.target.kind === "member" ? await db.select({ id: members.id }).from(members)
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, input.target.id), inArray(members.status, VISIBLE_MEMBER_STATUSES)))
      : await db.select({ id: gatherings.id }).from(gatherings)
        .where(and(visibleGatherings(actor, current.siteId, input.target.kind), eq(gatherings.id, input.target.id)));
    if (!target) throw new AccessDeniedError();
    await db.insert(flags).values({ organisationId: actor.organisationId, reporterMemberId: actor.memberId,
      targetKind: input.target.kind, targetMemberId: input.target.kind === "member" ? target.id : null,
      gatheringId: input.target.kind === "member" ? null : target.id, reason: input.reason, createdAt: deps.clock.now() });
  });
}

export async function readFlags(db: Queryable, organisationId: string, state: Flag["state"]): Promise<Flag[]> {
  if (state !== "open" && state !== "resolved") throw new InvalidInputError("invalid-flag", "Choose open or resolved Flags.");
  const reporter = alias(members, "reporter");
  const target = alias(members, "target");
  const host = alias(members, "occurrence_host");
  const rows = await db.select({ flag: flags, reporterName: reporter.name, targetName: target.name, targetEmail: target.email,
    activityName: activities.name, startsAt: gatherings.startsAt, hostId: gatherings.hostMemberId, hostName: host.name }).from(flags)
    .innerJoin(reporter, and(eq(reporter.organisationId, flags.organisationId), eq(reporter.id, flags.reporterMemberId)))
    .leftJoin(target, and(eq(target.organisationId, flags.organisationId), eq(target.id, flags.targetMemberId)))
    .leftJoin(gatherings, and(eq(gatherings.organisationId, flags.organisationId), eq(gatherings.id, flags.gatheringId)))
    .leftJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(host, and(eq(host.organisationId, gatherings.organisationId), eq(host.id, gatherings.hostMemberId)))
    .where(and(eq(flags.organisationId, organisationId), eq(flags.state, state)))
    .orderBy(flags.createdAt, flags.id);
  return rows.map(({ flag, reporterName, targetName, targetEmail, activityName, startsAt, hostId, hostName }) => ({
    id: flag.id, target: flag.targetKind === "member"
      ? { kind: "member", id: flag.targetMemberId!, label: targetName!, email: targetEmail! }
      : { kind: flag.targetKind, id: flag.gatheringId!, label: activityName!, startsAt: startsAt!, host: { memberId: hostId!, name: hostName! } },
    reporter: { memberId: flag.reporterMemberId, name: reporterName }, reason: flag.reason, state: flag.state, createdAt: flag.createdAt,
    resolution: flag.resolvedAt ? { note: flag.resolutionNote!, resolvedAt: flag.resolvedAt, resolvedByMemberId: flag.resolvedByMemberId! } : null,
  }));
}

export async function resolveFlag(db: Queryable, actor: Actor, id: string, note: string, now: Date): Promise<void> {
  if (!isUuid(id)) throw new AccessDeniedError();
  const parsed = z.string().trim().min(1).max(2000).safeParse(note);
  if (!parsed.success) throw new InvalidInputError("invalid-flag", "Give a resolution note of up to 2000 characters.");
  const [entry] = await db.select().from(flags).where(and(eq(flags.organisationId, actor.organisationId), eq(flags.id, id)));
  if (!entry) throw new AccessDeniedError();
  if (entry.state === "resolved" && entry.resolutionNote === parsed.data) return;
  if (entry.state !== "open") throw new InvalidInputError("invalid-flag", "This Flag has already been resolved.");
  await db.update(flags).set({ state: "resolved", resolutionNote: parsed.data, resolvedAt: now, resolvedByMemberId: actor.memberId })
    .where(and(eq(flags.organisationId, actor.organisationId), eq(flags.id, id)));
}

export async function cancelManagedOccurrence(db: Queryable, actor: Actor, id: string, kind: GatheringKind, now: Date): Promise<void> {
  if (!isUuid(id)) throw new AccessDeniedError();
  const [row] = await db.select().from(gatherings)
    .where(and(eq(gatherings.organisationId, actor.organisationId), eq(gatherings.id, id), eq(gatherings.kind, kind), inArray(gatherings.status, ["scheduled", "cancelled", "completed"])));
  if (!row) throw new AccessDeniedError();
  if (row.status === "cancelled") return;
  if (row.status !== "scheduled" || row.startsAt <= now) throw new InvalidInputError(kind === "event" ? "invalid-event" : "invalid-meetup", "Only an upcoming occurrence can be cancelled.");
  const occurrence = (await readGathering(db, { ...actor, memberId: row.hostMemberId }, id, null, now))!;
  await cancelOccurrence(db, actor.organisationId, occurrence, now, `The Organisation Admin cancelled this ${meetupOrEvent(row)}.`);
}

export async function changeMemberAccess(db: Queryable, actor: Actor, id: string, action: "suspend" | "reinstate", now: Date): Promise<string[]> {
  if (!isUuid(id)) throw new AccessDeniedError();
  const [member] = await db.select().from(members).where(and(eq(members.organisationId, actor.organisationId), eq(members.id, id)));
  if (!member) throw new AccessDeniedError();
  if (member.status === "departed") throw new InvalidInputError("invalid-moderation", "Restore a Departed Member through the roster.");
  if (action === "suspend") {
    if (member.status === "suspended") return [];
    await db.update(members).set({ status: "suspended", statusBeforeSuspension: member.status, updatedAt: now })
      .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, id)));
    await expireIneligibleAvailabilities(db, actor.organisationId, now);
    return removeFromFutureOccurrences(db, actor.organisationId, [id], now);
  }
  if (member.status !== "suspended") return [];
  await db.update(members).set({ status: member.statusBeforeSuspension ?? "provisioned", statusBeforeSuspension: null, updatedAt: now })
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, id)));
  return [];
}
