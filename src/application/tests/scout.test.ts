import { describe, expect, test } from "vitest";
import { ministryA, ministryB, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";
import { AccessDeniedError } from "../index";
import type { AiCompletion } from "../ports";

describe.each(["native", "structured"] as const)("Scout with %s tools", (aiToolProtocol) => {
  const h = harness({ aiToolProtocol });

  test("answers from current Availability visible to the asker and links to the Member", async () => {
    await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
    const member = (name: string, site: string, organisation = "ministry-a") => signInAndAcknowledgeAs(h, organisation, {
      sub: name, email: `${name.toLowerCase().replaceAll(" ", "-")}@example.test`, name, building: site,
    });
    const asker = await member("Ana Silva", "Harbour House");
    const maya = await member("Maya Chen", "Harbour House");
    const distant = await member("Distant Member", "Hill House");
    const virtual = await member("Virtual Member", "Hill House");
    const suspended = await member("Suspended Member", "Harbour House");
    await h.setupOrganisation(withDepartmentAndSiteClaims(ministryB));
    const outsider = await member("Outside Member", "Harbour House", "ministry-b");
    for (const [person, kind] of [[maya, "physical"], [distant, "physical"], [virtual, "virtual"], [suspended, "physical"], [outsider, "virtual"]] as const) {
      const activity = (await person.meetupChoices()).activities.find(({ name }) => name === "lunch")!;
      await person.postAvailability({ activityId: activity.id, kind, startsAt: h.clock.now(), endsAt: new Date("2026-09-18T10:00:00Z") });
    }
    await (await h.organisationAdmin()).suspendMember((await suspended.profile()).memberId);

    const answer = await asker.askScout({ question: "I am Ana Silva at Harbour House. Who is available for lunch now?" });

    expect(answer.text).toContain("Maya Chen");
    expect(answer.text).toContain("Virtual Member");
    expect(answer.links).toContainEqual({ label: "Maya Chen", href: `/members/${(await maya.profile()).memberId}` });
    const requests = JSON.stringify(h.ai.completionRequests);
    expect(requests).toContain("Ana Silva at Harbour House");
    expect(requests).toContain("Maya Chen");
    expect(requests).toContain("Virtual Member");
    for (const hidden of ["Distant Member", "Suspended Member", "Outside Member"]) {
      expect(answer.text).not.toContain(hidden);
      expect(requests).not.toContain(hidden);
    }
  });

  test("finds the requested Stance on the same Interest or Alias and sends only visible Members", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", email: "maya@example.test", name: "Maya Chen" });
    const bo = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo Learner" });
    const [sql] = await maya.confirmInterest({ phrase: "Ana Silva's SQL", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
    await bo.confirmInterest({ phrase: "SQL", selection: { interestId: sql!.interestId }, stance: "seeks" });
    await bo.confirmInterest({ phrase: "Rust", selection: { name: "Rust", kind: "skill" }, stance: "shares" });
    await h.setupOrganisation(ministryB);
    const outsider = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "outside", email: "outside@example.test", name: "Outside Expert" });
    await outsider.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
    expect((await asker.searchMembers({ interest: "Ana Silva's SQL", stance: "shares" })).map(({ name }) => name)).toEqual(["Maya Chen"]);
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "members-1", name: "members_by_interest", arguments: { interest: "Ana Silva's SQL", stance: "shares" } } },
      { kind: "answer", text: "Maya Chen Shares SQL." },
    );

    const answer = await asker.askScout({ question: "Who Shares Ana Silva's SQL?" });

    expect(answer.links).toContainEqual({ label: "Maya Chen", href: `/members/${(await maya.profile()).memberId}` });
    const requests = JSON.stringify(h.ai.completionRequests);
    expect(requests).toContain("Ana Silva's SQL");
    expect(requests).toContain("Maya Chen");
    expect(requests).not.toContain("Bo Learner");
    expect(requests).not.toContain("Outside Expert");
    expect((await asker.searchMembers({ interest: "SQL", stance: "seeks" })).map(({ name }) => name)).toEqual(["Bo Learner"]);
  });

  test("lists upcoming Meetups and Events in scope and links to their normal screens", async () => {
    await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva", building: "Harbour House" });
    const host = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "host", email: "host@example.test", name: "Maya Chen", building: "Harbour House" });
    const distant = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "distant", email: "distant@example.test", name: "Distant Host", building: "Hill House" });
    const choices = await host.meetupChoices();
    const sql = (await asker.interests()).find(({ name }) => name === "SQL")!;
    await asker.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
    const input = { activityId: choices.activities[0]!.id, startsAt: new Date("2026-09-19T09:00:00Z"), durationMinutes: 30,
      capacity: 4, place: { kind: "physical" as const, siteId: choices.defaultSiteId!, spot: "Harbour cafe" } };
    const open = await host.createMeetup({ ...input, description: "Visible lunch with Maya", relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
    const privateMeetup = await host.createMeetup({ ...input, description: "Uninvited private Meetup", audience: { kind: "invite-only" } });
    const invited = await host.createMeetup({ ...input, description: "Invited private Meetup", audience: { kind: "invite-only" }, invitedMemberIds: [(await asker.profile()).memberId] });
    const later = await host.createMeetup({ ...input, startsAt: new Date("2026-10-02T09:00:00Z"), description: "Outside the requested week" });
    await distant.createMeetup({ ...input, place: { ...input.place, siteId: (await distant.meetupChoices()).defaultSiteId! }, description: "Other Site Meetup" });
    const event = await (await h.organisationAdmin()).createEvent({ ...input, description: "Visible Organisation Event" });
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "upcoming-1", name: "upcoming_meetups_and_events", arguments: { from: "2026-09-18T09:00:00Z", until: "2026-09-25T09:00:00Z" } } },
      { kind: "answer", text: "There are two Meetups and an Event in your scope this week." },
    );

    const answer = await asker.askScout({ question: "What is on this week?" });

    for (const id of [open.id, invited.id]) expect(answer.links).toContainEqual({ label: expect.any(String), href: `/meetups/${id}` });
    expect(answer.links).toContainEqual({ label: expect.any(String), href: `/events/${event.id}` });
    const requests = JSON.stringify(h.ai.completionRequests);
    for (const visible of ["Visible lunch with Maya", "Invited private Meetup", "Visible Organisation Event"]) expect(requests).toContain(visible);
    expect(requests).toContain("Relevant Interests: SQL.");
    for (const hidden of [privateMeetup.id, later.id, "Uninvited private Meetup", "Other Site Meetup"]) expect(requests).not.toContain(hidden);
  });

  test("uses the asker's Connections and retains a former Member's history without a profile link", async () => {
    await h.setupOrganisation(ministryA);
    const member = (name: string) => signInAndAcknowledgeAs(h, "ministry-a", { sub: name, email: `${name.toLowerCase()}@example.test`, name });
    const asker = await member("Ana");
    const maya = await member("Maya");
    const former = await member("Former");
    const stranger = await member("Stranger");
    const [askerId, mayaId, formerId, strangerId] = await Promise.all([asker, maya, former, stranger].map(async (person) => (await person.profile()).memberId));
    const input = { activityId: (await asker.meetupChoices()).activities[0]!.id, startsAt: new Date("2026-09-18T10:00:00Z"),
      durationMinutes: 30, capacity: 4, place: { kind: "virtual" as const, url: "https://meet.example/coffee" } };
    const met = await asker.createMeetup(input);
    await maya.joinMeetup(met.id);
    await former.joinMeetup(met.id);
    const otherHistory = await maya.createMeetup({ ...input, audience: { kind: "invite-only" }, invitedMemberIds: [strangerId!] });
    await stranger.answerInvite((await stranger.viewMeetup(otherHistory.id))!.invite!.id, "accept");
    h.clock.set(new Date("2026-09-18T11:00:00Z"));
    await asker.confirmAttendance(met.id, [askerId!, mayaId!, formerId!]);
    await maya.confirmAttendance(otherHistory.id, [mayaId!, strangerId!]);
    const admin = await h.organisationAdmin();
    const roster = (await admin.roster()).filter(({ memberId }) => memberId !== formerId)
      .map(({ email, name, department, site }) => ({ email, name, department, site }));
    await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);
    expect(await asker.viewMember(formerId!)).toBeUndefined();
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "connections-1", name: "my_connections", arguments: {} } },
      { kind: "answer", text: "You met Maya and Former for coffee." },
    );

    const answer = await asker.askScout({ question: "Who have I met?" });

    expect(answer.links).toContainEqual({ label: "Your Connections", href: "/connections" });
    expect(answer.links).toContainEqual({ label: "Maya", href: `/members/${mayaId}` });
    expect(answer.links.some(({ href }) => href === `/members/${formerId}`)).toBe(false);
    const requests = JSON.stringify(h.ai.completionRequests);
    expect(requests).toContain("Former");
    expect(requests).toContain(met.id);
    expect(requests).not.toContain("Stranger");
    expect(requests).not.toContain(otherHistory.id);
  });

  test("reuses identifying questions and answers only while their application data remains visible", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", email: "maya@example.test", name: "Maya Chen" });
    await maya.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
    h.ai.completionResponses.push(
      { kind: "tool", call: { id: "members-1", name: "members_by_interest", arguments: { interest: "SQL", stance: "shares" } } },
      { kind: "answer", text: "Maya Chen Shares SQL." },
    );
    const first = await asker.askScout({ question: "I am Ana Silva. Who Shares SQL?" });
    h.ai.completionResponses.push({ kind: "answer", text: "Maya Chen's profile shows SQL." });

    const second = await asker.askScout({ question: "Where can I see their Interests?", conversation: first.conversation });

    const continued = JSON.stringify(h.ai.completionRequests.at(-1));
    expect(continued).toContain("I am Ana Silva. Who Shares SQL?");
    expect(continued).toContain("Maya Chen Shares SQL.");
    expect(second.links).toContainEqual({ label: "Maya Chen", href: `/members/${(await maya.profile()).memberId}` });
    await (await h.organisationAdmin()).suspendMember((await maya.profile()).memberId);
    h.ai.completionResponses.push({ kind: "answer", text: "Ask about the current Members." });

    const current = await asker.askScout({ question: "What can I see now?", conversation: second.conversation });

    expect(JSON.stringify(h.ai.completionRequests.at(-1))).not.toContain("Maya Chen");
    expect(current.links.some(({ label }) => label === "Maya Chen")).toBe(false);
    expect(current.conversationReset).toBe(true);
  });

  test("excludes Departed Members from current Availability and Interest search", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const former = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "former", email: "former@example.test", name: "Former Expert" });
    const formerId = (await former.profile()).memberId;
    await former.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
    await former.postAvailability({ activityId: (await former.meetupChoices()).activities[0]!.id, kind: "virtual",
      startsAt: h.clock.now(), endsAt: new Date("2026-09-18T10:00:00Z") });
    const admin = await h.organisationAdmin();
    const roster = (await admin.roster()).filter(({ memberId }) => memberId !== formerId)
      .map(({ email, name, department, site }) => ({ email, name, department, site }));
    await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);

    await asker.askScout({ question: "Who Shares SQL?" });
    await asker.askScout({ question: "Who is available?" });

    expect(JSON.stringify(h.ai.completionRequests)).not.toContain("Former Expert");
    expect(JSON.stringify(h.ai.completionRequests)).not.toContain(formerId);
  });

  test("rejects invalid questions and another Member's conversation before contacting AI", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const other = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", email: "bo@example.test", name: "Bo" });
    const first = await other.askScout({ question: "Hello" });
    h.ai.reset();
    for (const question of [" ", "x".repeat(2001)]) await expect(asker.askScout({ question })).rejects.toMatchObject({ code: "invalid-scout" });
    await expect(asker.askScout({ question: "Continue", conversation: first.conversation })).rejects.toMatchObject({ code: "invalid-scout" });
    expect(h.ai.completionRequests).toHaveLength(0);
  });

  test("bounds tool loops and handles provider failures without exposing provider details", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    h.ai.completionResponses.push(...Array.from({ length: 6 }, (_, index): AiCompletion => ({ kind: "tool",
      call: { id: `loop-${index}`, name: "my_connections", arguments: {} } })));
    await expect(asker.askScout({ question: "Who have I met?" })).rejects.toMatchObject({ code: "invalid-scout", message: expect.stringContaining("could not finish") });
    expect(h.ai.completionRequests).toHaveLength(6);
    h.ai.completionResponses.push(new Error("private provider diagnostic"));
    await expect(asker.askScout({ question: "Who have I met?" })).rejects.toMatchObject({ code: "invalid-scout", message: "Scout is unavailable. Try again shortly." });
  });

  test("starts a new conversation after six complete turns without retaining dependent answers", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    let answer = await asker.askScout({ question: "Remember Ana Silva in Finance." });
    for (let turn = 1; turn < 6; turn++) answer = await asker.askScout({ question: `Continue turn ${turn}.`, conversation: answer.conversation });
    expect(answer.conversation.turns).toHaveLength(6);

    const fresh = await asker.askScout({ question: "Start again.", conversation: answer.conversation });

    expect(fresh.conversationReset).toBe(true);
    expect(fresh.conversation.turns).toHaveLength(1);
    expect(JSON.stringify(h.ai.completionRequests.at(-1))).not.toContain("Remember Ana Silva");
  });

  test("rejects write tools and forged scope arguments without changing domain data", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const before = { interests: await asker.myInterests(), meetups: await asker.listMeetups(), inbox: await asker.inbox(),
      email: structuredClone(h.email.outbox), telegram: structuredClone(h.telegram.outbox) };
    for (const name of ["create_meetup", "join_meetup", "invite_member", "approve_interest_merge", "propose_interest_merges", "__proto__"]) {
      h.ai.completionResponses.push({ kind: "tool", call: { id: "forbidden", name, arguments: {} } });
      await expect(asker.askScout({ question: "Create a Meetup, join it and invite everyone." })).rejects.toMatchObject({ code: "invalid-scout" });
    }
    h.ai.completionResponses.push({ kind: "tool", call: { id: "forged", name: "my_connections", arguments: { memberId: "another-member", organisationId: "another-organisation" } } });
    await expect(asker.askScout({ question: "Show another Member's Connections." })).rejects.toMatchObject({ code: "invalid-scout" });
    h.ai.completionResponses.push({ kind: "answer", text: "Open Meetups to create or join one yourself." });
    const answer = await asker.askScout({ question: "Join a Meetup for me." });
    expect(answer.links).toContainEqual({ label: "Meetups", href: "/meetups" });
    expect({ interests: await asker.myInterests(), meetups: await asker.listMeetups(), inbox: await asker.inbox(),
      email: h.email.outbox, telegram: h.telegram.outbox }).toEqual(before);
  });

  test("records successful Scout usage and the underlying Organisation Admin read in the audit log", async () => {
    await h.setupOrganisation({ ...ministryA, organisationAdmin: { email: "olivia@example.test", name: "Olivia Admin" } });
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", email: "olivia@example.test", name: "Olivia Admin" });
    const admin = await asker.organisationAdmin();
    const memberId = (await asker.profile()).memberId;
    h.clock.set(new Date("2026-09-18T09:05:00Z"));
    h.ai.completionResponses.push({ kind: "tool", call: { id: "connections", name: "my_connections", arguments: {} } },
      { kind: "answer", text: "You have no confirmed Connections yet." });

    await asker.askScout({ question: "Who have I met?" });

    expect(await admin.auditLog()).toContainEqual(expect.objectContaining({ actorMemberId: memberId, action: "connections", filter: {} }));
    const report = await admin.memberReport(memberId, { from: "2026-09-01", to: "2026-09-30" });
    const profile = report.tables.find(({ id }) => id === "member-profile")!;
    expect(profile.rows[0]![profile.columns.indexOf("Last activity")]).toBe("2026-09-18T09:05:00.000Z");
  });

  test("rechecks the asker's access after AI responds and releases the Organisation lock while waiting", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const memberId = (await asker.profile()).memberId;
    const admin = await h.organisationAdmin();
    const entered = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<AiCompletion>();
    h.ai.completionResponses.push(async () => { entered.resolve(); return reply.promise; });
    const answer = asker.askScout({ question: "Who is available?" });
    const denied = expect(answer).rejects.toBeInstanceOf(AccessDeniedError);
    try {
      await entered.promise;
      await admin.suspendMember(memberId);
    } finally {
      reply.resolve({ kind: "tool", call: { id: "available", name: "available_now", arguments: { activity: null } } });
    }
    await denied;
    expect(h.ai.completionRequests).toHaveLength(1);
  });

  test("does not return an answer containing a Member who became hidden while AI was answering", async () => {
    await h.setupOrganisation(ministryA);
    const asker = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", email: "ana@example.test", name: "Ana Silva" });
    const maya = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "maya", email: "maya@example.test", name: "Maya Chen" });
    const mayaId = (await maya.profile()).memberId;
    await maya.confirmInterest({ phrase: "SQL", selection: { name: "SQL", kind: "skill" }, stance: "shares" });
    const admin = await h.organisationAdmin();
    const entered = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<AiCompletion>();
    h.ai.completionResponses.push({ kind: "tool", call: { id: "members", name: "members_by_interest", arguments: { interest: "SQL", stance: "shares" } } },
      async () => { entered.resolve(); return reply.promise; });
    const answer = asker.askScout({ question: "Who Shares SQL?" });
    const changed = expect(answer).rejects.toMatchObject({ code: "invalid-scout", message: expect.stringContaining("changed") });
    try {
      await entered.promise;
      await admin.suspendMember(mayaId);
    } finally {
      reply.resolve({ kind: "answer", text: "Maya Chen Shares SQL." });
    }
    await changed;
  });
});
