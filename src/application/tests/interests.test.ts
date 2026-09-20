import { expect, test } from "vitest";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs, signInAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("a Member previews an Interest before confirming it with a Stance", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const catalog = await member.interests();
  const rust = catalog.find((interest) => interest.name === "Rust")!;
  expect(rust).toMatchObject({ kind: "skill" });
  expect(catalog).toContainEqual(expect.objectContaining({ name: "Board games", kind: "hobby" }));

  const resolution = await member.resolveInterest({ phrase: "rustlang", kind: "skill" });
  expect(resolution).toMatchObject({ phrase: "rustlang", proposed: { interestId: rust.interestId } });
  expect(await member.myInterests()).toEqual([]);
  expect(await member.confirmInterest({ phrase: resolution.phrase, selection: resolution.proposed, stance: "shares" }))
    .toEqual([{ ...rust, stance: "shares" }]);
});

test("a Member's override resolves its saved Alias without another AI request", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  const preview = await member.resolveInterest({ phrase: "database wizardry", kind: "skill" });
  await member.confirmInterest({ phrase: preview.phrase, selection: { interestId: sql.interestId }, stance: "seeks" });
  h.ai.reset();

  const later = await member.resolveInterest({ phrase: "database wizardry", kind: "skill" });
  expect(later.proposed).toEqual({ interestId: sql.interestId });
  expect(later.shortlist).toContainEqual(sql);
  expect(h.ai.requests).toEqual([]);
  expect(await member.myInterests()).toEqual([{ ...sql, stance: "seeks" }]);
});

test("the AI receives only Interest text, kinds and Member counts", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  await member.confirmInterest({ phrase: "database wizardry", selection: { interestId: sql.interestId }, stance: "shares" });
  await member.resolveInterest({ phrase: "sql", kind: "skill" });

  expect(h.ai.requests).toEqual([{ phrase: "sql", shortlist: [{ name: "SQL", kind: "skill", count: 1 }] }]);
});

test("a Member can keep a phrase as a Hobby and replace their Stance", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  h.ai.responses.push({ existingName: "Bouldering" });
  const preview = await member.resolveInterest({ phrase: "indoor bouldering", kind: "hobby" });
  const [interest] = await member.confirmInterest({ phrase: preview.phrase, selection: { name: preview.phrase, kind: "hobby" }, stance: "seeks" });
  expect(interest).toMatchObject({ name: "indoor bouldering", kind: "hobby", stance: "seeks" });

  expect(await member.setInterestStance({ interestId: interest!.interestId, stance: "shares" }))
    .toEqual([{ ...interest, stance: "shares" }]);
  await expect(member.setInterestStance({ interestId: interest!.interestId, stance: "other" as "shares" }))
    .rejects.toMatchObject({ name: "InvalidInputError" });
});

test("Members find other Members by Interest, Department and Site and see their Stances", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryB));
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo", ou: "Legal", building: "Harbour House" });
  const cleo = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "cleo", email: "cleo@example.test", name: "Cleo", ou: "Legal", building: "Harbour House" });
  for (const member of [viewer, bo, cleo]) {
    const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
    await member.confirmInterest({ phrase: "database wizardry", selection: { interestId: sql.interestId }, stance: "seeks" });
  }
  const boProfile = await bo.profile();
  const expected = { memberId: boProfile.memberId, name: "Bo", department: "Legal", site: "Harbour House", interests: await bo.myInterests() };

  expect(await viewer.searchMembers({ interest: "sql", department: "Legal", site: "Harbour House" })).toEqual([expected]);
  expect(await viewer.searchMembers({ interest: "database wizardry" })).toEqual([expected]);
  expect(await viewer.searchMembers({ department: "Finance" })).toEqual([]);
  expect(await viewer.searchMembers({ site: "Annex" })).toEqual([]);
  expect(await viewer.viewMember(boProfile.memberId)).toEqual(expected);
  expect(await viewer.viewMember((await cleo.profile()).memberId)).toBeUndefined();
});

test("AI can propose a new canonical Interest while the original phrase remains searchable", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  h.ai.responses.push({ name: "Model railways", kind: "hobby" });
  const preview = await member.resolveInterest({ phrase: "tiny trains", kind: "hobby" });
  expect(preview.proposed).toEqual({ name: "Model railways", kind: "hobby" });
  expect(await viewer.searchMembers({ interest: "tiny trains" })).toEqual([]);
  await member.confirmInterest({ phrase: preview.phrase, selection: preview.proposed, stance: "seeks" });
  expect(await viewer.searchMembers({ interest: "tiny trains" })).toEqual([
    expect.objectContaining({ name: "Ana Silva", interests: [expect.objectContaining({ name: "Model railways", kind: "hobby", stance: "seeks" })] }),
  ]);
});

