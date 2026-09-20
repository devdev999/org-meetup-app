import { expect, test } from "vitest";
import { AccessDeniedError, InvalidInputError } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();
const adminPerson = { email: "olivia@example.test", name: "Olivia Admin" };

async function member(name: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub: name, email: `${name}@example.test`, name });
}

async function setup() {
  await h.app.bootstrap({ ...ministryA, organisation: { ...ministryA.organisation, sites: ["Harbour House", "Annex"] }, organisationAdmin: adminPerson });
  const adminMember = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  const ana = await member("ana");
  const choices = await ana.meetupChoices();
  return { ana, adminMember, admin: await adminMember.organisationAdmin(), input: {
    activityId: choices.activities.find((entry) => entry.name === "learning session")!.id,
    startsAt: new Date("2026-09-25T10:00:00Z"), durationMinutes: 60,
    place: { kind: "physical" as const, siteId: choices.sites[0]!.id, spot: "Main room" },
    description: "A lunchtime talk",
  } };
}

test("an Event proposal stays private until an Organisation Admin publishes it with its proposer as Host", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const proposal = await ana.proposeEvent(input);
  expect(proposal).toMatchObject({ state: "proposed", note: null, proposer: { memberId: (await ana.profile()).memberId } });
  expect(await ana.eventProposals()).toEqual([proposal]);
  expect(await admin.eventProposals()).toEqual([proposal]);
  expect(await bo.eventProposals()).toEqual([]);
  expect(await bo.listEvents()).toEqual([]);
  expect(await bo.viewEvent(proposal.id)).toBeUndefined();
  await admin.approveEvent(proposal.id, "Room booking confirmed.");
  const event = await bo.viewEvent(proposal.id);
  expect(event).toMatchObject({ kind: "event", host: { memberId: (await ana.profile()).memberId }, capacity: null, audience: { kind: "open", scope: "organisation" }, participantCount: 1 });
  expect((await bo.listEvents()).map((entry) => entry.id)).toEqual([proposal.id]);
  expect(await bo.listMeetups()).toEqual([]);
  expect((await ana.eventProposals())[0]).toMatchObject({ state: "approved", note: "Room booking confirmed." });
});

