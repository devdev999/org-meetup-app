import { expect, test } from "vitest";
import { AccessDeniedError, InvalidInputError } from "../index";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();
const adminPerson = { sub: "olivia", name: "Olivia Admin", email: "olivia@example.test" };

function member(name: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub: name, name, email: `${name.toLowerCase()}@example.test` });
}

test.each(["suspension", "departure"] as const)("%s cancels hosted occurrences, releases future seats and preserves past Attendance", async (change) => {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminPerson)).organisationAdmin();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const cy = await member("Cy");
  const boId = (await bo.profile()).memberId;
  const input = {
    activityId: (await ana.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual" as const, url: "https://meet.example/coffee" },
  };
  const past = await ana.createMeetup(input);
  await bo.joinMeetup(past.id);
  const future = { ...input, startsAt: new Date("2026-09-19T10:00:00Z") };
  const hostedMeetup = await bo.createMeetup(future);
  await ana.joinMeetup(hostedMeetup.id);
  const hostedEvent = await createMeetupOrEvent(h, bo, future, "event");
  await ana.joinEvent(hostedEvent.id);
  const joined = await ana.createMeetup(future);
  await bo.joinMeetup(joined.id);
  expect(await cy.joinMeetup(joined.id)).toBe("waitlisted");
  h.clock.set(new Date("2026-09-18T12:00:00Z"));
  await ana.confirmAttendance(past.id, [(await ana.profile()).memberId, boId]);
  const fullRoster = await admin.roster();
  h.email.reset();
  if (change === "suspension") await admin.suspendMember(boId);
  else {
    const remaining = fullRoster.filter((entry) => entry.memberId !== boId);
    await admin.commitRoster(remaining, (await admin.previewRoster(remaining)).revision);
  }

  expect(await ana.viewMeetup(hostedMeetup.id)).toMatchObject({ status: "cancelled" });
  expect(await ana.viewEvent(hostedEvent.id)).toMatchObject({ status: "cancelled" });
  expect(await cy.viewMeetup(joined.id)).toMatchObject({ membership: "participant", participantCount: 2 });
  expect((await ana.viewMeetup(joined.id))!.participants.map((person) => person.name)).toEqual(["Ana", "Cy"]);
  expect((await ana.inbox()).filter((notice) => notice.kind === "meetup-cancelled")).toHaveLength(2);
  expect(h.email.outbox.filter((message) => message.to === "ana@example.test" && message.text.includes("cancelled"))).toHaveLength(2);
  expect(await admin.memberAttendance(boId)).toContainEqual(expect.objectContaining({ id: past.id, outcome: "attended" }));
  expect(await ana.connections()).toContainEqual(expect.objectContaining({
    member: { memberId: boId, name: "Bo", profileVisible: false }, occurrences: [expect.objectContaining({ id: past.id })],
  }));

  if (change === "suspension") await admin.reinstateMember(boId);
  else {
    await admin.commitRoster(fullRoster, (await admin.previewRoster(fullRoster)).revision);
    await member("Bo");
  }
  expect(await bo.attendance(past.id)).toMatchObject({ outcome: "attended" });
  expect(await bo.viewMeetup(hostedMeetup.id)).toMatchObject({ status: "cancelled" });
  expect(await bo.viewEvent(hostedEvent.id)).toMatchObject({ status: "cancelled" });
  expect(await bo.viewMeetup(joined.id)).toMatchObject({ membership: null });
  expect((await bo.connections())[0]!.occurrences[0]!.id).toBe(past.id);
});

test.each(["meetup", "event"] as const)("suspension stops hosted %s series and removes standing places without cancelling a reassigned occurrence", async (kind) => {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminPerson)).organisationAdmin();
  const ana = participationFor(await member("Ana"), kind);
  const bo = participationFor(await member("Bo"), kind);
  const boId = (await bo.profile()).memberId;
  const input = {
    activityId: (await ana.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual" as const, url: "https://meet.example/coffee" }, recurrence: { frequency: "weekly" as const },
  };
  const hosted = await createMeetupOrEvent(h, bo, input, kind);
  await ana.joinSeries(hosted.recurrence!.id);
  await bo.handOver(hosted.id, (await ana.profile()).memberId);
  const joined = await createMeetupOrEvent(h, ana, input, kind);
  await bo.joinSeries(joined.recurrence!.id);
  await h.app.processRecurrences();
  await admin.suspendMember(boId);
  await admin.reinstateMember(boId);

  expect(await ana.view(hosted.id)).toMatchObject({ status: "scheduled", host: { name: "Ana" }, recurrence: { stopped: true } });
  expect(await bo.view(joined.id)).toMatchObject({ membership: null, rsvp: null, recurrence: { isStanding: false, standingCount: 1 } });
  h.clock.set(new Date("2026-09-27T09:00:00Z"));
  await h.app.processRecurrences();
  const future = await bo.list();
  expect(future.filter((occurrence) => occurrence.recurrence?.id === hosted.recurrence!.id)).toEqual([]);
  expect(future.filter((occurrence) => occurrence.recurrence?.id === joined.recurrence!.id)).toMatchObject([
    { membership: null, rsvp: null, participantCount: 1 }, { membership: null, rsvp: null, participantCount: 1 },
  ]);
});

