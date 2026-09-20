import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireActiveMember, type Actor } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { InvalidInputError } from "./errors";
import { resolveInterest, saveCanonicalInterest, saveInterestChoice, type Interest, type InterestChoice, type InterestResolution } from "./interests";
import { activities, gatheringInterests, interests } from "./schema";

export interface ExtractMeetupInterestsInput { activityId: string; description: string }

export async function extractMeetupInterests(deps: Deps, actor: Actor, input: ExtractMeetupInterestsInput): Promise<InterestResolution[]> {
  await requireActiveMember(deps.db, actor);
  const parsed = z.object({ activityId: z.uuid(), description: z.string().trim().max(5000) }).safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-meetup", "Choose an Activity and a description of up to 5000 characters.");
  const [activity] = await deps.db.select({ name: activities.name }).from(activities)
    .where(and(eq(activities.organisationId, actor.organisationId), eq(activities.id, parsed.data.activityId), eq(activities.retired, false)));
  if (!activity) throw new InvalidInputError("invalid-meetup", "Choose a current Activity in your Organisation.");
  try {
    const result = z.array(z.object({ phrase: z.string().trim().min(1).max(120), kind: z.enum(["skill", "hobby"]) })).max(10)
      .parse(await deps.ai.extractInterests({ activity: activity.name, description: parsed.data.description }));
    const resolved = await Promise.all(result.map((proposal) => resolveInterest(deps, actor, proposal)));
    const seen = new Set<string>();
    return resolved.filter(({ proposed }) => {
      const key = "interestId" in proposed ? proposed.interestId : proposed.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

export async function relevantInterests(db: Queryable, organisationId: string, meetupId: string): Promise<Interest[]> {
  return db.select({ interestId: interests.id, name: interests.name, kind: interests.kind }).from(gatheringInterests)
    .innerJoin(interests, and(eq(interests.organisationId, gatheringInterests.organisationId), eq(interests.id, gatheringInterests.interestId)))
    .where(and(eq(gatheringInterests.organisationId, organisationId), eq(gatheringInterests.gatheringId, meetupId)))
    .orderBy(interests.name, interests.id);
}

export async function saveRelevantInterests(db: Queryable, organisationId: string, meetupId: string, choices: InterestChoice[], now: Date): Promise<void> {
  const ids = new Set<string>();
  for (const choice of choices) ids.add("interestId" in choice.selection
    ? await saveCanonicalInterest(db, organisationId, choice.selection, now)
    : await saveInterestChoice(db, organisationId, choice, now));
  await db.delete(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId), eq(gatheringInterests.gatheringId, meetupId)));
  if (ids.size) await db.insert(gatheringInterests).values([...ids].map((interestId) => ({ organisationId, gatheringId: meetupId, interestId })));
}
