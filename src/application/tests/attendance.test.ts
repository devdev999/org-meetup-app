import { expect, test } from "vitest";
import { AccessDeniedError, InvalidInputError, type CreateMeetupInput } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();

function member(name: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub: name, name, email: `${name.toLowerCase()}@example.test` });
}

async function setup() {
  await h.app.bootstrap(ministryA);
  const ana = await member("Ana");
  const input: CreateMeetupInput = {
    activityId: (await ana.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 6,
    place: { kind: "virtual", url: "https://meet.example/coffee" },
  };
  return { ana, input };
}

test.each(["meetup", "event"] as const)("confirmed %s Attendance records every pair who came and where they met", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const occurrence = await createMeetupOrEvent(h, ana, input, kind);
  for (const person of [bo, cy, di]) await participationFor(person, kind).join(occurrence.id);
  const anaId = (await ana.profile()).memberId;
  const boId = (await bo.profile()).memberId;
  const cyId = (await cy.profile()).memberId;
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await ana.confirmAttendance(occurrence.id, [anaId, boId, cyId]);

  const connections = await ana.connections();
  expect(connections.map((connection) => connection.member.name)).toEqual(["Bo", "Cy"]);
  expect(connections[0]!.occurrences).toEqual([{
    id: occurrence.id, kind, activity: { id: input.activityId, name: "coffee" },
    startsAt: new Date("2026-09-18T10:00:00Z"), place: { kind: "virtual", url: "https://meet.example/coffee" },
  }]);
  expect((await bo.connections()).map((connection) => connection.member.name)).toEqual(["Ana", "Cy"]);
  expect((await cy.connections()).map((connection) => connection.member.name)).toEqual(["Ana", "Bo"]);
  expect(await di.connections()).toEqual([]);
});

test.each(["meetup", "event"] as const)("amending %s Attendance corrects no-shows and preserves other occurrence history", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const anaId = (await ana.profile()).memberId;
  const boId = (await bo.profile()).memberId;
  const first = await createMeetupOrEvent(h, ana, input, kind);
  const second = await createMeetupOrEvent(h, ana, { ...input, startsAt: new Date("2026-09-19T10:00:00Z") }, kind);
  await participationFor(bo, kind).join(first.id);
  await participationFor(bo, kind).join(second.id);
  h.clock.set(new Date("2026-09-19T11:00:00Z"));
  await ana.confirmAttendance(first.id, [anaId, boId]);
  await ana.confirmAttendance(second.id, [anaId, boId]);
  expect(await bo.attendance(first.id)).toMatchObject({ outcome: "attended", participants: null, canConfirm: false });
  expect((await bo.connections())[0]!.occurrences.map((occurrence) => occurrence.id)).toEqual([second.id, first.id]);

  await ana.confirmAttendance(first.id, [anaId]);
  expect(await bo.attendance(first.id)).toMatchObject({ outcome: "no-show" });
  expect(await bo.attendance(second.id)).toMatchObject({ outcome: "attended" });
  expect((await bo.connections())[0]!.occurrences.map((occurrence) => occurrence.id)).toEqual([second.id]);
  await ana.confirmAttendance(second.id, []);
  expect(await bo.connections()).toEqual([]);
  expect(await ana.connections()).toEqual([]);
  expect(await bo.attendance(second.id)).toMatchObject({ outcome: "no-show" });
});

test.each(["meetup", "event"] as const)("only seated Going Participants can be no-shows in a recurring %s", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const ev = await member("Ev");
  const occurrence = await createMeetupOrEvent(h, ana, { ...input, capacity: 3, recurrence: { frequency: "weekly" } }, kind);
  await bo.joinSeries(occurrence.recurrence!.id);
  await bo.answerRsvp(occurrence.id, "going");
  await cy.joinSeries(occurrence.recurrence!.id);
  await participationFor(di, kind).join(occurrence.id);
  await di.answerRsvp(occurrence.id, "not-going");
  await participationFor(ev, kind).join(occurrence.id);
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await ana.confirmAttendance(occurrence.id, [(await cy.profile()).memberId]);

  expect(await ana.attendance(occurrence.id)).toMatchObject({ outcome: "not-recorded" });
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "no-show", participants: null });
  expect(await cy.attendance(occurrence.id)).toMatchObject({ outcome: "attended", participants: null });
  expect(await di.attendance(occurrence.id)).toMatchObject({ outcome: "not-recorded", participants: null });
  expect(await ev.attendance(occurrence.id)).toMatchObject({ outcome: "not-recorded", participants: null });
  expect((await ana.attendance(occurrence.id))!.participants!.map((person) => person.name)).toEqual(["Ana", "Bo", "Cy"]);
  expect(await (await member("Outside")).attendance(occurrence.id)).toBeUndefined();
});

