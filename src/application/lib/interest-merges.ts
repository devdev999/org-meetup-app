import { and, arrayOverlaps, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { aliasKey, type Interest } from "./interests";
import type { InterestMergeSnapshot } from "./interest-merge-snapshot";
import { gatheringInterests, interestAliases, interestMergeProposals, interests, memberInterests, recurrenceInterests } from "./schema";

export interface InterestMerge {
  id: string;
  survivingInterest: Interest;
  mergedInterests: Interest[];
  mergedAt: Date;
  splitAt: Date | null;
  canSplit: boolean;
}

function invalid(message: string): never {
  throw new InvalidInputError("invalid-interest", message);
}

function latestChange<T extends { interestId: string; revision: number }>(rows: T[], survivingInterestId: string): T {
  return [...rows].sort((a, b) => b.revision - a.revision
    || Number(b.interestId === survivingInterestId) - Number(a.interestId === survivingInterestId)
    || a.interestId.localeCompare(b.interestId))[0]!;
}

async function writeBatches<T>(rows: T[], write: (batch: T[]) => PromiseLike<unknown>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 1000) {
    await write(rows.slice(offset, offset + 1000));
  }
}

export async function approveInterestMerge(db: Queryable, organisationId: string, id: string, survivingInterestId: string, now: Date): Promise<void> {
  if (!isUuid(id) || !isUuid(survivingInterestId)) invalid("Choose a merge proposal and its surviving Interest.");
  const [proposal] = await db.select().from(interestMergeProposals).where(and(eq(interestMergeProposals.organisationId, organisationId), eq(interestMergeProposals.id, id)));
  if (!proposal || !proposal.interestIds.includes(survivingInterestId)) invalid("Choose a surviving Interest from this Organisation's proposal.");
  if (proposal.mergedAt) {
    if (proposal.splitAt || proposal.survivingInterestId !== survivingInterestId) invalid("This proposal has already been reviewed. Reload the queue.");
    return;
  }
  const current = await db.select({ id: interests.id, name: interests.name }).from(interests).where(and(eq(interests.organisationId, organisationId),
    inArray(interests.id, proposal.interestIds), isNull(interests.mergedIntoId)));
  if (current.length !== proposal.interestIds.length) invalid("An Interest in this proposal was already merged. Reload the queue.");
  await db.insert(interestAliases).values(current.map((interest) => ({ organisationId, interestId: interest.id,
    phrase: interest.name, phraseKey: aliasKey(interest.name), createdAt: now }))).onConflictDoNothing();
  const snapshot: InterestMergeSnapshot = {
    aliases: await db.select({ phraseKey: interestAliases.phraseKey, interestId: interestAliases.interestId }).from(interestAliases)
      .where(and(eq(interestAliases.organisationId, organisationId), inArray(interestAliases.interestId, proposal.interestIds))),
    declarations: await db.select({ memberId: memberInterests.memberId, interestId: memberInterests.interestId, stance: memberInterests.stance, revision: memberInterests.revision })
      .from(memberInterests).where(and(eq(memberInterests.organisationId, organisationId), inArray(memberInterests.interestId, proposal.interestIds))),
    gatherings: await db.select({ gatheringId: gatheringInterests.gatheringId, interestId: gatheringInterests.interestId, revision: gatheringInterests.revision })
      .from(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId), inArray(gatheringInterests.interestId, proposal.interestIds))),
    recurrences: await db.select({ recurrenceId: recurrenceInterests.recurrenceId, interestId: recurrenceInterests.interestId, revision: recurrenceInterests.revision })
      .from(recurrenceInterests).where(and(eq(recurrenceInterests.organisationId, organisationId), inArray(recurrenceInterests.interestId, proposal.interestIds))),
  };
  await db.delete(memberInterests).where(and(eq(memberInterests.organisationId, organisationId), inArray(memberInterests.interestId, proposal.interestIds)));
  const declarations = [...Map.groupBy(snapshot.declarations, (row) => row.memberId).values()].map((rows) => ({
    ...latestChange(rows, survivingInterestId), organisationId, interestId: survivingInterestId,
  }));
  await writeBatches(declarations, (batch) => db.insert(memberInterests).values(batch));
  await db.delete(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId), inArray(gatheringInterests.interestId, proposal.interestIds)));
  const attachments = [...Map.groupBy(snapshot.gatherings, (row) => row.gatheringId).values()].map((rows) => ({
    ...latestChange(rows, survivingInterestId), organisationId, interestId: survivingInterestId,
  }));
  await writeBatches(attachments, (batch) => db.insert(gatheringInterests).values(batch));
  await db.delete(recurrenceInterests).where(and(eq(recurrenceInterests.organisationId, organisationId), inArray(recurrenceInterests.interestId, proposal.interestIds)));
  const seriesAttachments = [...Map.groupBy(snapshot.recurrences, (row) => row.recurrenceId).values()].map((rows) => ({
    ...latestChange(rows, survivingInterestId), organisationId, interestId: survivingInterestId,
  }));
  await writeBatches(seriesAttachments, (batch) => db.insert(recurrenceInterests).values(batch));
  await db.update(interestAliases).set({ interestId: survivingInterestId })
    .where(and(eq(interestAliases.organisationId, organisationId), inArray(interestAliases.interestId, proposal.interestIds)));
  await db.update(interests).set({ mergedIntoId: survivingInterestId })
    .where(and(eq(interests.organisationId, organisationId), inArray(interests.id, proposal.interestIds.filter((interestId) => interestId !== survivingInterestId))));
  await db.update(interestMergeProposals).set({ survivingInterestId, snapshot, mergedAt: now, mergeOrder: sql`nextval('interest_change_order')` })
    .where(and(eq(interestMergeProposals.organisationId, organisationId), eq(interestMergeProposals.id, id)));
}