test("admin Event management includes private and past published Events, excludes proposals and other Organisations, and records the view", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const pending = await ana.proposeEvent(input);
  const approved = await ana.proposeEvent({ ...input, audience: { kind: "invite-only" } });
  await admin.approveEvent(approved.id);
  expect((await ana.eventInviteChoices(approved.id)).members.map((entry) => entry.name)).toContain("bo");
  await expect(ana.inviteChoices(approved.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(bo.eventInviteChoices(approved.id)).rejects.toBeInstanceOf(AccessDeniedError);
  h.clock.set(new Date("2026-09-26T10:00:00Z"));
  expect(await admin.events()).toMatchObject([{ id: approved.id, kind: "event", host: { name: "ana" }, status: "scheduled" }]);
  expect((await admin.events()).some((entry) => entry.id === pending.id)).toBe(false);
  expect((await admin.auditLog()).some((entry) => entry.action === "events")).toBe(true);
  await h.app.bootstrap({ ...ministryB, organisationAdmin: adminPerson });
  const otherAdmin = await (await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other-admin", ...adminPerson })).organisationAdmin();
  expect(await otherAdmin.events()).toEqual([]);
});

test("only the Organisation Admin can reject an Event proposal and the proposer sees the note", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  await h.app.bootstrap({ ...ministryB, organisationAdmin: adminPerson });
  const otherAdmin = await (await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other-admin", ...adminPerson })).organisationAdmin();
  const proposal = await ana.proposeEvent({ ...input, recurrence: { frequency: "weekly" } });
  await expect(ana.organisationAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(otherAdmin.rejectEvent(proposal.id, "Outside decision")).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(admin.rejectEvent(proposal.id, " ")).rejects.toBeInstanceOf(InvalidInputError);
  await admin.rejectEvent(proposal.id, "Please choose a different time.");
  await admin.rejectEvent(proposal.id, "Please choose a different time.");
  expect((await ana.eventProposals())[0]).toMatchObject({ state: "rejected", note: "Please choose a different time." });
  await expect(admin.approveEvent(proposal.id)).rejects.toBeInstanceOf(InvalidInputError);
  await h.app.processRecurrences();
  expect(await bo.listEvents()).toEqual([]);
  expect(await ana.listSeries()).toEqual([]);
  expect(await ana.viewEvent(proposal.id)).toBeUndefined();
  expect(h.email.outbox).toEqual([]);
});

test("proposal publication cannot be bypassed by ordinary participation commands or another Organisation", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const boId = (await bo.profile()).memberId;
  const proposal = await ana.proposeEvent({ ...input, recurrence: { frequency: "weekly" } });
  for (const decide of [async () => {}, () => admin.rejectEvent(proposal.id, "Not this week.")]) {
    await decide();
    expect(await ana.viewMeetup(proposal.id)).toBeUndefined();
    expect(await ana.viewEvent(proposal.id)).toBeUndefined();
    for (const action of [
      () => ana.joinMeetup(proposal.id), () => ana.joinEvent(proposal.id),
      () => ana.editEvent(proposal.id, input), () => ana.cancelEvent(proposal.id),
      () => ana.inviteToEvent(proposal.id, boId), () => ana.eventInviteChoices(proposal.id),
      () => ana.eventInviteSuggestions(proposal.id), () => ana.answerRsvp(proposal.id, "going"),
    ]) await expect(action()).rejects.toBeInstanceOf(AccessDeniedError);
  }
  const event = await admin.createEvent(input);
  await expect(ana.joinMeetup(event.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await h.app.bootstrap({ ...ministryB, organisationAdmin: adminPerson });
  const outsider = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "outside", ...adminPerson });
  const otherAdmin = await outsider.organisationAdmin();
  expect(await outsider.viewEvent(event.id)).toBeUndefined();
  expect(await outsider.listEvents()).toEqual([]);
  expect(await outsider.eventSuggestions()).toEqual([]);
  for (const action of [() => outsider.joinEvent(event.id), () => otherAdmin.approveEvent(proposal.id), () => otherAdmin.reassignEventHost(event.id, boId)]) {
    await expect(action()).rejects.toBeInstanceOf(AccessDeniedError);
  }
});

test.each(["departed proposer", "retired Activity", "past start"] as const)("approval rechecks %s before creating any recurrence, seat or Invite", async (change) => {
  const { ana, admin, input } = await setup();
  const proposal = await ana.proposeEvent({ ...input, recurrence: { frequency: "weekly" } });
  if (change === "departed proposer") {
    const rows = (await admin.roster()).filter((entry) => entry.email !== "ana@example.test");
    await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  } else if (change === "retired Activity") await admin.retireListEntry("activity", input.activityId);
  else h.clock.set(input.startsAt);
  await expect(admin.approveEvent(proposal.id)).rejects.toBeInstanceOf(change === "departed proposer" ? AccessDeniedError : InvalidInputError);
  expect((await admin.eventProposals())[0]).toMatchObject({ state: "proposed" });
  expect(await admin.events()).toEqual([]);
  await h.app.processRecurrences();
  expect(h.email.outbox).toEqual([]);
});

test("retained admin actors recheck authority for Event decisions and management", async () => {
  const { ana, admin, input } = await setup();
  const proposal = await ana.proposeEvent(input);
  const rows = (await admin.roster()).filter((entry) => entry.email !== adminPerson.email);
  await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  for (const action of [() => admin.approveEvent(proposal.id), () => admin.rejectEvent(proposal.id, "Rejected"), () => admin.eventProposals(), () => admin.events(), () => admin.createEvent(input)]) {
    await expect(action()).rejects.toBeInstanceOf(AccessDeniedError);
  }
  expect((await ana.eventProposals())[0]).toMatchObject({ state: "proposed" });
});

test("Event capacity can be removed to promote its waitlist and cannot undercut existing Participants", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const proposal = await ana.proposeEvent({ ...input, capacity: 2 });
  await admin.approveEvent(proposal.id);
  await bo.joinEvent(proposal.id);
  expect(await cy.joinEvent(proposal.id)).toBe("waitlisted");
  await expect(ana.editEvent(proposal.id, { ...input, capacity: 1 })).rejects.toBeInstanceOf(InvalidInputError);
  await ana.editEvent(proposal.id, { ...input, capacity: null });
  expect(await cy.viewEvent(proposal.id)).toMatchObject({ membership: "participant", capacity: null, participantCount: 3 });
  await expect(ana.editEvent(proposal.id, { ...input, capacity: 2 })).rejects.toBeInstanceOf(InvalidInputError);
  await ana.editEvent(proposal.id, { ...input, capacity: 3 });
  const nextHost = await member("new-host");
  await admin.reassignEventHost(proposal.id, (await nextHost.profile()).memberId);
  expect(await nextHost.viewEvent(proposal.id)).toMatchObject({ membership: "host", participantCount: 3 });
  expect(await nextHost.joinEvent(proposal.id)).toBe("waitlisted");
  await bo.leaveEvent(proposal.id);
  expect(await nextHost.viewEvent(proposal.id)).toMatchObject({ participantCount: 3, waitlist: [], participants: expect.arrayContaining([expect.objectContaining({ name: "new-host" })]) });
});

test("an Organisation Admin creates an uncapped Event that Members across Sites can join beyond thirty places", async () => {
  const { adminMember, admin, input } = await setup();
  const event = await admin.createEvent(input);
  expect(event).toMatchObject({ kind: "event", capacity: null, host: { memberId: (await adminMember.profile()).memberId } });
  for (let index = 0; index < 31; index++) {
    const participant = await member(`participant-${index}`);
    await participant.updateProfile({ department: null, site: index % 2 ? "Annex" : "Harbour House" });
    expect(await participant.joinEvent(event.id)).toBe("participant");
  }
  expect(await adminMember.viewEvent(event.id)).toMatchObject({ participantCount: 32, waitlist: [] });
  expect(await adminMember.eventProposals()).toEqual([]);
});

test.each([false, true])("daily digests label Event notices and mixed notices correctly, mixed: %s", async (mixed) => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const proposal = await ana.proposeEvent(input);
  await admin.approveEvent(proposal.id);
  await bo.joinEvent(proposal.id);
  await bo.leaveEvent(proposal.id);
  if (mixed) {
    const meetup = await ana.createMeetup({ ...input, capacity: 3, audience: { kind: "open", scope: "organisation" } });
    await bo.joinMeetup(meetup.id);
    await bo.leaveMeetup(meetup.id);
  }
  h.email.reset();
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "ana@example.test", subject: mixed ? "Daily Meetup and Event digest" : "Daily Event digest", text: expect.stringContaining("bo left your Event.") })]);
});

