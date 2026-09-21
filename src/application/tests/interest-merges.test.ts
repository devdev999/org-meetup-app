import { expect, test } from "vitest";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import type { MemberActions, OrganisationAdminActions, Stance } from "../index";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();

test("Interest administration preserves the Member's first declaration date and last activity", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const a = await declare(member, "SQL", "shares");
  const b = await declare(member, "Structured query language", "seeks");
  const memberId = (await member.profile()).memberId;
  const admin = await h.organisationAdmin();
  h.clock.set(new Date("2026-09-20T10:00:00Z"));
  const pending = await proposal(admin, [a.name, b.name]);
  await admin.approveInterestMerge(pending.id, a.interestId);
  await admin.updateInterest(a.interestId, { name: "Query puzzles", kind: "hobby" });
  await admin.splitInterestMerge(pending.id);
  const period = { from: "2026-09-01", to: "2026-09-30" };
  const profile = (await admin.memberReport(memberId, period)).tables.find(({ id }) => id === "member-profile")!;
  expect(profile.rows[0]![profile.columns.indexOf("First Interest declared")]).toBe("2026-09-18T09:00:00.000Z");
  expect(profile.rows[0]![profile.columns.indexOf("Last activity")]).toBe("2026-09-18T09:00:00.000Z");
  await member.removeInterest(a.interestId);
  await member.removeInterest(b.interestId);
  expect(await member.myInterests()).toEqual([]);
  const later = (await admin.memberReport(memberId, period)).tables.find(({ id }) => id === "member-profile")!;
  expect(later.rows[0]![later.columns.indexOf("First Interest declared")]).toBe("2026-09-18T09:00:00.000Z");
  expect(later.rows[0]![later.columns.indexOf("Last activity")]).toBe("2026-09-20T10:00:00.000Z");
});

test("an Event approved while its Interests are merged retains untouched attachments for a split", async () => {
  await h.setupOrganisation(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const a = await declare(host, "SQL", "shares");
  const b = await declare(host, "Structured query language", "seeks");
  const event = await host.proposeEvent({ activityId: (await host.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-25T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/proposal" },
    relevantInterests: [{ phrase: b.name, selection: { interestId: b.interestId } }],
  });
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [a.name, b.name]);
  await admin.approveInterestMerge(pending.id, a.interestId);
  expect((await host.eventProposals())[0]?.details?.relevantInterests.map(({ name }) => name)).toEqual(["SQL"]);
  await admin.approveEvent(event.id);
  await admin.splitInterestMerge(pending.id);
  expect((await host.viewEvent(event.id))?.relevantInterests.map(({ name }) => name)).toEqual([b.name]);
});

test.each([false, true])("a recurring Event approved during a merge restores its proposal's Interests after splitting, with a dependent merge: %s", async (dependent) => {
  await h.setupOrganisation(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(host, "SQL", "shares");
  const original = await declare(host, "Structured query language", "seeks");
  const event = await host.proposeEvent({ activityId: (await host.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 30,
    place: { kind: "virtual", url: "https://meet.example/proposal" }, recurrence: { frequency: "weekly" },
    relevantInterests: [{ phrase: original.name, selection: { interestId: original.interestId } }],
  });
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, original.name]);
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  const later = dependent ? await proposal(admin, [survivor.name, "Spreadsheets"]) : undefined;
  if (later) await admin.approveInterestMerge(later.id, later.interests.find(({ name }) => name === "Spreadsheets")!.interestId);
  await admin.approveEvent(event.id);
  if (later) await admin.splitInterestMerge(later.id);
  await admin.splitInterestMerge(pending.id);
  await h.app.processRecurrences();

  const generated = (await host.listEvents()).find(({ id }) => id !== event.id)!;
  expect((await host.viewEvent(generated.id))?.relevantInterests.map(({ name }) => name)).toEqual(["Structured query language"]);
});

test("a merged canonical name resolves to the survivor even when no Member had used it as an Alias", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, ["SQL", "Spreadsheets"]);
  const survivor = pending.interests.find(({ name }) => name === "Spreadsheets")!;
  const removed = pending.interests.find(({ name }) => name === "SQL")!;
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  expect((await member.resolveInterest({ phrase: "SQL", kind: "skill" })).proposed).toEqual({ interestId: survivor.interestId });
  await admin.splitInterestMerge(pending.id);
  expect((await member.resolveInterest({ phrase: "SQL", kind: "skill" })).proposed).toEqual({ interestId: removed.interestId });
});

