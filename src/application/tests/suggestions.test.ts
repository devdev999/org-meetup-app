import { expect, test } from "vitest";
import type { CreateMeetupInput, MemberActions } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

async function member(name: string, department = "Finance", site = "Harbour House", organisation = "ministry-a") {
  return signInAndAcknowledgeAs(h, organisation, {
    sub: name, email: `${name.toLowerCase()}@example.test`, name, ou: department, building: site,
  });
}

async function setup() {
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryA));
  return member("Ana");
}

async function input(host: MemberActions, changes: Partial<CreateMeetupInput> = {}): Promise<CreateMeetupInput> {
  return {
    activityId: (await host.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, capacity: 6,
    ...changes,
  };
}

test("a Host saves and edits a Meetup's relevant Interests without changing personal Stances", async () => {
  const host = await setup();
  const sql = (await host.interests()).find((interest) => interest.name === "SQL")!;
  await host.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  const data = await input(host, { relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
  const meetup = await host.createMeetup(data);
  expect(meetup.relevantInterests).toEqual([sql]);
  await host.editMeetup(meetup.id, { ...data, relevantInterests: [{ phrase: "Chess", selection: { name: "Chess", kind: "hobby" } }] });
  expect((await host.viewMeetup(meetup.id))?.relevantInterests).toEqual([
    expect.objectContaining({ name: "Chess", kind: "hobby" }),
  ]);
  expect(await host.myInterests()).toEqual([{ ...sql, stance: "seeks" }]);
  expect((await host.resolveInterest({ phrase: "Chess", kind: "hobby" })).proposed).toHaveProperty("interestId");
});

test("a Meetup cannot save another Organisation's canonical Interests", async () => {
  const host = await setup();
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const outsider = await member("Outside", "Legal", "Harbour House", "ministry-b");
  const foreign = (await outsider.interests())[0]!;
  await expect(host.createMeetup(await input(host, {
    relevantInterests: [{ phrase: foreign.name, selection: { interestId: foreign.interestId } }],
  }))).rejects.toMatchObject({ code: "unknown-interest" });
  expect(await host.listMeetups()).toEqual([]);
});

test("selecting a canonical Meetup Interest preserves an existing Alias with the same display name", async () => {
  const host = await setup();
  const sql = (await host.interests()).find((interest) => interest.name === "SQL")!;
  await host.confirmInterest({ phrase: "SQL", selection: { name: "Databases", kind: "skill" }, stance: "shares" });
  const data = await input(host, { relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
  const meetup = await host.createMeetup(data);
  expect(meetup.relevantInterests).toEqual([sql]);
  await host.editMeetup(meetup.id, { ...data, durationMinutes: 45 });
  expect((await host.viewMeetup(meetup.id))?.relevantInterests).toEqual([sql]);
  const [declaration] = await host.myInterests();
  expect(declaration).toMatchObject({ name: "Databases", stance: "shares" });
  expect((await host.resolveInterest({ phrase: "SQL", kind: "skill" })).proposed).toEqual({ interestId: declaration!.interestId });
});

test("Invite Suggestions filter Active Members by Organisation and physical Site, excluding Participants and pending invitees", async () => {
  const host = await setup();
  const bo = await member("Bo", "Legal");
  await member("Cy", "Legal", "Annex");
  const di = await member("Di");
  const ev = await member("Ev");
  const fay = await member("Fay");
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  await member("Outside", "Finance", "Harbour House", "ministry-b");
  const siteId = (await host.meetupChoices()).sites.find((site) => site.name === "Harbour House")!.id;
  const data = await input(host, { capacity: 2, place: { kind: "physical", siteId, spot: "Cafe" } });
  const meetup = await host.createMeetup(data);
  await di.joinMeetup(meetup.id);
  await fay.joinMeetup(meetup.id);
  await host.inviteMember(meetup.id, (await ev.profile()).memberId);
  const previous = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  await bo.answerInvite(previous.id, "decline");
  const suggestions = await host.inviteSuggestions(meetup.id);
  expect(suggestions.map((suggestion) => suggestion.member.name)).toEqual(["Bo", "Fay"]);
  expect(suggestions[0]).toMatchObject({ previousInviteId: previous.id, reasons: expect.arrayContaining(["From a different Department."]) });
  await expect(bo.inviteSuggestions(meetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await host.editMeetup(meetup.id, { ...data, place: { kind: "virtual", url: "https://meet.example/coffee" } });
  expect((await host.inviteSuggestions(meetup.id)).map((suggestion) => suggestion.member.name).sort()).toEqual(["Bo", "Cy", "Fay"]);
});

test("a Suggestion can send a fresh Invite after decline without replaying old answers or duplicate sends", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const meetup = await host.createMeetup(await input(host));
  const boId = (await bo.profile()).memberId;
  const original = await host.inviteMember(meetup.id, boId);
  await bo.answerInvite(original.id, "decline");
  const suggestion = (await host.inviteSuggestions(meetup.id))[0]!;
  const renewed = await host.inviteMember(meetup.id, suggestion.member.memberId, suggestion.previousInviteId ?? undefined);
  expect(renewed.state).toBe("pending");
  expect(renewed.id).not.toBe(original.id);
  await expect(bo.answerInvite(original.id, "accept")).rejects.toMatchObject({ name: "AccessDeniedError" });
  expect(await host.inviteMember(meetup.id, boId, original.id)).toEqual(renewed);
  expect((await bo.inbox()).filter((notice) => notice.kind === "invite-received")).toHaveLength(2);
  expect(await host.inviteSuggestions(meetup.id)).toEqual([]);
  await bo.answerInvite(renewed.id, "decline");
  expect((await host.inviteMember(meetup.id, boId, original.id)).state).toBe("declined");
  expect((await bo.inbox()).filter((notice) => notice.kind === "invite-received")).toHaveLength(2);
});

test("a retried notice for an old Invite cannot carry buttons for a renewed Invite", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const link = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(link.url).searchParams.get("start")! });
  h.telegram.reset();
  h.telegram.failure = new Error("Telegram unavailable");
  const data = await input(host);
  const meetup = await host.createMeetup(data);
  const boId = (await bo.profile()).memberId;
  const original = await host.inviteMember(meetup.id, boId);
  await bo.answerInvite(original.id, "decline");
  await host.editMeetup(meetup.id, { ...data, startsAt: new Date("2026-09-21T11:00:00Z") });
  h.telegram.failure = undefined;
  const renewed = await host.inviteMember(meetup.id, boId, original.id);
  expect(h.telegram.outbox).toEqual([expect.objectContaining({ inviteId: renewed.id, text: expect.stringContaining("2026-09-21 11:00") })]);
  h.clock.advance(60_000);
  await h.app.deliverNotices();
  expect(h.telegram.outbox.filter((message) => message.inviteId === renewed.id)).toHaveLength(1);
  expect(h.telegram.outbox.find((message) => message.text.includes("2026-09-19 10:00"))?.inviteId).toBeUndefined();
});

test("home Suggestions use saved Interests and include only open unjoined Meetups in scope within fourteen days", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const annex = await member("AnnexHost", "Legal", "Annex");
  const sql = (await bo.interests()).find((interest) => interest.name === "SQL")!;
  await bo.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  const ordinary = await host.createMeetup(await input(host, { description: "SQL" }));
  const matching = await host.createMeetup(await input(host, {
    startsAt: new Date("2026-09-21T10:00:00Z"), relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }],
  }));
  const boundary = await host.createMeetup(await input(host, { startsAt: new Date("2026-10-02T09:00:00Z") }));
  await host.createMeetup(await input(host, { startsAt: new Date("2026-10-02T09:00:00.001Z") }));
  await host.createMeetup(await input(host, { audience: { kind: "invite-only" } }));
  const cancelled = await host.createMeetup(await input(host));
  await host.cancelMeetup(cancelled.id);
  const joined = await host.createMeetup(await input(host));
  await bo.joinMeetup(joined.id);
  const annexId = (await annex.meetupChoices()).sites.find((site) => site.name === "Annex")!.id;
  await annex.createMeetup(await input(annex, { place: { kind: "physical", siteId: annexId, spot: "Cafe" } }));
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const outsider = await member("Outside", "Finance", "Harbour House", "ministry-b");
  await outsider.createMeetup(await input(outsider));
  const result = await bo.meetupSuggestions();
  expect(result.map((suggestion) => suggestion.meetup.id)).toEqual([matching.id, ordinary.id, boundary.id]);
  expect(result[0]?.reasons).toContain("Relevant Interests: SQL.");
  expect(result[1]?.reasons).not.toContain("Relevant Interests: SQL.");
  await host.editMeetup(matching.id, { ...await input(host), relevantInterests: [] });
  expect((await bo.meetupSuggestions()).find((suggestion) => suggestion.meetup.id === matching.id)?.reasons).not.toContain("Relevant Interests: SQL.");
});