test("similarity resolves typos and proposes new Interests during an AI outage without saving", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const boardGames = (await member.interests()).find((interest) => interest.name === "Board games")!;
  h.ai.responses.push(new Error("timeout"), new Error("timeout"), { existingName: "Outside the shortlist" });
  expect((await member.resolveInterest({ phrase: "bord games", kind: "hobby" })).proposed).toEqual({ interestId: boardGames.interestId });
  expect((await member.resolveInterest({ phrase: "Zyzyva", kind: "hobby" })).proposed).toEqual({ name: "Zyzyva", kind: "hobby" });
  expect((await member.resolveInterest({ phrase: "bord games", kind: "hobby" })).proposed).toEqual({ interestId: boardGames.interestId });
  expect(await member.myInterests()).toEqual([]);
});

test("Interests and Aliases stay in their Organisation and starter seeding is idempotent", async () => {
  await h.setupOrganisation(ministryA);
  await h.setupOrganisation(ministryB);
  const a = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const b = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "bo", email: "bo@example.test", name: "Bo" });
  const initial = await a.interests();
  const sqlA = initial.find((interest) => interest.name === "SQL")!;
  const sqlB = (await b.interests()).find((interest) => interest.name === "SQL")!;
  expect(sqlA.interestId).not.toBe(sqlB.interestId);
  await a.confirmInterest({ phrase: "Xyzzy", selection: { interestId: sqlA.interestId }, stance: "shares" });
  await expect(b.confirmInterest({ phrase: "SQL", selection: { interestId: sqlA.interestId }, stance: "shares" })).rejects.toMatchObject({ code: "unknown-interest" });
  h.ai.responses.push(new Error("offline"));
  expect((await b.resolveInterest({ phrase: "Xyzzy", kind: "hobby" })).proposed).toEqual({ name: "Xyzzy", kind: "hobby" });
  await h.setupOrganisation(ministryA);
  expect(await a.interests()).toEqual(initial);
});

test("a roster departure removes the Member from searches and profiles and revokes their actor", async () => {
  const adminPerson = { email: "olivia@example.test", name: "Olivia" };
  await h.setupOrganisation({ ...ministryA, organisationAdmin: adminPerson });
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  await member.confirmInterest({ phrase: "database wizardry", selection: { interestId: sql.interestId }, stance: "shares" });
  const memberId = (await member.profile()).memberId;
  expect(await viewer.searchMembers({ interest: "SQL" })).toHaveLength(1);
  const admin = await viewer.organisationAdmin();
  const roster = [adminPerson, ministryA.platformAdmin, { email: "new@example.test", name: "New Member" }].map((person) => ({ ...person, department: null, site: null }));
  await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);

  expect(await viewer.searchMembers({ interest: "SQL" })).toEqual([]);
  expect(await viewer.searchMembers()).toContainEqual(expect.objectContaining({ name: "New Member", interests: [] }));
  expect(await viewer.viewMember(memberId)).toBeUndefined();
  await expect(member.searchMembers()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await viewer.resolveInterest({ phrase: "SQL", kind: "skill" });
  expect(h.ai.requests.at(-1)).toEqual({ phrase: "SQL", shortlist: [{ name: "SQL", kind: "skill", count: 0 }] });
});

test("Interest commands and discovery require notice acknowledgement and validate input", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAs(h, "ministry-a", ana);
  await expect(member.resolveInterest({ phrase: "SQL", kind: "skill" })).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await expect(member.searchMembers()).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await member.acknowledgeAdminVisibilityNotice();
  await expect(member.resolveInterest({ phrase: " ", kind: "skill" })).rejects.toMatchObject({ code: "invalid-interest" });
  await expect(member.resolveInterest({ phrase: "x".repeat(121), kind: "skill" })).rejects.toMatchObject({ code: "invalid-interest" });
  await expect(member.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "other" as "shares" })).rejects.toMatchObject({ code: "invalid-interest" });
  expect(h.ai.requests).toEqual([]);
});