test("clustering releases the Organisation lock and discards stale or foreign-name clusters as a whole", async () => {
  await h.setupOrganisation(ministryA);
  const admin = await h.organisationAdmin();
  const sql = (await admin.interests()).find(({ name }) => name === "SQL")!;
  const entered = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<string[][]>();
  const original = h.ai.clusterInterests;
  h.ai.clusterInterests = async () => { entered.resolve(); return reply.promise; };
  try {
    const pending = admin.proposeInterestMerges();
    await entered.promise;
    await admin.updateInterest(sql.interestId, { name: "Database queries", kind: "skill" });
    reply.resolve([["SQL", "Rust"], ["Rust", "Running", "Outside this Organisation"], ["Board games", "Bouldering"]]);
    await pending;
    expect((await admin.interestMergeProposals()).map(({ interests }) => interests.map(({ name }) => name))).toEqual([["Board games", "Bouldering"]]);
  } finally {
    reply.resolve([]);
    h.ai.clusterInterests = original;
  }
});

test("an Organisation Admin who loses access during clustering cannot save proposals or use a retained actor", async () => {
  const person = { sub: "olivia", name: "Olivia", email: "olivia@example.test" };
  await h.setupOrganisation({ ...ministryA, organisationAdmin: person });
  const member = await signInAndAcknowledgeAs(h, "ministry-a", person);
  const memberId = (await member.profile()).memberId;
  const admin = await member.organisationAdmin();
  const entered = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<string[][]>();
  const original = h.ai.clusterInterests;
  h.ai.clusterInterests = async () => { entered.resolve(); return reply.promise; };
  try {
    const pending = admin.proposeInterestMerges().catch((error: unknown) => error);
    await entered.promise;
    await admin.suspendMember(memberId);
    reply.resolve([["SQL", "Rust"]]);
    expect(await pending).toMatchObject({ name: "AccessDeniedError" });
    await expect(admin.interestMergeProposals()).rejects.toMatchObject({ name: "AccessDeniedError" });
    await expect(admin.proposeInterestMerges()).rejects.toMatchObject({ name: "AccessDeniedError" });
  } finally {
    reply.resolve([]);
    h.ai.clusterInterests = original;
  }
});

test("Interest administration rejects other Organisations, ordinary Members and Platform Admins without the Organisation Admin role", async () => {
  await h.setupOrganisation(ministryA);
  await h.setupOrganisation(ministryB);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const platform = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  await expect(member.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platform.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  const admin = await h.organisationAdmin();
  const other = await h.organisationAdmin("ministry-b");
  const pending = await proposal(admin, ["SQL", "Rust"]);
  const survivor = pending.interests[0]!;
  await expect(other.approveInterestMerge(pending.id, survivor.interestId)).rejects.toMatchObject({ code: "invalid-interest" });
  await expect(other.updateInterest(survivor.interestId, { name: "Foreign rename", kind: "hobby" })).rejects.toMatchObject({ code: "unknown-interest" });
  await expect(admin.updateInterest(survivor.interestId, { name: "Board games", kind: "hobby" })).rejects.toMatchObject({ code: "interest-name-conflict" });
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  await expect(other.splitInterestMerge(pending.id)).rejects.toMatchObject({ code: "invalid-interest" });
  expect(await other.interestMergeHistory()).toEqual([]);
  const hidden = pending.interests.find(({ interestId }) => interestId !== survivor.interestId)!;
  await expect(member.confirmInterest({ phrase: hidden.name, selection: { interestId: hidden.interestId }, stance: "shares" })).rejects.toMatchObject({ code: "unknown-interest" });
  await expect(member.confirmInterest({ phrase: hidden.name, selection: { name: hidden.name, kind: hidden.kind }, stance: "shares" })).rejects.toMatchObject({ code: "unknown-interest" });
  await expect(admin.updateInterest(hidden.interestId, { name: "Hidden rename", kind: "hobby" })).rejects.toMatchObject({ code: "unknown-interest" });
});

test("dependent merges split in reverse order while unrelated merges remain independent and later Stances survive", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const a = await declare(member, "SQL", "shares");
  const b = await declare(member, "Structured query language", "seeks");
  const c = await declare(member, "Database language", "seeks");
  await member.setInterestStance({ interestId: a.interestId, stance: "shares" });
  const other = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  for (const interest of [a, b, c]) await declare(other, interest.name, "seeks");
  const admin = await h.organisationAdmin();
  const first = await proposal(admin, [a.name, b.name]);
  await admin.approveInterestMerge(first.id, b.interestId);
  expect((await member.myInterests()).find(({ interestId }) => interestId === b.interestId)?.stance).toBe("shares");
  const second = await proposal(admin, [b.name, c.name]);
  await admin.approveInterestMerge(second.id, c.interestId);
  expect(await member.myInterests()).toEqual([{ ...c, stance: "shares" }]);
  await other.setInterestStance({ interestId: c.interestId, stance: "shares" });
  const unrelated = await proposal(admin, ["Rust", "Public speaking"]);
  await admin.approveInterestMerge(unrelated.id, unrelated.interests[0]!.interestId);
  await expect(admin.splitInterestMerge(first.id)).rejects.toMatchObject({ message: "Split the later merge that uses these Interests first." });
  expect((await admin.interestMergeHistory()).find(({ id }) => id === first.id)?.canSplit).toBe(false);
  await admin.splitInterestMerge(unrelated.id);
  await admin.splitInterestMerge(second.id);
  await admin.splitInterestMerge(first.id);

  expect(await member.myInterests()).toEqual([c, a, b]);
  expect(await other.myInterests()).toEqual([{ ...c, stance: "shares" }]);
  const last = await proposal(admin, [a.name, c.name]);
  await admin.approveInterestMerge(last.id, c.interestId);
  expect(await member.myInterests()).toEqual([{ ...c, stance: "shares" }, b]);
});

