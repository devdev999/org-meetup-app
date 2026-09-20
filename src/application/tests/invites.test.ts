import { expect, test } from "vitest";
import type { MemberActions } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

async function member(name: string, organisation = "ministry-a") {
  return signInAndAcknowledgeAs(h, organisation, {
    sub: name, email: `${name.toLowerCase()}@example.test`, name: `${name} Member`,
  });
}

async function setup() {
  await h.app.bootstrap(ministryA);
  return member("Ana");
}

async function createMeetup(host: MemberActions, inviteOnly = true) {
  return host.createMeetup({
    activityId: (await host.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, capacity: 2,
    audience: inviteOnly ? { kind: "invite-only" } : { kind: "open", scope: "organisation" },
  });
}

test("a Host invites a Member to a private Meetup and only the invitee gains access", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await createMeetup(host);
  expect(await bo.viewMeetup(meetup.id)).toBeUndefined();
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  expect(invite).toMatchObject({ state: "pending", meetupId: meetup.id, member: { name: "Bo Member" } });
  expect((await bo.listMeetups()).map((entry) => entry.id)).toEqual([meetup.id]);
  expect(await bo.viewMeetup(meetup.id)).toMatchObject({ invite, invites: null, membership: null });
  expect((await host.viewMeetup(meetup.id))?.invites).toEqual([invite]);
  expect(await cy.viewMeetup(meetup.id)).toBeUndefined();
  expect(await cy.listMeetups()).toEqual([]);
  expect(await bo.inbox()).toContainEqual(expect.objectContaining({ kind: "invite-received", meetupId: meetup.id }));
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ to: "bo@example.test", text: expect.stringContaining("https://meet.example/coffee") }));
  expect(await host.inviteMember(meetup.id, (await bo.profile()).memberId)).toEqual(invite);
  expect(await bo.inbox()).toHaveLength(1);
});

test("only the invitee can answer, accepting seats them and declining records the answer once", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await createMeetup(host);
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  await expect(host.answerInvite(invite.id, "accept")).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(cy.answerInvite(invite.id, "decline")).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(bo.joinMeetup(meetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  expect(await bo.answerInvite(invite.id, "accept")).toMatchObject({ state: "accepted", membership: "participant" });
  expect(await bo.viewMeetup(meetup.id)).toMatchObject({ membership: "participant", invite: { state: "accepted" } });
  await bo.answerInvite(invite.id, "accept");
  await expect(bo.answerInvite(invite.id, "decline")).rejects.toMatchObject({ code: "invalid-meetup" });
  const declined = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  expect(await cy.answerInvite(declined.id, "decline")).toMatchObject({ state: "declined", membership: null });
  await cy.answerInvite(declined.id, "decline");
  expect((await cy.viewMeetup(meetup.id))?.membership).toBeNull();
  expect((await host.inbox()).map((notice) => notice.kind)).toEqual(["invite-declined", "invite-accepted"]);
  const inbox = await cy.inbox();
  expect(await host.inviteMember(meetup.id, (await cy.profile()).memberId)).toMatchObject({ id: declined.id, state: "declined" });
  expect(await cy.inbox()).toEqual(inbox);
});

test("an invited Participant can become Host and retry their answer while pending invitees hear about the handover", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await createMeetup(host);
  const boId = (await bo.profile()).memberId;
  const accepted = await host.inviteMember(meetup.id, boId);
  await bo.answerInvite(accepted.id, "accept");
  const pending = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  await host.handOverMeetup(meetup.id, boId);
  expect(await bo.answerInvite(accepted.id, "accept")).toMatchObject({ state: "accepted", membership: "participant" });
  expect(await bo.viewMeetup(meetup.id)).toMatchObject({ membership: "host", invite: { id: accepted.id } });
  expect((await bo.viewMeetup(meetup.id))?.invites).toHaveLength(2);
  expect((await host.viewMeetup(meetup.id))?.invites).toBeNull();
  expect((await cy.inbox())[0]?.kind).toBe("meetup-handed-over");
  await cy.answerInvite(pending.id, "accept");
  expect((await bo.inbox()).filter((notice) => notice.kind === "invite-accepted")).toHaveLength(1);
  expect((await host.inbox()).filter((notice) => notice.kind === "invite-accepted")).toHaveLength(1);
});

test.each([["accept", "accepted"], ["decline", "declined"]] as const)("answering %s keeps an independently joined place", async (answer, state) => {
  const host = await setup();
  const bo = await member("Bo");
  const meetup = await createMeetup(host, false);
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  await bo.joinMeetup(meetup.id);
  expect(await bo.answerInvite(invite.id, answer)).toMatchObject({ state, membership: "participant" });
  expect((await host.viewMeetup(meetup.id))?.participantCount).toBe(2);
  if (answer === "decline") expect((await host.inbox())[0]?.message).toContain("They remain a Participant.");
});