test("reinstatement does not retry old external notices while the inbox history remains", async () => {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminPerson)).organisationAdmin();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const boId = (await bo.profile()).memberId;
  const link = await bo.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "202", code: new URL(link.url).searchParams.get("start")! });
  const meetup = await bo.createMeetup({
    activityId: (await bo.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual", url: "https://meet.example/coffee" },
  });
  h.email.failure = new Error("Email unavailable");
  h.telegram.failure = new Error("Telegram unavailable");
  await ana.joinMeetup(meetup.id);
  await ana.leaveMeetup(meetup.id);
  expect(h.email.attempts.some((message) => message.to === "bo@example.test")).toBe(true);
  await admin.suspendMember(boId);
  await admin.reinstateMember(boId);
  h.email.reset();
  h.telegram.reset();
  h.clock.set(new Date("2026-09-19T09:01:00Z"));
  await h.app.deliverNotices();
  await h.app.sendDailyDigests();
  expect(h.email.outbox.filter((message) => message.to === "bo@example.test")).toEqual([]);
  expect(h.telegram.outbox.filter((message) => message.chatId === "202")).toEqual([]);
  expect((await bo.inbox()).map((notice) => notice.kind)).toEqual(["meetup-cancelled", "meetup-left", "meetup-joined"]);
});

test("batch departures release moved occurrences after a series ends and expire pending Invites", async () => {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", adminPerson)).organisationAdmin();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const boId = (await bo.profile()).memberId;
  const cyId = (await cy.profile()).memberId;
  const input = {
    activityId: (await ana.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual" as const, url: "https://meet.example/coffee" },
  };
  const occurrence = await ana.createMeetup({ ...input, recurrence: { frequency: "weekly", endsOn: "2026-09-19" } });
  await bo.joinSeries(occurrence.recurrence!.id);
  await cy.joinMeetup(occurrence.id);
  await di.joinMeetup(occurrence.id);
  await ana.editMeetup(occurrence.id, { ...input, startsAt: new Date("2026-09-22T10:00:00Z") });
  const privateMeetup = await ana.createMeetup({ ...input, startsAt: new Date("2026-09-23T10:00:00Z"), audience: { kind: "invite-only" } });
  const invite = await ana.inviteMember(privateMeetup.id, cyId);
  const fullRoster = await admin.roster();
  const remaining = fullRoster.filter((row) => ![boId, cyId].includes(row.memberId));
  h.clock.set(new Date("2026-09-20T09:00:00Z"));
  await admin.commitRoster(remaining, (await admin.previewRoster(remaining)).revision);
  expect(await di.viewMeetup(occurrence.id)).toMatchObject({ membership: "participant", participantCount: 2 });
  expect((await ana.viewMeetup(occurrence.id))!.participants.map((person) => person.name)).toEqual(["Ana", "Di"]);
  expect((await di.inbox()).filter((notice) => notice.kind === "meetup-promoted")).toHaveLength(1);
  await expect(cy.answerInvite(invite.id, "accept")).rejects.toBeInstanceOf(AccessDeniedError);
  await admin.commitRoster(fullRoster, (await admin.previewRoster(fullRoster)).revision);
  await member("Cy");
  await member("Bo");
  await expect(cy.answerInvite(invite.id, "accept")).rejects.toBeInstanceOf(InvalidInputError);
  expect(await bo.viewMeetup(occurrence.id)).toMatchObject({ membership: null, rsvp: null, recurrence: { isStanding: false } });
  expect((await cy.inbox()).filter((notice) => notice.kind === "meetup-promoted")).toEqual([]);
});