test.each([{ kind: "meetup", label: "Meetups" }, { kind: "event", label: "Events" }] as const)("recurring $label use the canonical Interest after a merge and the restored series after a split", async ({ kind }) => {
  await h.setupOrganisation(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(host, "SQL", "shares");
  const removed = await declare(host, "Structured query language", "seeks");
  const first = await createMeetupOrEvent(h, host, {
    activityId: (await host.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 30, capacity: 6,
    place: { kind: "virtual", url: "https://meet.example/sql" }, recurrence: { frequency: "weekly" },
    relevantInterests: [{ phrase: removed.name, selection: { interestId: removed.interestId } }],
  }, kind);
  const actor = participationFor(host, kind);
  await h.app.processRecurrences();
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, removed.name]);
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  h.clock.set(new Date("2026-09-26T09:00:00Z"));
  await h.app.processRecurrences();
  const duringMerge = (await actor.list()).find((entry) => entry.startsAt.toISOString() === "2026-10-03T10:00:00.000Z")!;
  expect((await actor.view(duringMerge.id))?.relevantInterests.map(({ name }) => name)).toEqual(["SQL"]);

  await admin.splitInterestMerge(pending.id);
  expect((await actor.view(first.id))?.relevantInterests.map(({ name }) => name)).toEqual([removed.name]);
  h.clock.set(new Date("2026-10-10T09:00:00Z"));
  await h.app.processRecurrences();
  const afterSplit = (await actor.list()).find((entry) => entry.startsAt.toISOString() === "2026-10-17T10:00:00.000Z")!;
  expect((await actor.view(afterSplit.id))?.relevantInterests.map(({ name }) => name)).toEqual([removed.name]);
});

test("an Organisation Admin's Interest rename and kind change appear in search, profiles and clustering", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const interest = await declare(member, "SQL", "shares");
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  const admin = await h.organisationAdmin();

  await admin.updateInterest(interest.interestId, { name: "Ana Silva's database puzzles", kind: "hobby" });

  const renamed = { ...interest, name: "Ana Silva's database puzzles", kind: "hobby" };
  expect(await member.myInterests()).toEqual([renamed]);
  expect((await viewer.viewMember((await member.profile()).memberId))?.interests).toEqual([renamed]);
  expect((await viewer.searchMembers({ interest: "database puzzles" }))[0]?.interests).toEqual([renamed]);
  expect((await viewer.searchMembers({ interest: "SQL" }))[0]?.interests).toEqual([renamed]);
  await admin.proposeInterestMerges();
  expect(h.ai.clusteringRequests[0]?.interests).toContainEqual({ name: renamed.name, count: 1 });
});