test("home Suggestions include compatible Host declarations and reflect a changed Stance", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const sql = (await bo.interests()).find((interest) => interest.name === "SQL")!;
  await bo.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  await host.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  const ordinary = await cy.createMeetup(await input(cy));
  const matching = await host.createMeetup(await input(host, { startsAt: new Date("2026-09-21T10:00:00Z") }));
  const suggestions = await bo.meetupSuggestions();
  expect(suggestions.map((suggestion) => suggestion.meetup.id)).toEqual([matching.id, ordinary.id]);
  expect(suggestions[0]?.reasons).toContain("The Host Shares SQL, which you Seek.");
  await host.setInterestStance({ interestId: sql.interestId, stance: "seeks" });
  expect((await bo.meetupSuggestions())[0]?.reasons).toContain("Learn SQL together with the Host.");
});

test("automatic extraction receives the chosen Activity and description and previews canonical Interests without saving", async () => {
  const host = await setup();
  const data = await input(host, { description: "Ask Ana in Finance about rustlang and Python." });
  h.ai.extractionResponses.push([{ phrase: "rustlang", kind: "skill" }, { phrase: "Python", kind: "skill" }]);
  const proposals = await host.extractMeetupInterests({ activityId: data.activityId, description: data.description! });
  expect(h.ai.extractionRequests).toEqual([{ activity: "coffee", description: data.description }]);
  const rust = (await host.interests()).find((interest) => interest.name === "Rust")!;
  expect(proposals).toEqual([
    expect.objectContaining({ phrase: "rustlang", proposed: { interestId: rust.interestId } }),
    expect.objectContaining({ phrase: "Python", proposed: { name: "Python", kind: "skill" } }),
  ]);
  expect((await host.interests()).some((interest) => interest.name === "Python")).toBe(false);
  expect(await host.myInterests()).toEqual([]);
});