test("declining an Invite keeps an independent waitlist entry and tells the Host that the Member is still waiting", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await createMeetup(host, false);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  const invite = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  expect(await cy.answerInvite(invite.id, "decline")).toMatchObject({ state: "declined", membership: "waitlisted" });
  expect((await host.inbox())[0]?.message).toContain("They remain on the waitlist.");
  await bo.leaveMeetup(meetup.id);
  expect((await cy.viewMeetup(meetup.id))?.membership).toBe("participant");
});

test("accepting moves an invitee to the front of a full Meetup's waitlist, including an existing joiner", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const ev = await member("Ev");
  const meetup = await createMeetup(host, false);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await di.joinMeetup(meetup.id);
  const evInvite = await host.inviteMember(meetup.id, (await ev.profile()).memberId);
  expect(await ev.answerInvite(evInvite.id, "accept")).toMatchObject({ membership: "waitlisted" });
  expect((await host.viewMeetup(meetup.id))?.waitlist?.map((person) => person.name)).toEqual(["Ev Member", "Cy Member", "Di Member"]);
  const diInvite = await host.inviteMember(meetup.id, (await di.profile()).memberId);
  await di.answerInvite(diInvite.id, "accept");
  await ev.answerInvite(evInvite.id, "accept");
  expect((await host.viewMeetup(meetup.id))?.waitlist?.map((person) => person.name)).toEqual(["Di Member", "Ev Member", "Cy Member"]);
  await bo.leaveMeetup(meetup.id);
  expect((await di.viewMeetup(meetup.id))?.membership).toBe("participant");
  await di.leaveMeetup(meetup.id);
  expect((await ev.viewMeetup(meetup.id))?.membership).toBe("participant");
  await ev.leaveMeetup(meetup.id);
  expect((await cy.viewMeetup(meetup.id))?.membership).toBe("participant");
});

test("the worker expires unanswered Invites at the current start time without changing answers", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await createMeetup(host);
  const pending = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  const declined = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  await cy.answerInvite(declined.id, "decline");
  h.clock.set(new Date("2026-09-18T09:59:59Z"));
  await h.app.expireInvites();
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("pending");
  h.clock.set(meetup.startsAt);
  await expect(bo.answerInvite(pending.id, "accept")).rejects.toMatchObject({ code: "invalid-meetup" });
  await h.app.expireInvites();
  await h.app.expireInvites();
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("expired");
  expect((await cy.viewMeetup(meetup.id))?.invite?.state).toBe("declined");
  expect((await host.viewMeetup(meetup.id))?.participantCount).toBe(1);
});

test("pending invitees receive changes and cancellations, and expiry follows an edited start time", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const meetup = await createMeetup(host);
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  await host.editMeetup(meetup.id, {
    startsAt: new Date("2026-09-18T11:00:00Z"), durationMinutes: meetup.durationMinutes,
    place: meetup.place, capacity: meetup.capacity,
  });
  expect((await bo.inbox()).map((notice) => notice.kind)).toEqual(["meetup-edited", "invite-received"]);
  h.clock.set(meetup.startsAt);
  await h.app.expireInvites();
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("pending");
  await host.cancelMeetup(meetup.id);
  expect(await bo.viewMeetup(meetup.id)).toMatchObject({ status: "cancelled", invite: { state: "expired" } });
  expect((await bo.inbox())[0]?.kind).toBe("meetup-cancelled");
  await expect(bo.answerInvite(invite.id, "accept")).rejects.toMatchObject({ code: "invalid-meetup" });
});

test("a Provisioned Member receives an Invite by email and can answer after their first login", async () => {
  const host = await setup();
  const provisioned = (await host.searchMembers()).find((candidate) => candidate.name === ministryA.platformAdmin.name)!;
  const meetup = await createMeetup(host);
  const invite = await host.inviteMember(meetup.id, provisioned.memberId);
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ to: ministryA.platformAdmin.email, text: expect.stringContaining("invited you") }));
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  expect((await pat.viewMeetup(meetup.id))?.invite?.id).toBe(invite.id);
  expect(await pat.answerInvite(invite.id, "accept")).toMatchObject({ state: "accepted", membership: "participant" });
});