test.each([{ kind: "meetup", label: "Meetup" }, { kind: "event", label: "Event" }] as const)("merging and splitting $label Interests preserves later Host choices", async ({ kind }) => {
  await h.setupOrganisation(ministryA);
  const host = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(host, "SQL", "shares");
  const removed = await declare(host, "Structured query language", "seeks");
  const rust = (await host.interests()).find(({ name }) => name === "Rust")!;
  const choice = (interest: { interestId: string; name: string }) => ({ phrase: interest.name, selection: { interestId: interest.interestId } });
  const input = {
    activityId: (await host.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-25T10:00:00Z"), durationMinutes: 30, capacity: 6,
    place: { kind: "virtual" as const, url: "https://meet.example/sql" }, relevantInterests: [choice(survivor), choice(removed)],
  };
  const untouched = await createMeetupOrEvent(h, host, input, kind);
  const removedLater = await createMeetupOrEvent(h, host, input, kind);
  const addedAgain = await createMeetupOrEvent(h, host, input, kind);
  const unrelatedEdit = await createMeetupOrEvent(h, host, input, kind);
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, removed.name]);
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  const actor = participationFor(host, kind);
  expect((await actor.view(untouched.id))?.relevantInterests.map(({ name }) => name)).toEqual(["SQL"]);
  await actor.edit(untouched.id, { ...input, description: "An unrelated edit", relevantInterests: [choice(survivor)] });
  await actor.edit(removedLater.id, { ...input, relevantInterests: [] });
  await actor.edit(addedAgain.id, { ...input, relevantInterests: [] });
  await actor.edit(addedAgain.id, { ...input, relevantInterests: [choice(survivor)] });
  await actor.edit(unrelatedEdit.id, { ...input, relevantInterests: [choice(survivor), choice(rust)] });

  await admin.splitInterestMerge(pending.id);

  expect((await actor.view(untouched.id))?.relevantInterests.map(({ name }) => name)).toEqual(["SQL", "Structured query language"]);
  expect((await actor.view(removedLater.id))?.relevantInterests).toEqual([]);
  expect((await actor.view(addedAgain.id))?.relevantInterests.map(({ name }) => name)).toEqual(["SQL"]);
  expect((await actor.view(unrelatedEdit.id))?.relevantInterests.map(({ name }) => name)).toEqual(["Rust", "SQL", "Structured query language"]);
});

async function declare(member: MemberActions, name: string, stance: Stance) {
  return (await member.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance }))
    .find((interest) => interest.name === name)!;
}

async function proposal(admin: OrganisationAdminActions, names: string[]) {
  h.ai.clusteringResponses.push([names]);
  await admin.proposeInterestMerges();
  return (await admin.interestMergeProposals()).find((entry) => entry.interests.every(({ name }) => names.includes(name)))!;
}

test("splitting an untouched merge restores each original Stance and Alias", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(member, "Structured query language", "shares");
  const removed = await declare(member, "SQL", "seeks");
  const other = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  await other.confirmInterest({ phrase: "database querying", selection: { interestId: removed.interestId }, stance: "shares" });
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, removed.name]);
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  expect(await other.myInterests()).toEqual([{ ...survivor, stance: "shares" }]);

  await admin.splitInterestMerge(pending.id);
  await admin.splitInterestMerge(pending.id);

  expect(await member.myInterests()).toEqual([removed, survivor]);
  expect(await other.myInterests()).toEqual([{ ...removed, stance: "shares" }]);
  expect((await member.resolveInterest({ phrase: "database querying", kind: "skill" })).proposed).toEqual({ interestId: removed.interestId });
  expect((await admin.interestMergeHistory())[0]).toMatchObject({ splitAt: h.clock.now(), canSplit: false });
  expect((await member.interests()).find(({ interestId }) => interestId === removed.interestId)).toMatchObject({ name: "SQL" });
});

