import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { InterestKind } from "../ports";
import { requireActiveMember, VISIBLE_MEMBER_STATUSES, type Actor } from "./actor";
import type { Database } from "./db";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { interests, interestAliases, memberInterests, members } from "./schema";

export interface Interest {
  interestId: string;
  name: string;
  kind: InterestKind;
}

export type Stance = "shares" | "seeks";
export interface MemberInterest extends Interest { stance: Stance }
export type InterestSelection = { interestId: string } | { name: string; kind: InterestKind };
export interface InterestResolution {
  phrase: string;
  proposed: InterestSelection;
  shortlist: Interest[];
}
export interface ConfirmInterestInput {
  phrase: string;
  selection: InterestSelection;
  stance: Stance;
}

const phraseSchema = z.string().min(1).max(120).refine((value) => value.trim().length > 0);
const kindSchema = z.enum(["skill", "hobby"]);
const selectionSchema = z.union([
  z.object({ interestId: z.uuid() }),
  z.object({ name: z.string().trim().min(1).max(120), kind: kindSchema }),
]);
const confirmSchema = z.object({
  phrase: phraseSchema,
  selection: selectionSchema,
  stance: z.enum(["shares", "seeks"]),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidInputError("invalid-interest", "Enter an Interest of up to 120 characters and choose a kind and Stance.");
  return result.data;
}

const starterInterests: Array<{ name: string; kind: InterestKind }> = [
  { name: "SQL", kind: "skill" },
  { name: "Rust", kind: "skill" },
  { name: "Public speaking", kind: "skill" },
  { name: "Spreadsheets", kind: "skill" },
  { name: "Board games", kind: "hobby" },
  { name: "Bouldering", kind: "hobby" },
  { name: "Running", kind: "hobby" },
];

export async function seedInterests(db: Pick<Database, "insert">, organisationId: string, now: Date) {
  await db.insert(interests).values(starterInterests.map((interest) => ({
    ...interest, organisationId, nameKey: interest.name.toLowerCase(), createdAt: now,
  }))).onConflictDoNothing();
}

export function listInterests({ db }: Deps, actor: Actor): Promise<Interest[]> {
  return db.select({ interestId: interests.id, name: interests.name, kind: interests.kind })
    .from(interests).where(eq(interests.organisationId, actor.organisationId)).orderBy(asc(interests.kind), asc(interests.name));
}

export function memberInterestList({ db }: Deps, actor: Actor, memberId = actor.memberId): Promise<MemberInterest[]> {
  return db.select({ interestId: interests.id, name: interests.name, kind: interests.kind, stance: memberInterests.stance })
    .from(memberInterests)
    .innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
    .where(and(eq(memberInterests.organisationId, actor.organisationId), eq(memberInterests.memberId, memberId)))
    .orderBy(asc(interests.kind), asc(interests.name));
}

export async function resolveInterest(deps: Deps, actor: Actor, input: { phrase: string; kind: InterestKind }): Promise<InterestResolution> {
  const { phrase, kind } = parse(z.object({ phrase: phraseSchema, kind: kindSchema }), input);
  const catalog = await listInterests(deps, actor);
  const aliases = await deps.db.select({ interestId: interestAliases.interestId, phrase: interestAliases.phrase })
    .from(interestAliases).where(eq(interestAliases.organisationId, actor.organisationId));
  const ranked = catalog.map((interest) => ({
    interest,
    score: Math.max(similarity(phrase, interest.name), ...aliases.filter((alias) => alias.interestId === interest.interestId).map((alias) => similarity(phrase, alias.phrase))),
  })).filter(({ score }) => score > 0.2).sort((a, b) => b.score - a.score || a.interest.name.localeCompare(b.interest.name));
  const shortlist = ranked.slice(0, 5).map(({ interest }) => interest);
  const closest = ranked[0];
  let proposed: InterestSelection = closest && closest.score >= 0.6 ? { interestId: closest.interest.interestId } : { name: phrase.trim(), kind };
  const counts = await deps.db.select({ interestId: memberInterests.interestId, count: count() }).from(memberInterests)
    .innerJoin(members, and(eq(members.organisationId, memberInterests.organisationId), eq(members.id, memberInterests.memberId)))
    .where(and(eq(memberInterests.organisationId, actor.organisationId), inArray(members.status, VISIBLE_MEMBER_STATUSES)))
    .groupBy(memberInterests.interestId);
  try {
    const result = await deps.ai.resolveInterest({ phrase, shortlist: shortlist.map(({ interestId, name, kind }) => ({ name, kind, count: counts.find((entry) => entry.interestId === interestId)?.count ?? 0 })) });
    if ("existingName" in result) {
      const existing = shortlist.find((interest) => interest.name.toLowerCase() === result.existingName.toLowerCase());
      if (existing) proposed = { interestId: existing.interestId };
    } else {
      const valid = selectionSchema.safeParse(result);
      if (valid.success) proposed = valid.data;
    }
  } catch {
    return { phrase, proposed, shortlist };
  }
  return { phrase, proposed, shortlist };
}

function similarity(left: string, right: string): number {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      current[j + 1] = Math.min(current[j]! + 1, previous[j + 1]! + 1, previous[j]! + (a[i] === b[j] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}

export async function confirmInterest(deps: Deps, actor: Actor, input: ConfirmInterestInput): Promise<MemberInterest[]> {
  const { phrase, selection, stance } = parse(confirmSchema, input);
  await deps.db.transaction(async (tx) => {
    await requireActiveMember(tx, actor);
    let interestId: string;
    if ("interestId" in selection) {
      const [existing] = await tx.select({ id: interests.id }).from(interests)
        .where(and(eq(interests.organisationId, actor.organisationId), eq(interests.id, selection.interestId)));
      if (!existing) throw new InvalidInputError("unknown-interest", "Choose an Interest from your Organisation.");
      interestId = existing.id;
    } else {
      const [interest] = await tx.insert(interests).values({
        organisationId: actor.organisationId, name: selection.name, nameKey: selection.name.toLowerCase(), kind: selection.kind, createdAt: deps.clock.now(),
      }).onConflictDoUpdate({ target: [interests.organisationId, interests.nameKey], set: { nameKey: selection.name.toLowerCase() } }).returning({ id: interests.id });
      interestId = interest!.id;
    }
    await tx.insert(interestAliases).values({ organisationId: actor.organisationId, interestId, phrase, createdAt: deps.clock.now() }).onConflictDoNothing();
    await tx.insert(memberInterests).values({ organisationId: actor.organisationId, memberId: actor.memberId, interestId, stance })
      .onConflictDoUpdate({ target: [memberInterests.organisationId, memberInterests.memberId, memberInterests.interestId], set: { stance } });
  });
  return memberInterestList(deps, actor);
}

export async function setInterestStance(deps: Deps, actor: Actor, input: { interestId: string; stance: Stance }): Promise<MemberInterest[]> {
  const selection = parse(z.object({ interestId: z.uuid(), stance: z.enum(["shares", "seeks"]) }), input);
  const updated = await deps.db.update(memberInterests).set({ stance: selection.stance })
    .where(and(eq(memberInterests.organisationId, actor.organisationId), eq(memberInterests.memberId, actor.memberId), eq(memberInterests.interestId, selection.interestId)))
    .returning({ interestId: memberInterests.interestId });
  if (!updated.length) throw new InvalidInputError("unknown-interest", "Declare this Interest before changing its Stance.");
  return memberInterestList(deps, actor);
}