test("approval activates Event recurrence once, with shared standing membership, RSVP and cancellation notices", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const proposal = await ana.proposeEvent({ ...input, capacity: 2, recurrence: { frequency: "weekly", endsOn: "2026-10-02" } });
  await h.app.processRecurrences();
  expect(await bo.listEvents()).toEqual([]);
  expect(await ana.listEventSeries()).toEqual([]);
  expect(h.email.outbox).toEqual([]);
  await admin.approveEvent(proposal.id);
  await admin.approveEvent(proposal.id);
  const first = (await ana.viewEvent(proposal.id))!;
  await bo.joinSeries(first.recurrence!.id);
  h.clock.set(new Date("2026-09-18T10:00:00Z"));
  await h.app.processRecurrences();
  expect((await bo.listEvents()).map((event) => [event.startsAt.toISOString(), event.membership])).toEqual([
    ["2026-09-25T10:00:00.000Z", "participant"], ["2026-10-02T10:00:00.000Z", "participant"],
  ]);
  expect(await bo.listMeetups()).toEqual([]);
  expect(await bo.listEventSeries()).toMatchObject([{ id: first.recurrence!.id, kind: "event", standingCount: 2 }]);
  h.email.reset();
  h.clock.set(new Date("2026-09-23T10:00:00Z"));
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.email.outbox).toHaveLength(2);
  expect(h.email.outbox.every((notice) => notice.subject === "Event notice" && notice.text.startsWith("Are you going to this Event?"))).toBe(true);
  await bo.answerRsvp(first.id, "not-going");
  expect(await bo.viewEvent(first.id)).toMatchObject({ participantCount: 1, membership: null, rsvp: "not-going", recurrence: { isStanding: true } });
  await ana.stopSeries(first.recurrence!.id);
  expect((await bo.listEvents()).every((event) => event.status === "cancelled")).toBe(true);
  expect((await bo.inbox()).filter((notice) => notice.kind === "meetup-cancelled").every((notice) => notice.eventId && notice.message.startsWith("The Host cancelled this Event."))).toBe(true);
});

test("an admin can reassign an Event Host after it starts without changing past participation or the proposer", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const proposal = await ana.proposeEvent(input);
  await admin.approveEvent(proposal.id);
  await bo.joinEvent(proposal.id);
  h.clock.set(new Date("2026-09-25T12:00:00Z"));
  await admin.reassignEventHost(proposal.id, (await cy.profile()).memberId);
  const event = await cy.viewEvent(proposal.id);
  expect(event).toMatchObject({ host: { name: "cy" }, membership: "host", participantCount: 2, participants: [{ name: "ana" }, { name: "bo" }] });
  expect((await ana.eventProposals())[0]).toMatchObject({ state: "approved", proposer: { name: "ana" } });
  expect((await cy.inbox())[0]).toMatchObject({ eventId: proposal.id, message: expect.stringContaining("cy is now Host of this Event.") });
  await admin.reassignEventHost(proposal.id, (await cy.profile()).memberId);
  expect((await cy.inbox()).filter((notice) => notice.kind === "meetup-handed-over")).toHaveLength(1);
});