export async function readInterestMergeHistory(db: Queryable, organisationId: string): Promise<InterestMerge[]> {
  const rows = await db.select({ id: interestMergeProposals.id, interestIds: interestMergeProposals.interestIds,
    survivingInterestId: interestMergeProposals.survivingInterestId, mergeOrder: interestMergeProposals.mergeOrder,
    mergedAt: interestMergeProposals.mergedAt, splitAt: interestMergeProposals.splitAt,
  }).from(interestMergeProposals).where(and(eq(interestMergeProposals.organisationId, organisationId), isNotNull(interestMergeProposals.mergedAt)))
    .orderBy(interestMergeProposals.mergeOrder);
  const catalog = await db.select({ interestId: interests.id, name: interests.name, kind: interests.kind }).from(interests)
    .where(eq(interests.organisationId, organisationId)).orderBy(interests.name);
  return rows.map((row) => ({
    id: row.id, survivingInterest: catalog.find(({ interestId }) => interestId === row.survivingInterestId)!,
    mergedInterests: catalog.filter(({ interestId }) => interestId !== row.survivingInterestId && row.interestIds.includes(interestId)),
    mergedAt: row.mergedAt!, splitAt: row.splitAt,
    canSplit: !row.splitAt && !rows.some((later) => !later.splitAt && later.mergeOrder! > row.mergeOrder!
      && later.interestIds.some((interestId) => row.interestIds.includes(interestId))),
  }));
}

export async function retainProposalInterestHistory(db: Queryable, organisationId: string, gatheringId: string, recurrenceId: string): Promise<void> {
  const merges = await db.select({ id: interestMergeProposals.id, snapshot: interestMergeProposals.snapshot }).from(interestMergeProposals)
    .where(and(eq(interestMergeProposals.organisationId, organisationId), isNotNull(interestMergeProposals.mergedAt), isNull(interestMergeProposals.splitAt),
      sql`${interestMergeProposals.snapshot} @> ${JSON.stringify({ gatherings: [{ gatheringId }] })}::jsonb`));
  for (const merge of merges) {
    const snapshot = merge.snapshot!;
    const originals = snapshot.gatherings.filter((row) => row.gatheringId === gatheringId)
      .map(({ interestId, revision }) => ({ recurrenceId, interestId, revision }));
    await db.update(interestMergeProposals).set({ snapshot: { ...snapshot, recurrences: [...snapshot.recurrences, ...originals] } })
      .where(and(eq(interestMergeProposals.organisationId, organisationId), eq(interestMergeProposals.id, merge.id)));
  }
}

