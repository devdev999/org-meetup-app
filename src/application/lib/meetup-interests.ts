import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { resolveInterests, saveCanonicalInterest, saveInterestChoice, type Interest, type InterestChoice, type InterestResolution } from "./interests";
import { activities, gatheringInterests, interests } from "./schema";

export interface ExtractMeetupInterestsInput { activityId: string; description: string }
export type ExtractEventInterestsInput = ExtractMeetupInterestsInput;

export async function extractMeetupInterests(deps: Deps, actor: Actor, input: ExtractMeetupInterestsInput, signal?: AbortSignal): Promise<InterestResolution[]> {
  await requireActiveMember(deps.db, actor);
  const parsed = z.object({ activityId: z.uuid(), description: z.string().trim().max(5000) }).safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-meetup", "Choose an Activity and a description of up to 5000 characters.");
  const [activity] = await deps.db.select({ name: activities.name }).from(activities)
    .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, parsed.data.activityId), eq(activities.retired, false)));
  if (!activity) throw new InvalidInputError("invalid-meetup", "Choose a current Activity in your Organisation.");
  if (signal?.aborted) return [];
  let result;
  try {
    result = z.array(z.object({ phrase: z.string().trim().min(1).max(120), kind: z.enum(["skill", "hobby"]) })).max(10)
      .parse(await deps.ai.extractInterests({ activity: activity.name, description: parsed.data.description }, signal));
  } catch {
    return [];
  }
  const resolved = await resolveInterests(deps, actor, result, signal);
  if (signal?.aborted) return [];
  const seen = new Set<string>();
  return resolved.filter(({ proposed }) => {
    const key = "interestId" in proposed ? proposed.interestId : proposed.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function relevantInterests(db: Queryable, organisationId: string, meetupId: string): Promise<Interest[]> {
  return (await relevantInterestsFor(db, organisationId, [meetupId])).map(({ meetupId: _, ...interest }) => interest);
}

export function relevantInterestsFor(db: Queryable, organisationId: string, meetupIds: string[]): Promise<(Interest & { meetupId: string })[]> {
  if (!meetupIds.length) return Promise.resolve([]);
  return db.select({ meetupId: gatheringInterests.gatheringId, interestId: interests.id, name: interests.name, kind: interests.kind }).from(gatheringInterests)
    .innerJoin(interests, and(eq(interests.organisationId, gatheringInterests.organisationId), eq(interests.id, gatheringInterests.interestId)))
    .where(and(eq(gatheringInterests.organisationId, organisationId), inArray(gatheringInterests.gatheringId, meetupIds)))
    .orderBy(gatheringInterests.gatheringId, interests.name, interests.id);
}

export async function saveRelevantInterests(db: Queryable, organisationId: string, meetupId: string, choices: InterestChoice[], now: Date): Promise<void> {
  const ids = new Set<string>();
  for (const choice of choices) ids.add("interestId" in choice.selection
    ? await saveCanonicalInterest(db, organisationId, choice.selection, now)
    : await saveInterestChoice(db, organisationId, choice, now));
  await db.delete(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId), eq(gatheringInterests.gatheringId, meetupId)));
  if (ids.size) await db.insert(gatheringInterests).values([...ids].map((interestId) => ({ organisationId, gatheringId: meetupId, interestId })));
}