test("Invites cannot cross Organisations, be sent by another Member or target the Host", async () => {
  const host = await setup();
  await h.app.bootstrap(ministryB);
  const bo = await member("Bo");
  const outsider = await member("Cy", "ministry-b");
  const meetup = await createMeetup(host, false);
  const boId = (await bo.profile()).memberId;
  await expect(bo.inviteMember(meetup.id, (await host.profile()).memberId)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(host.inviteMember(meetup.id, (await outsider.profile()).memberId)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(outsider.inviteMember(meetup.id, boId)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(host.inviteMember(meetup.id, "invalid-id")).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(host.inviteMember(meetup.id, (await host.profile()).memberId)).rejects.toMatchObject({ code: "invalid-meetup" });
  const invite = await host.inviteMember(meetup.id, boId);
  await expect(outsider.answerInvite(invite.id, "accept")).rejects.toMatchObject({ name: "AccessDeniedError" });
  expect(await outsider.viewMeetup(meetup.id)).toBeUndefined();
  expect(await outsider.inbox()).toEqual([]);
  expect((await bo.viewMeetup(meetup.id))?.invite?.state).toBe("pending");
});

test("only the Host can list Invite choices, including Provisioned and waitlisted Members", async () => {
  const host = await setup();
  await h.app.bootstrap(ministryB);
  await member("Outside", "ministry-b");
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const meetup = await createMeetup(host, false);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await host.inviteMember(meetup.id, (await di.profile()).memberId);
  expect((await host.inviteChoices(meetup.id)).members).toEqual([
    { memberId: (await cy.profile()).memberId, name: "Cy Member" },
    { memberId: (await host.searchMembers()).find((candidate) => candidate.name === "Pat Platform")!.memberId, name: "Pat Platform" },
  ]);
  await expect(bo.inviteChoices(meetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  expect((await host.inviteChoices(meetup.id)).members.map((candidate) => candidate.name)).toEqual(["Pat Platform"]);
});

test("an Organisation Admin's Invite choices record access in the audit log", async () => {
  const person = { sub: "olivia", name: "Olivia Admin", email: "olivia@example.test" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: person });
  const host = await signInAndAcknowledgeAs(h, "ministry-a", person);
  const meetup = await createMeetup(host);
  await host.inviteChoices(meetup.id);
  expect(await (await host.organisationAdmin()).auditLog()).toContainEqual(expect.objectContaining({
    actorMemberId: (await host.profile()).memberId, action: "meetup-invite-choices", filter: { meetupId: meetup.id, name: "", page: "0" },
  }));
});

test("a Host can narrow Invite choices by a case-insensitive literal name", async () => {
  const host = await setup();
  const bo = await member("Bo");
  await member("Cy");
  const meetup = await createMeetup(host);
  expect(await host.inviteChoices(meetup.id, { name: " BO " })).toEqual({
    members: [{ memberId: (await bo.profile()).memberId, name: "Bo Member" }], hasMore: false,
  });
  expect(await host.inviteChoices(meetup.id, { name: "%" })).toEqual({ members: [], hasMore: false });
});

test("Invite choices use stable pages of twenty Members without losing later matches", async () => {
  const host = await setup();
  for (let index = 1; index <= 21; index++) await member(`Candidate${String(index).padStart(2, "0")}`);
  const meetup = await createMeetup(host);
  const first = await host.inviteChoices(meetup.id, { name: "Candidate" });
  expect(first.members).toHaveLength(20);
  expect(first.members[0]?.name).toBe("Candidate01 Member");
  expect(first.members.at(-1)?.name).toBe("Candidate20 Member");
  expect(first.hasMore).toBe(true);
  const second = await host.inviteChoices(meetup.id, { name: "Candidate", page: 1 });
  expect(second.members.map((candidate) => candidate.name)).toEqual(["Candidate21 Member"]);
  expect(second.hasMore).toBe(false);
  expect(await host.inviteChoices(meetup.id, { name: "Candidate", page: 0 })).toEqual(first);
  await expect(host.inviteChoices(meetup.id, { page: -1 })).rejects.toMatchObject({ code: "invalid-meetup" });
});

test("concurrent Invite answers and ordinary joins cannot exceed capacity or duplicate answers", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const meetup = await createMeetup(host, false);
  const boInvite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  const cyInvite = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  await Promise.all([
    bo.answerInvite(boInvite.id, "accept"), cy.answerInvite(cyInvite.id, "accept"),
    bo.answerInvite(boInvite.id, "accept"), di.joinMeetup(meetup.id),
  ]);
  const detail = await host.viewMeetup(meetup.id);
  expect(detail?.participantCount).toBe(2);
  expect(detail?.waitlist).toHaveLength(2);
  expect(new Set([...(detail?.participants ?? []), ...(detail?.waitlist ?? [])].map((person) => person.memberId)).size).toBe(4);
  expect((await host.inbox()).filter((notice) => notice.kind === "invite-accepted")).toHaveLength(2);
});

test("Invite delivery respects channel choices, acceptances email immediately and declines enter the digest", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const link = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "102", code: new URL(link.url).searchParams.get("start")! });
  await bo.setNoticePreference({ kind: "invite-received", telegram: false, email: false });
  h.telegram.reset();
  const meetup = await createMeetup(host);
  const invite = await host.inviteMember(meetup.id, (await bo.profile()).memberId);
  expect(await bo.inbox()).toHaveLength(1);
  expect(h.telegram.outbox).toEqual([]);
  expect(h.email.outbox).toEqual([]);
  await bo.answerInvite(invite.id, "accept");
  expect((await host.inbox())[0]?.kind).toBe("invite-accepted");
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "ana@example.test", text: expect.stringContaining("Bo accepted your Invite") })]);
  h.email.reset();
  const cy = await member("Cy");
  await cy.setNoticePreference({ kind: "invite-received", telegram: false, email: false });
  const cyInvite = await host.inviteMember(meetup.id, (await cy.profile()).memberId);
  await cy.answerInvite(cyInvite.id, "decline");
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "ana@example.test", text: expect.stringContaining("Cy declined your Invite") })]);
});