test("Event Suggestions use relevant Interests and physical invitee eligibility only after approval", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const placeSite = (await ana.meetupChoices()).sites.find((site) => site.id === input.place.siteId)!;
  await bo.updateProfile({ department: null, site: placeSite.name });
  await cy.updateProfile({ department: null, site: placeSite.name === "Annex" ? "Harbour House" : "Annex" });
  const sql = (await ana.interests()).find((interest) => interest.name === "SQL")!;
  await bo.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  await cy.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  const proposal = await ana.proposeEvent({ ...input, relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] });
  expect(await bo.eventSuggestions()).toEqual([]);
  await admin.approveEvent(proposal.id);
  expect(await bo.eventSuggestions()).toMatchObject([{ event: { id: proposal.id, kind: "event" }, reasons: expect.arrayContaining(["Relevant Interests: SQL."]) }]);
  expect((await cy.eventSuggestions())[0]?.event.id).toBe(proposal.id);
  expect((await ana.eventInviteSuggestions(proposal.id)).map((suggestion) => suggestion.member.name)).toEqual(["bo"]);
  await ana.inviteSuggestedMemberToEvent(proposal.id, (await bo.profile()).memberId);
  expect(await ana.eventInviteSuggestions(proposal.id)).toEqual([]);
  await expect(bo.eventInviteSuggestions(proposal.id)).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await bo.meetupSuggestions()).toEqual([]);
});

test.each(["proposal", "direct"] as const)("%s Event creation accepts edited extracted Interests and keeps manual creation available after extraction failure", async (mode) => {
  const { ana, adminMember, admin, input } = await setup();
  const host = mode === "proposal" ? ana : adminMember;
  const sql = (await host.interests()).find((interest) => interest.name === "SQL")!;
  h.ai.extractionResponses.push([{ phrase: "Rust", kind: "skill" }, { phrase: "Python", kind: "skill" }]);
  const description = "Ask Ana about Rust and Python.";
  const extracted = await host.extractEventInterests({ activityId: input.activityId, description });
  expect(extracted.map((entry) => entry.phrase)).toEqual(["Rust", "Python"]);
  expect(h.ai.extractionRequests).toEqual([{ activity: "learning session", description }]);
  expect((await host.interests()).some((interest) => interest.name === "Python")).toBe(false);
  const data = { ...input, description, relevantInterests: [
    { phrase: "SQL", selection: { interestId: sql.interestId } },
    { phrase: "Python", selection: { name: "Python basics", kind: "skill" as const } },
  ] };
  const event = mode === "proposal" ? await ana.proposeEvent(data) : await admin.createEvent(data);
  expect(event.relevantInterests.map((interest) => interest.name)).toEqual(["Python basics", "SQL"]);
  expect(await host.myInterests()).toEqual([]);
  h.ai.extractionResponses.push(new Error("Timed out"));
  expect(await host.extractEventInterests({ activityId: input.activityId, description })).toEqual([]);
  const manual = { ...input, relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] };
  const saved = mode === "proposal" ? await ana.proposeEvent(manual) : await admin.createEvent(manual);
  expect(saved.relevantInterests).toEqual([sql]);
});

test("Telegram Event actions join and answer RSVP while Event notices use the correct buttons and wording", async () => {
  const { ana, admin, input } = await setup();
  const bo = await member("bo");
  const link = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "102", code: new URL(link.url).searchParams.get("start")! });
  const proposal = await ana.proposeEvent({ ...input, recurrence: { frequency: "weekly" } });
  await admin.approveEvent(proposal.id);
  const event = (await ana.viewEvent(proposal.id))!;
  await h.app.handleTelegram({ kind: "join-event", chatId: "102", callbackId: "join", eventId: event.id });
  expect(h.telegram.answers).toContainEqual({ callbackId: "join", text: "You joined the Event." });
  await bo.joinSeries(event.recurrence!.id);
  h.telegram.reset();
  h.clock.set(new Date("2026-09-23T10:00:00Z"));
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toEqual([{ chatId: "102", text: "Are you going to this Event? learning session, 2026-09-25 10:00 UTC, Main room, Annex.", rsvpEventId: event.id }]);
  await h.app.handleTelegram({ kind: "answer-event-rsvp", chatId: "102", callbackId: "skip", eventId: event.id, answer: "not-going" });
  expect(await bo.viewEvent(event.id)).toMatchObject({ rsvp: "not-going", membership: null, recurrence: { isStanding: true } });
  await h.app.handleTelegram({ kind: "answer-event-rsvp", chatId: "102", callbackId: "return", eventId: event.id, answer: "going" });
  expect(await bo.viewEvent(event.id)).toMatchObject({ rsvp: "going", membership: "participant" });
});
