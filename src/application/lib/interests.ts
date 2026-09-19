import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
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

const SHORTLIST_SIZE = 5;
const MIN_SHORTLIST_SCORE = 0.2;
const FALLBACK_PROPOSAL_SCORE = 0.6;
const SUBSTRING_SIMILARITY = 0.8;
const ALIAS_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

function aliasKey(phrase: string) {
  return sql`lower(btrim(${phrase}, ${ALIAS_WHITESPACE}))`;
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

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidInputError("invalid-interest", message);
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
  const { phrase, kind } = parse(z.object({ phrase: phraseSchema, kind: kindSchema }), input,
    "Enter an Interest of up to 120 characters and choose Skill or Hobby.");
  const catalog = await listInterests(deps, actor);
  const aliases = await deps.db.select({
    interestId: interestAliases.interestId, phrase: interestAliases.phrase,
    matchesPhrase: eq(interestAliases.phraseKey, aliasKey(phrase)),
  })
    .from(interestAliases).where(eq(interestAliases.organisationId, actor.organisationId));
  const knownAlias = aliases.find((alias) => alias.matchesPhrase);
  const ranked = catalog.map((interest) => ({
    interest,
    score: Math.max(similarity(phrase, interest.name), ...aliases.filter((alias) => alias.interestId === interest.interestId).map((alias) => similarity(phrase, alias.phrase))),
  })).filter(({ score }) => score > MIN_SHORTLIST_SCORE).sort((a, b) => b.score - a.score || a.interest.name.localeCompare(b.interest.name));
  const shortlist = ranked.slice(0, SHORTLIST_SIZE).map(({ interest }) => interest);
  const closest = ranked[0];
  let proposed: InterestSelection = closest && closest.score >= FALLBACK_PROPOSAL_SCORE ? { interestId: closest.interest.interestId } : { name: phrase.trim(), kind };
  const counts = await deps.db.select({ interestId: memberInterests.interestId, count: count() }).from(memberInterests)
    .innerJoin(members, and(eq(members.organisationId, memberInterests.organisationId), eq(members.id, memberInterests.memberId)))
    .where(and(eq(memberInterests.organisationId, actor.organisationId), inArray(members.status, VISIBLE_MEMBER_STATUSES)))
    .groupBy(memberInterests.interestId);
  const result = await deps.ai.resolveInterest({
    phrase,
    shortlist: shortlist.map(({ interestId, name, kind }) => ({ name, kind, count: counts.find((entry) => entry.interestId === interestId)?.count ?? 0 })),
  }).catch(() => undefined);
  if (result && "existingName" in result) {
    const existing = shortlist.find((interest) => interest.name.toLowerCase() === result.existingName.toLowerCase());
    if (existing) proposed = { interestId: existing.interestId };
  } else if (result) {
    const valid = selectionSchema.safeParse(result);
    if (valid.success) proposed = valid.data;
  }
  if (knownAlias) proposed = { interestId: knownAlias.interestId };
  const selection = proposed;
  const existing = "name" in selection
    ? catalog.find((interest) => interest.name.toLowerCase() === selection.name.trim().toLowerCase())
    : catalog.find((interest) => interest.interestId === selection.interestId);
  if (existing) {
    proposed = { interestId: existing.interestId };
    if (!shortlist.some((interest) => interest.interestId === existing.interestId)) shortlist.unshift(existing);
  }
  return { phrase, proposed, shortlist };
}

function similarity(left: string, right: string): number {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return SUBSTRING_SIMILARITY;
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
  const { phrase, selection, stance } = parse(confirmSchema, input,
    "Enter an Interest of up to 120 characters, choose its listing, and choose Shares or Seeks.");
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
      }).onConflictDoUpdate({ target: [interests.organisationId, interests.nameKey], set: { nameKey: selection.name.toLowerCase() } })
        .returning({ id: interests.id, name: interests.name, kind: interests.kind });
      if (interest!.name !== selection.name || interest!.kind !== selection.kind) {
        throw new InvalidInputError("interest-name-conflict", "An Interest with this name already exists with a different spelling or kind. Preview again and confirm the existing Interest, or use another name.");
      }
      interestId = interest!.id;
    }
    const [alias] = await tx.insert(interestAliases).values({
      organisationId: actor.organisationId, interestId, phrase, phraseKey: aliasKey(phrase), createdAt: deps.clock.now(),
    }).onConflictDoUpdate({
      target: [interestAliases.organisationId, interestAliases.phraseKey],
      set: { phrase },
      setWhere: eq(interestAliases.interestId, interestId),
    }).returning({ interestId: interestAliases.interestId });
    if (!alias) {
      throw new InvalidInputError("alias-conflict", "This phrase already refers to another Interest. Confirm that Interest or use a different phrase.");
    }
    await tx.insert(memberInterests).values({ organisationId: actor.organisationId, memberId: actor.memberId, interestId, stance })
      .onConflictDoUpdate({ target: [memberInterests.organisationId, memberInterests.memberId, memberInterests.interestId], set: { stance } });
  });
  return memberInterestList(deps, actor);
}

export async function setInterestStance(deps: Deps, actor: Actor, input: { interestId: string; stance: Stance }): Promise<MemberInterest[]> {
  const selection = parse(z.object({ interestId: z.uuid(), stance: z.enum(["shares", "seeks"]) }), input,
    "Choose a declared Interest and select Shares or Seeks.");
  const updated = await deps.db.update(memberInterests).set({ stance: selection.stance })
    .where(and(eq(memberInterests.organisationId, actor.organisationId), eq(memberInterests.memberId, actor.memberId), eq(memberInterests.interestId, selection.interestId)))
    .returning({ interestId: memberInterests.interestId });
  if (!updated.length) throw new InvalidInputError("unknown-interest", "Declare this Interest before changing its Stance.");
  return memberInterestList(deps, actor);
}