test.each(["Stance change", "same-value Stance edit", "removal", "re-added declaration"])("splitting preserves a Member's later %s at the same clock instant", async (action) => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(member, "SQL", "shares");
  const removed = await declare(member, "Structured query language", "seeks");
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, removed.name]);
  await admin.approveInterestMerge(pending.id, survivor.interestId);
  if (action === "Stance change" || action === "same-value Stance edit") {
    await member.setInterestStance({ interestId: survivor.interestId, stance: action === "same-value Stance edit" ? "seeks" : "shares" });
  } else {
    await member.removeInterest(survivor.interestId);
    if (action === "re-added declaration") await declare(member, "SQL", "shares");
  }

  await admin.splitInterestMerge(pending.id);

  expect(await member.myInterests()).toEqual(action === "removal" ? [] : [{ ...survivor, stance: action === "same-value Stance edit" ? "seeks" : "shares" }]);
});

test.each(["shares", "seeks"] as const)("a merge repoints Aliases and keeps the most recent explicit Stance when it is %s", async (latest) => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const survivor = await declare(member, "Structured query language", "shares");
  const removed = await declare(member, "SQL", latest);
  const admin = await h.organisationAdmin();
  const pending = await proposal(admin, [survivor.name, removed.name]);

  await admin.approveInterestMerge(pending.id, survivor.interestId);

  expect(await member.myInterests()).toEqual([{ ...survivor, stance: latest }]);
  expect((await member.interests()).some(({ interestId }) => interestId === removed.interestId)).toBe(false);
  expect((await member.resolveInterest({ phrase: "SQL", kind: "skill" })).proposed).toEqual({ interestId: survivor.interestId });
  expect(await admin.interestMergeProposals()).toEqual([]);
  expect(await admin.interestMergeHistory()).toEqual([{
    id: pending.id,
    survivingInterest: { interestId: survivor.interestId, name: survivor.name, kind: "skill" },
    mergedInterests: [{ interestId: removed.interestId, name: "SQL", kind: "skill" }],
    mergedAt: h.clock.now(), splitAt: null, canSplit: true,
  }]);
});

test("the worker produces merge proposals that the Organisation Admin can review without duplicating an existing cluster", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  await member.confirmInterest({ phrase: "Structured query language", selection: { name: "Structured query language", kind: "skill" }, stance: "shares" });
  const admin = await h.organisationAdmin();
  h.ai.clusteringResponses.push([["Structured query language", "SQL"]], [["SQL", "Structured query language"]]);
  await h.app.processInterestMerges();
  const proposals = await admin.interestMergeProposals();
  expect(proposals).toHaveLength(1);
  expect(proposals[0]!.interests.map(({ name }) => name)).toEqual(["SQL", "Structured query language"]);
  await h.app.processInterestMerges();
  expect(await admin.interestMergeProposals()).toEqual(proposals);
});

test("an Organisation Admin gets one merge proposal per cluster using only their Organisation's Interest names and counts", async () => {
  await h.setupOrganisation(ministryA);
  await h.setupOrganisation(ministryB);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const other = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "bo", email: "bo@example.test", name: "Bo" });
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  await member.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  await member.confirmInterest({ phrase: "Ana Silva's SQL", selection: { name: "Ana Silva's SQL", kind: "skill" }, stance: "seeks" });
  await other.confirmInterest({ phrase: "Foreign Interest", selection: { name: "Foreign Interest", kind: "hobby" }, stance: "shares" });
  const admin = await h.organisationAdmin();
  h.ai.clusteringResponses.push([["SQL", "Ana Silva's SQL"]], [["Ana Silva's SQL", "SQL"]]);

  await admin.proposeInterestMerges();
  const proposals = await admin.interestMergeProposals();
  expect(proposals).toEqual([{ id: expect.any(String), interests: [
    { interestId: expect.any(String), name: "Ana Silva's SQL", kind: "skill", count: 1 },
    { ...sql, count: 1 },
  ] }]);
  await admin.proposeInterestMerges();
  expect(await admin.interestMergeProposals()).toEqual(proposals);
  expect(h.ai.clusteringRequests).toEqual(Array(2).fill({ interests: [
    { name: "Ana Silva's SQL", count: 1 },
    { name: "Board games", count: 0 },
    { name: "Bouldering", count: 0 },
    { name: "Public speaking", count: 0 },
    { name: "Running", count: 0 },
    { name: "Rust", count: 0 },
    { name: "SQL", count: 1 },
    { name: "Spreadsheets", count: 0 },
  ] }));
  expect(await (await h.organisationAdmin("ministry-b")).interestMergeProposals()).toEqual([]);
});
