import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { VISIBLE_MEMBER_STATUSES } from "./actor";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { extractionSettings } from "./deployment-settings";
import { InvalidInputError } from "./errors";
import type { Interest } from "./interests";
import { interestMergeProposals, interests, memberInterests, members, organisations } from "./schema";

interface CountedInterest extends Interest { count: number }
export interface InterestMergeProposal { id: string; interests: CountedInterest[] }

export function clusteringCatalog(db: Queryable, organisationId: string): Promise<CountedInterest[]> {
  return db.select({ interestId: interests.id, name: interests.name, kind: interests.kind, count: count(members.id) })
    .from(interests)
    .leftJoin(memberInterests, and(eq(memberInterests.organisationId, interests.organisationId), eq(memberInterests.interestId, interests.id)))
    .leftJoin(members, and(eq(members.organisationId, memberInterests.organisationId), eq(members.id, memberInterests.memberId), inArray(members.status, VISIBLE_MEMBER_STATUSES)))
    .where(and(eq(interests.organisationId, organisationId), isNull(interests.mergedIntoId))).groupBy(interests.id).orderBy(asc(interests.name));
}

export async function requestInterestClusters(deps: Deps, catalog: CountedInterest[]): Promise<CountedInterest[][]> {
  const settings = await extractionSettings(deps);
  let clusters: string[][];
  try {
    clusters = z.array(z.array(z.string().min(1).max(120)).min(2).max(100)).max(100).parse(await deps.ai.clusterInterests({
      interests: catalog.map(({ name, count }) => ({ name, count })),
    }, settings));
  } catch {
    throw new InvalidInputError("invalid-interest", "Interest clustering is unavailable. Try again later.");
  }
  const byName = new Map(catalog.map((interest) => [interest.name, interest]));
  return clusters.flatMap((names) => {
    const entries = [...new Set(names)].map((name) => byName.get(name));
    return entries.length >= 2 && entries.every((entry) => entry !== undefined) ? [entries] : [];
  });
}

export async function saveInterestClusters(db: Queryable, organisationId: string, clusters: CountedInterest[][], now: Date): Promise<void> {
  if (!clusters.length) return;
  const proposedIds = [...new Set(clusters.flat().map(({ interestId }) => interestId))];
  const current = new Map((await db.select({ id: interests.id, name: interests.name }).from(interests)
    .where(and(eq(interests.organisationId, organisationId), inArray(interests.id, proposedIds), isNull(interests.mergedIntoId))))
    .map((interest) => [interest.id, interest.name]));
  const proposals = clusters.filter((cluster) => cluster.every((interest) => current.get(interest.interestId) === interest.name)).map((cluster) => {
    const interestIds = cluster.map(({ interestId }) => interestId).sort();
    return { organisationId, interestIds, clusterKey: createHash("sha256").update(interestIds.join(",")).digest("hex"), createdAt: now };
  });
  if (proposals.length) await db.insert(interestMergeProposals).values(proposals).onConflictDoNothing();
}

export async function readInterestMergeProposals(db: Queryable, organisationId: string): Promise<InterestMergeProposal[]> {
  const catalog = await clusteringCatalog(db, organisationId);
  const proposals = await db.select().from(interestMergeProposals).where(and(eq(interestMergeProposals.organisationId, organisationId), isNull(interestMergeProposals.mergedAt)))
    .orderBy(interestMergeProposals.createdAt, interestMergeProposals.id);
  return proposals.flatMap((proposal) => {
    const entries = catalog.filter((interest) => proposal.interestIds.includes(interest.interestId));
    return entries.length === proposal.interestIds.length ? [{ id: proposal.id, interests: entries }] : [];
  });
}

export async function processInterestMerges(deps: Deps): Promise<void> {
  const rows = await deps.db.select({ id: organisations.id }).from(organisations).orderBy(organisations.id);
  for (const { id } of rows) {
    const catalog = await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, id)).for("update");
      return clusteringCatalog(db, id);
    });
    const clusters = await requestInterestClusters(deps, catalog);
    await deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, id)).for("update");
      await saveInterestClusters(db, id, clusters, deps.clock.now());
    });
  }
}