test("confirming the same Interest again replaces the Stance without duplicating the Interest", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  await member.confirmInterest({ phrase: "sql", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  const declared = await member.confirmInterest({ phrase: "sql", selection: { interestId: sql.interestId }, stance: "seeks" });
  expect(declared).toEqual([expect.objectContaining({ name: "SQL", stance: "seeks" })]);
});

test("a normalized Alias cannot be confirmed against a different Interest", async () => {
  await h.setupOrganisation(ministryA);
  const anaMember = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  const sql = (await anaMember.interests()).find((interest) => interest.name === "SQL")!;
  await anaMember.confirmInterest({ phrase: "database wizardry", selection: { interestId: sql.interestId }, stance: "shares" });
  await expect(bo.confirmInterest({ phrase: "\tDATABASE WIZARDRY ", selection: { name: "Database magic", kind: "skill" }, stance: "seeks" }))
    .rejects.toMatchObject({ code: "alias-conflict" });
  expect(await bo.myInterests()).toEqual([]);
  expect(await bo.interests()).not.toContainEqual(expect.objectContaining({ name: "Database magic" }));
  h.ai.responses.push(new Error("offline"));
  expect((await bo.resolveInterest({ phrase: "DATABASE WIZARDRY", kind: "skill" })).proposed).toEqual({ interestId: sql.interestId });
  expect(await bo.searchMembers({ interest: "database wizardry" })).toEqual([expect.objectContaining({ name: "Ana Silva" })]);
  await bo.confirmInterest({ phrase: " DATABASE WIZARDRY ", selection: { interestId: sql.interestId }, stance: "seeks" });
  expect(await bo.myInterests()).toEqual([{ ...sql, stance: "seeks" }]);
});

test("concurrent confirmations keep one Alias mapping and roll back the conflicting Interest", async () => {
  await h.setupOrganisation(ministryA);
  const a = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const b = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
  const before = await a.interests();
  const results = await Promise.allSettled([
    a.confirmInterest({ phrase: "shared phrase", selection: { name: "First choice", kind: "skill" }, stance: "shares" }),
    b.confirmInterest({ phrase: " SHARED PHRASE ", selection: { name: "Second choice", kind: "hobby" }, stance: "seeks" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: "alias-conflict" }) }),
  ]);
  expect(await a.interests()).toHaveLength(before.length + 1);
  expect([...(await a.myInterests()), ...(await b.myInterests())]).toHaveLength(1);
});

test.each([["\u00a0SQL\u00a0", "sql"], ["\ufeffSQL\ufeff", "sql"], ["İ", "i"], ["ΟΣ", "οσ"]])(
  "Alias normalization treats %s and %s as the same phrase", async (phrase, variant) => {
    await h.setupOrganisation(ministryA);
    const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
    const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
    const rust = (await member.interests()).find((interest) => interest.name === "Rust")!;
    await member.confirmInterest({ phrase, selection: { interestId: sql.interestId }, stance: "shares" });
    h.ai.responses.push(new Error("offline"));
    const preview = await member.resolveInterest({ phrase: variant, kind: "skill" });
    expect(preview.proposed).toEqual({ interestId: sql.interestId });
    await member.confirmInterest({ phrase: preview.phrase, selection: preview.proposed, stance: "shares" });
    await expect(member.confirmInterest({ phrase: variant, selection: { interestId: rust.interestId }, stance: "seeks" }))
      .rejects.toMatchObject({ code: "alias-conflict" });
    expect(await member.myInterests()).toEqual([{ ...sql, stance: "shares" }]);
  },
);

test("AI proposals with an existing canonical name preview its actual name and kind", async () => {
  await h.setupOrganisation(ministryA);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  h.ai.responses.push({ name: "sql", kind: "hobby" });
  const preview = await member.resolveInterest({ phrase: "zzzzz", kind: "hobby" });
  expect(preview.proposed).toEqual({ interestId: sql.interestId });
  expect(preview.shortlist).toContainEqual(sql);
  expect(await member.confirmInterest({ phrase: preview.phrase, selection: preview.proposed, stance: "seeks" }))
    .toEqual([{ ...sql, stance: "seeks" }]);
});

test.each([{ name: "sql", kind: "skill" as const }, { name: "SQL", kind: "hobby" as const }])(
  "a conflicting new selection $name/$kind requires another confirmation", async (selection) => {
    await h.setupOrganisation(ministryA);
    const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
    await expect(member.confirmInterest({ phrase: "sql", selection, stance: "shares" }))
      .rejects.toMatchObject({ code: "interest-name-conflict" });
    expect(await member.myInterests()).toEqual([]);
  },
);