test.each([new Error("Timed out"), [{ phrase: "", kind: "skill" as const }], []])("extraction failure or unusable output leaves manual creation available: %j", async (response) => {
  const host = await setup();
  const data = await input(host);
  h.ai.extractionResponses.push(response);
  expect(await host.extractMeetupInterests({ activityId: data.activityId, description: "SQL" })).toEqual([]);
  const sql = (await host.interests()).find((interest) => interest.name === "SQL")!;
  const meetup = await host.createMeetup({ ...data, relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
  expect(meetup.relevantInterests).toEqual([sql]);
});

test("one extraction resolves distinct Aliases and collapses repeated canonical Interests", async () => {
  const host = await setup();
  const catalog = await host.interests();
  const sql = catalog.find((interest) => interest.name === "SQL")!;
  const rust = catalog.find((interest) => interest.name === "Rust")!;
  await host.confirmInterest({ phrase: "İ", selection: { interestId: sql.interestId }, stance: "shares" });
  await host.confirmInterest({ phrase: "systems craft", selection: { interestId: rust.interestId }, stance: "seeks" });
  const declarations = await host.myInterests();
  h.ai.extractionResponses.push([
    { phrase: "i", kind: "skill" }, { phrase: "SYSTEMS CRAFT", kind: "skill" }, { phrase: "İ", kind: "skill" },
  ]);
  h.ai.responses.push(new Error("offline"), new Error("offline"), new Error("offline"));
  const { activityId } = await input(host);
  const proposals = await host.extractMeetupInterests({ activityId, description: "Practice both Interests." });
  expect(proposals.map((proposal) => proposal.proposed)).toEqual([{ interestId: sql.interestId }, { interestId: rust.interestId }]);
  expect(await host.myInterests()).toEqual(declarations);
});

test("extraction validates the Activity and canonicalises only within the actor's Organisation", async () => {
  const host = await setup();
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const outsider = await member("Outside", "Legal", "Annex", "ministry-b");
  const foreignData = await input(outsider);
  await expect(host.extractMeetupInterests({ activityId: foreignData.activityId, description: "Rust" })).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(h.ai.extractionRequests).toEqual([]);
  const ownData = await input(host);
  h.ai.extractionResponses.push([{ phrase: "Rust", kind: "skill" }]);
  const [proposal] = await host.extractMeetupInterests({ activityId: ownData.activityId, description: "Rust" });
  const ownRust = (await host.interests()).find((interest) => interest.name === "Rust")!;
  const foreignRust = (await outsider.interests()).find((interest) => interest.name === "Rust")!;
  expect(proposal?.proposed).toEqual({ interestId: ownRust.interestId });
  expect(proposal?.proposed).not.toEqual({ interestId: foreignRust.interestId });
});

test("Invite Suggestions rank saved relevant Interests and recompute after an edit", async () => {
  const host = await setup();
  const bo = await member("Bo");
  await member("Cy", "Legal");
  const sql = (await bo.interests()).find((interest) => interest.name === "SQL")!;
  await bo.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  const data = await input(host, { relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
  const meetup = await host.createMeetup(data);
  expect((await host.inviteSuggestions(meetup.id))[0]).toMatchObject({ member: { name: "Bo" }, reasons: expect.arrayContaining([
    "Interested in SQL, a relevant Interest for this Meetup.",
  ]) });
  await host.editMeetup(meetup.id, { ...data, relevantInterests: [] });
  expect((await host.inviteSuggestions(meetup.id))[0]?.member.name).toBe("Cy");
});

test("a Host previews scoped Invite Suggestions before creating a Meetup without storing a draft", async () => {
  const host = await setup();
  await member("Bo");
  await member("Cy", "Legal", "Annex");
  const siteId = (await host.meetupChoices()).sites.find((site) => site.name === "Harbour House")!.id;
  const preview = { seed: "draft-a", place: { kind: "physical" as const, siteId }, relevantInterests: [] };
  const suggestions = await host.previewInviteSuggestions(preview);
  expect(suggestions.map((suggestion) => suggestion.member.name)).toEqual(["Bo"]);
  expect(await host.previewInviteSuggestions(preview)).toEqual(suggestions);
  expect(await host.listMeetups()).toEqual([]);
});

test("Create confirms selected invitees atomically with the Meetup and sends their notices", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const boId = (await bo.profile()).memberId;
  const meetup = await host.createMeetup(await input(host, { audience: { kind: "invite-only" }, invitedMemberIds: [boId] }));
  expect(meetup.invites).toEqual([expect.objectContaining({ state: "pending", member: { memberId: boId, name: "Bo" } })]);
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("pending");
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ to: "bo@example.test" }));
});