test.each(["meetup", "event"] as const)("%s Attendance opens at the end, closes seven days later and leaves unconfirmed Attendance unknown", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const first = await createMeetupOrEvent(h, ana, input, kind);
  const unconfirmed = await createMeetupOrEvent(h, ana, input, kind);
  await participationFor(bo, kind).join(first.id);
  await participationFor(bo, kind).join(unconfirmed.id);
  const ids = [(await ana.profile()).memberId, (await bo.profile()).memberId];
  h.clock.set(new Date("2026-09-18T10:59:59.999Z"));
  expect(await ana.attendance(first.id)).toMatchObject({ canConfirm: false, endsAt: new Date("2026-09-18T11:00:00Z"), closesAt: new Date("2026-09-25T11:00:00Z") });
  await expect(ana.confirmAttendance(first.id, ids)).rejects.toBeInstanceOf(InvalidInputError);
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  expect(await ana.attendance(first.id)).toMatchObject({ canConfirm: true });
  await ana.confirmAttendance(first.id, ids);
  h.clock.set(new Date("2026-09-25T10:59:59.999Z"));
  await ana.confirmAttendance(first.id, []);
  expect(await bo.attendance(first.id)).toMatchObject({ outcome: "no-show" });
  h.clock.set(new Date("2026-09-25T11:00:00Z"));
  expect(await ana.attendance(first.id)).toMatchObject({ canConfirm: false });
  await expect(ana.confirmAttendance(first.id, ids)).rejects.toBeInstanceOf(InvalidInputError);
  await expect(ana.confirmAttendance(unconfirmed.id, [])).rejects.toBeInstanceOf(InvalidInputError);
  expect(await bo.attendance(unconfirmed.id)).toMatchObject({ confirmedAt: null, outcome: "unknown" });
  expect(await bo.connections()).toEqual([]);
});

test("only the current Host can confirm eligible Members from the same Organisation", async () => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  await h.app.bootstrap(ministryB);
  const outside = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other", email: "other@example.test", name: "Other" });
  const occurrence = await ana.createMeetup({ ...input, capacity: 2 });
  await bo.joinMeetup(occurrence.id);
  await cy.joinMeetup(occurrence.id);
  const boId = (await bo.profile()).memberId;
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await expect(bo.confirmAttendance(occurrence.id, [boId])).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(outside.confirmAttendance(occurrence.id, [])).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await outside.attendance(occurrence.id)).toBeUndefined();
  for (const id of [(await cy.profile()).memberId, (await outside.profile()).memberId, "bad-id"]) {
    await expect(ana.confirmAttendance(occurrence.id, [boId, id])).rejects.toBeInstanceOf(InvalidInputError);
  }
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "unknown" });
  expect(await bo.connections()).toEqual([]);
  await ana.confirmAttendance(occurrence.id, [boId, boId]);
  expect(await bo.attendance(occurrence.id)).toMatchObject({ outcome: "attended" });
});

test("Members see their own Attendance history and Organisation Admins audit each individual view", async () => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const occurrence = await ana.createMeetup(input);
  await bo.joinMeetup(occurrence.id);
  await cy.joinMeetup(occurrence.id);
  const boId = (await bo.profile()).memberId;
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await ana.confirmAttendance(occurrence.id, [(await ana.profile()).memberId, (await cy.profile()).memberId]);
  expect(await bo.attendanceHistory()).toEqual([expect.objectContaining({ id: occurrence.id, kind: "meetup", outcome: "no-show" })]);
  expect(await cy.attendanceHistory()).toEqual([expect.objectContaining({ id: occurrence.id, outcome: "attended" })]);
  expect(await (await member("Outside")).attendanceHistory()).toEqual([]);
  expect(await cy.viewMember(boId)).toEqual({ memberId: boId, name: "Bo", department: null, site: null, interests: [] });
  const adminClaims = { sub: "admin", email: "admin@example.test", name: "Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminClaims });
  const adminMember = await signInAndAcknowledgeAs(h, "ministry-a", adminClaims);
  const admin = await adminMember.organisationAdmin();
  expect(await admin.memberAttendance(boId)).toEqual(await bo.attendanceHistory());
  await admin.memberAttendance(boId);
  const views = (await admin.auditLog()).filter((entry) => entry.action === "member-attendance");
  expect(views).toHaveLength(2);
  expect(views[0]).toMatchObject({ actorMemberId: (await adminMember.profile()).memberId, filter: { memberId: boId } });
  await ana.confirmAttendance(occurrence.id, [(await ana.profile()).memberId, boId]);
  expect(await admin.memberAttendance(boId)).toEqual([expect.objectContaining({ id: occurrence.id, outcome: "attended" })]);
  const platform = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "platform", ...ministryA.platformAdmin });
  await expect(platform.organisationAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
  await h.app.bootstrap(ministryB);
  const foreign = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "foreign", email: "foreign@example.test", name: "Foreign" });
  await expect(admin.memberAttendance((await foreign.profile()).memberId)).rejects.toBeInstanceOf(AccessDeniedError);
});