export async function splitInterestMerge(db: Queryable, organisationId: string, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) invalid("Choose a recorded Interest merge.");
  const [merge] = await db.select().from(interestMergeProposals).where(and(eq(interestMergeProposals.organisationId, organisationId), eq(interestMergeProposals.id, id)));
  if (!merge?.snapshot || !merge.survivingInterestId || merge.mergeOrder === null) invalid("Choose a recorded merge in your Organisation.");
  if (merge.splitAt) return;
  const [dependent] = await db.select({ id: interestMergeProposals.id }).from(interestMergeProposals).where(and(
    eq(interestMergeProposals.organisationId, organisationId), isNull(interestMergeProposals.splitAt),
    gt(interestMergeProposals.mergeOrder, merge.mergeOrder), arrayOverlaps(interestMergeProposals.interestIds, merge.interestIds),
  )).limit(1);
  if (dependent) invalid("Split the later merge that uses these Interests first.");
  const current = new Map((await db.select().from(memberInterests).where(and(eq(memberInterests.organisationId, organisationId),
    eq(memberInterests.interestId, merge.survivingInterestId)))).map((row) => [row.memberId, row]));
  const declarations = [...Map.groupBy(merge.snapshot.declarations, (row) => row.memberId)]
    .filter(([memberId, originals]) => current.get(memberId)?.revision === latestChange(originals, merge.survivingInterestId!).revision);
  await writeBatches(declarations, (batch) => db.delete(memberInterests).where(and(eq(memberInterests.organisationId, organisationId),
    inArray(memberInterests.memberId, batch.map(([memberId]) => memberId)), eq(memberInterests.interestId, merge.survivingInterestId!))));
  await writeBatches(declarations.flatMap(([, originals]) => originals.map((row) => ({ ...row, organisationId }))),
    (batch) => db.insert(memberInterests).values(batch));
  const attachments = new Map((await db.select().from(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId),
    eq(gatheringInterests.interestId, merge.survivingInterestId)))).map((row) => [row.gatheringId, row]));
  const gatherings = [...Map.groupBy(merge.snapshot.gatherings, (row) => row.gatheringId)]
    .filter(([gatheringId, originals]) => attachments.get(gatheringId)?.revision === latestChange(originals, merge.survivingInterestId!).revision);
  await writeBatches(gatherings, (batch) => db.delete(gatheringInterests).where(and(eq(gatheringInterests.organisationId, organisationId),
    inArray(gatheringInterests.gatheringId, batch.map(([gatheringId]) => gatheringId)), eq(gatheringInterests.interestId, merge.survivingInterestId!))));
  await writeBatches(gatherings.flatMap(([, originals]) => originals.map((row) => ({ ...row, organisationId }))),
    (batch) => db.insert(gatheringInterests).values(batch));
  const seriesAttachments = new Map((await db.select().from(recurrenceInterests).where(and(eq(recurrenceInterests.organisationId, organisationId),
    eq(recurrenceInterests.interestId, merge.survivingInterestId)))).map((row) => [row.recurrenceId, row]));
  const recurrences = [...Map.groupBy(merge.snapshot.recurrences, (row) => row.recurrenceId)]
    .filter(([recurrenceId, originals]) => seriesAttachments.get(recurrenceId)?.revision === latestChange(originals, merge.survivingInterestId!).revision);
  await writeBatches(recurrences, (batch) => db.delete(recurrenceInterests).where(and(eq(recurrenceInterests.organisationId, organisationId),
    inArray(recurrenceInterests.recurrenceId, batch.map(([recurrenceId]) => recurrenceId)), eq(recurrenceInterests.interestId, merge.survivingInterestId!))));
  await writeBatches(recurrences.flatMap(([, originals]) => originals.map((row) => ({ ...row, organisationId }))),
    (batch) => db.insert(recurrenceInterests).values(batch));
  for (const [interestId, aliases] of Map.groupBy(merge.snapshot.aliases, (row) => row.interestId)) {
    await writeBatches(aliases, (batch) => db.update(interestAliases).set({ interestId }).where(and(eq(interestAliases.organisationId, organisationId),
      inArray(interestAliases.phraseKey, batch.map(({ phraseKey }) => phraseKey)), eq(interestAliases.interestId, merge.survivingInterestId!))));
  }
  await db.update(interests).set({ mergedIntoId: null }).where(and(eq(interests.organisationId, organisationId), inArray(interests.id, merge.interestIds)));
  await db.update(interestMergeProposals).set({ splitAt: now }).where(and(eq(interestMergeProposals.organisationId, organisationId), eq(interestMergeProposals.id, id)));
}