test("an invalid selected invitee rolls back creation and new relevant Interests", async () => {
  const host = await setup();
  const cy = await member("Cy", "Legal", "Annex");
  const siteId = (await host.meetupChoices()).sites.find((site) => site.name === "Harbour House")!.id;
  await expect(host.createMeetup(await input(host, {
    place: { kind: "physical", siteId, spot: "Cafe" }, invitedMemberIds: [(await cy.profile()).memberId],
    relevantInterests: [{ phrase: "Chess", selection: { name: "Chess", kind: "hobby" } }],
  }))).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(await host.listMeetups()).toEqual([]);
  expect((await host.interests()).some((interest) => interest.name === "Chess")).toBe(false);
  expect(await cy.inbox()).toEqual([]);
});

test("Organisation Admin views of Suggestions are audited", async () => {
  const person = { sub: "olivia", name: "Olivia", email: "olivia@example.test" };
  await h.app.bootstrap({ ...withDepartmentAndSiteClaims(ministryA), organisationAdmin: person });
  const host = await signInAndAcknowledgeAs(h, "ministry-a", person);
  await member("Bo");
  await member("Cy", "Legal", "Annex");
  const meetup = await host.createMeetup(await input(host));
  await host.inviteSuggestions(meetup.id);
  await host.previewInviteSuggestions({ seed: "draft", place: { kind: "virtual" }, relevantInterests: [] });
  const { sites } = await host.meetupChoices();
  for (const site of sites) await host.previewInviteSuggestions({ seed: "draft", place: { kind: "physical", siteId: site.id }, relevantInterests: [] });
  await host.meetupSuggestions();
  const entries = await (await host.organisationAdmin()).auditLog();
  const actions = entries.map((entry) => entry.action);
  expect(actions).toEqual(expect.arrayContaining(["invite-suggestions", "invite-suggestions-preview", "meetup-suggestions"]));
  expect(entries.filter((entry) => entry.action === "invite-suggestions-preview").map((entry) => entry.filter)).toEqual(expect.arrayContaining([
    { placeKind: "virtual" }, ...sites.map((site) => ({ placeKind: "physical", siteId: site.id })),
  ]));
});