test.each(["meetup", "event"] as const)("each %s Participant rates once per occurrence, with only aggregate ratings reported", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const first = await createMeetupOrEvent(h, ana, { ...input, capacity: 2 }, kind);
  const second = await createMeetupOrEvent(h, ana, { ...input, startsAt: new Date("2026-09-19T10:00:00Z") }, kind);
  await participationFor(bo, kind).join(first.id);
  await participationFor(cy, kind).join(first.id);
  await participationFor(bo, kind).join(second.id);
  await expect(bo.rateOccurrence(first.id, 5)).rejects.toBeInstanceOf(InvalidInputError);
  h.clock.set(new Date("2026-09-26T11:00:00Z"));
  expect(await bo.attendance(first.id)).toMatchObject({ outcome: "unknown", canRate: true, hasRated: false });
  await expect(cy.rateOccurrence(first.id, 5)).rejects.toBeInstanceOf(AccessDeniedError);
  for (const value of [0, 6, 2.5, NaN]) await expect(bo.rateOccurrence(first.id, value)).rejects.toBeInstanceOf(InvalidInputError);
  await bo.rateOccurrence(first.id, 5);
  await ana.rateOccurrence(first.id, 3);
  await bo.rateOccurrence(second.id, 4);
  await expect(bo.rateOccurrence(first.id, 1)).rejects.toBeInstanceOf(InvalidInputError);
  expect(await bo.attendance(first.id)).toMatchObject({ canRate: false, hasRated: true });
  expect(await ana.attendance(first.id)).not.toHaveProperty("ratings");
  const adminClaims = { sub: "ratings-admin", email: "ratings-admin@example.test", name: "Ratings Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminClaims });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminClaims)).organisationAdmin();
  expect(await admin.ratings()).toEqual([{ activity: { id: input.activityId, name: "coffee" }, ratingCount: 3, averageRating: 4 }]);
});

test("an unseated Event Host must be ticked and retains private occurrence history after reassignment", async () => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const adminClaims = { sub: "admin", email: "admin@example.test", name: "Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminClaims });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminClaims)).organisationAdmin();
  const occurrence = await createMeetupOrEvent(h, ana, { ...input, audience: { kind: "invite-only" } }, "event");
  const boId = (await bo.profile()).memberId;
  const cyId = (await cy.profile()).memberId;
  const invite = await ana.inviteToEvent(occurrence.id, boId);
  await bo.answerInvite(invite.id, "accept");
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await admin.reassignEventHost(occurrence.id, cyId);
  expect(await cy.attendance(occurrence.id)).toMatchObject({ canConfirm: true, canRate: false, outcome: "unknown" });
  await cy.confirmAttendance(occurrence.id, [boId]);
  expect(await cy.attendance(occurrence.id)).toMatchObject({ outcome: "not-recorded" });
  expect(await cy.connections()).toEqual([]);
  await cy.confirmAttendance(occurrence.id, [boId, cyId]);
  await admin.reassignEventHost(occurrence.id, (await ana.profile()).memberId);
  expect(await cy.viewEvent(occurrence.id)).toMatchObject({ id: occurrence.id, participantCount: 2 });
  expect((await cy.connections())[0]!.occurrences[0]!.id).toBe(occurrence.id);
  expect((await ana.attendance(occurrence.id))!.participants).toContainEqual({ memberId: cyId, name: "Cy", attended: true });
  await expect(cy.confirmAttendance(occurrence.id, [])).rejects.toBeInstanceOf(AccessDeniedError);
  await ana.confirmAttendance(occurrence.id, [boId]);
  expect(await cy.connections()).toEqual([]);
  expect(await cy.viewEvent(occurrence.id)).toBeUndefined();
  expect((await ana.attendance(occurrence.id))!.participants).toContainEqual({ memberId: cyId, name: "Cy", attended: false });
  await ana.confirmAttendance(occurrence.id, [boId, cyId]);
  expect((await cy.connections())[0]!.occurrences[0]!.id).toBe(occurrence.id);
});
