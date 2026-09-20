import { expect, test } from "vitest";
import { AccessDeniedError, InvalidInputError } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

function member(sub: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub, email: `${sub}@example.test`, name: sub, building: "Harbour House" });
}

async function setup() {
  h.clock.set(new Date("2026-01-05T09:00:00Z"));
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryA));
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", {
    sub: "ana", email: "ana@example.test", name: "Ana Member", building: "Harbour House",
  });
  const choices = await ana.meetupChoices();
  const input = {
    activityId: choices.activities.find((activity) => activity.name === "walk")!.id,
    startsAt: new Date("2026-01-08T10:00:00Z"), durationMinutes: 30, capacity: 2,
    place: { kind: "physical" as const, siteId: choices.defaultSiteId!, spot: "Main entrance" },
    description: "Thursday walk", recurrence: { frequency: "weekly" as const },
  };
  return { ana, input };
}

test("the worker creates ordinary occurrences fourteen days ahead and never duplicates them", async () => {
  const { ana, input } = await setup();
  const first = await ana.createMeetup(input);
  expect(first).toMatchObject({ recurrence: { frequency: "weekly" } });
  await h.app.processRecurrences();
  const initial = await ana.listMeetups();
  expect(initial.map((meetup) => meetup.startsAt.toISOString())).toEqual([
    "2026-01-08T10:00:00.000Z", "2026-01-15T10:00:00.000Z",
  ]);
  for (const meetup of initial) {
    expect(meetup).toMatchObject({
      activity: first.activity, place: first.place, audience: first.audience,
      durationMinutes: 30, capacity: 2, description: "Thursday walk", participantCount: 1,
    });
  }
  h.clock.set(new Date("2026-01-08T10:00:00Z"));
  await Promise.all([h.app.processRecurrences(), h.app.processRecurrences()]);
  const future = await ana.listMeetups();
  expect(future.map((meetup) => meetup.startsAt.toISOString())).toEqual([
    "2026-01-15T10:00:00.000Z", "2026-01-22T10:00:00.000Z",
  ]);
  expect(future[0]!.id).toBe(initial[1]!.id);
  expect((await ana.viewMeetup(first.id))?.participantCount).toBe(1);
});

test("joining a series respects standing capacity and keeps existing occurrence Participants in place", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const di = await member("di");
  const first = await ana.createMeetup(input);
  await h.app.processRecurrences();
  await bo.joinMeetup(first.id);
  await cy.joinSeries(first.recurrence!.id);
  await cy.joinSeries(first.recurrence!.id);
  expect(await cy.viewMeetup(first.id)).toMatchObject({ membership: "waitlisted", recurrence: { standingCount: 2, isStanding: true } });
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: "participant", recurrence: { isStanding: false } });
  expect((await cy.listMeetups())[1]).toMatchObject({ membership: "participant", participantCount: 2 });
  await expect(di.joinSeries(first.recurrence!.id)).rejects.toBeInstanceOf(InvalidInputError);
  h.clock.set(new Date("2026-01-08T10:00:00Z"));
  await h.app.processRecurrences();
  expect((await cy.listMeetups())[1]).toMatchObject({ membership: "participant", participantCount: 2 });
});

test("leaving a series removes future seats and waitlist entries, promotes the next Member and preserves past participation", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const di = await member("di");
  const first = await ana.createMeetup(input);
  await h.app.processRecurrences();
  const second = (await ana.listMeetups())[1]!;
  await cy.joinMeetup(first.id);
  await bo.joinMeetup(second.id);
  await cy.joinSeries(first.recurrence!.id);
  expect((await cy.viewMeetup(second.id))?.membership).toBe("waitlisted");
  h.clock.set(new Date("2026-01-08T11:00:00Z"));
  await h.app.processRecurrences();
  const third = (await ana.listMeetups())[1]!;
  await di.joinMeetup(third.id);
  await cy.leaveSeries(first.recurrence!.id);
  await cy.leaveSeries(first.recurrence!.id);
  expect(await cy.viewMeetup(first.id)).toMatchObject({ membership: "participant" });
  expect(await cy.viewMeetup(second.id)).toMatchObject({ membership: null, recurrence: { standingCount: 1, isStanding: false } });
  expect(await cy.viewMeetup(third.id)).toMatchObject({ membership: null });
  expect(await di.viewMeetup(third.id)).toMatchObject({ membership: "participant" });
  expect((await di.inbox()).filter((notice) => notice.kind === "meetup-promoted")).toHaveLength(1);
  await expect(ana.leaveSeries(first.recurrence!.id)).rejects.toBeInstanceOf(InvalidInputError);
});

test("series joins and departures notify the Host only when occurrence participation changes", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const link = await ana.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(link.url).searchParams.get("start")! });
  const first = await ana.createMeetup(input);
  await h.app.processRecurrences();
  const second = (await ana.listMeetups())[1]!;
  await bo.joinMeetup(first.id);
  h.email.reset();
  h.telegram.reset();
  await cy.joinSeries(first.recurrence!.id);
  await cy.joinSeries(first.recurrence!.id);
  const joined = (await ana.inbox()).filter((notice) => notice.message.startsWith("cy joined"));
  expect(joined).toMatchObject([{ kind: "meetup-joined", meetupId: second.id }]);
  expect(h.email.outbox).toHaveLength(1);
  expect(h.email.outbox[0]!.text).toContain("cy joined your Meetup.");
  expect(h.telegram.outbox).toHaveLength(1);
  await cy.leaveSeries(first.recurrence!.id);
  await cy.leaveSeries(first.recurrence!.id);
  const left = (await ana.inbox()).filter((notice) => notice.message.startsWith("cy left"));
  expect(left).toMatchObject([{ kind: "meetup-left", meetupId: second.id }]);
  expect(h.telegram.outbox).toHaveLength(2);
  expect(h.email.outbox).toHaveLength(1);
  await bo.joinSeries(first.recurrence!.id);
  expect((await ana.inbox()).filter((notice) => notice.kind === "meetup-joined" && notice.meetupId === first.id)).toHaveLength(1);
});

test("series actions leave unrelated notice retries to the worker", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const first = await ana.createMeetup(input);
  const oneOff = await ana.createMeetup({ ...input, recurrence: undefined });
  h.email.failure = new Error("Email unavailable");
  await cy.joinMeetup(oneOff.id);
  h.email.reset();
  h.clock.set(new Date("2026-01-05T09:01:00Z"));
  await bo.leaveSeries(first.recurrence!.id);
  expect(h.email.outbox).toEqual([]);
  await bo.joinSeries(first.recurrence!.id);
  await bo.leaveSeries(first.recurrence!.id);
  await ana.stopSeries(first.recurrence!.id);
  await ana.stopSeries(first.recurrence!.id);
  expect(h.email.outbox.every((notice) => !notice.text.startsWith("cy joined"))).toBe(true);
  await h.app.deliverNotices();
  expect(h.email.outbox.filter((notice) => notice.text.startsWith("cy joined"))).toHaveLength(1);
});

test("Not going releases one occurrence and returning to Going waits behind existing waitlisted Members", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const di = await member("di");
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  await h.app.processRecurrences();
  expect((await bo.viewMeetup(first.id))?.rsvp).toBeNull();
  await cy.joinMeetup(first.id);
  await di.joinMeetup(first.id);
  await bo.answerRsvp(first.id, "not-going");
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: null, rsvp: "not-going", recurrence: { isStanding: true } });
  expect((await cy.viewMeetup(first.id))?.membership).toBe("participant");
  await bo.answerRsvp(first.id, "going");
  await bo.answerRsvp(first.id, "going");
  const waiting = await ana.viewMeetup(first.id);
  expect(waiting!.waitlist!.map((person) => person.name)).toEqual(["di", "bo"]);
  expect((await bo.viewMeetup(first.id))?.rsvp).toBe("going");
  await cy.leaveMeetup(first.id);
  expect((await di.viewMeetup(first.id))?.membership).toBe("participant");
  expect((await bo.viewMeetup(first.id))?.membership).toBe("waitlisted");
  await di.leaveMeetup(first.id);
  expect((await bo.viewMeetup(first.id))?.membership).toBe("participant");
  expect((await bo.listMeetups())[1]).toMatchObject({ membership: "participant", rsvp: null });
  expect((await ana.viewMeetup(first.id))?.rsvps).toEqual([
    { memberId: (await ana.profile()).memberId, name: "Ana Member", answer: null },
    { memberId: (await bo.profile()).memberId, name: "bo", answer: "going" },
  ]);
});

test("the forty-eight-hour prompt uses each standing Member's channels and appears only once", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  for (const [actor, chatId] of [[ana, "101"], [bo, "102"]] as const) {
    const link = await actor.beginTelegramLink();
    await h.app.handleTelegram({ kind: "link", chatId, code: new URL(link.url).searchParams.get("start")! });
  }
  const first = await ana.createMeetup({ ...input, place: { kind: "virtual", url: "https://meet.example/private-room" }, description: "Do not send this description to Telegram" });
  await bo.joinSeries(first.recurrence!.id);
  h.telegram.reset();
  h.email.reset();
  h.clock.set(new Date("2026-01-06T09:59:59.999Z"));
  await h.app.processRecurrences();
  expect((await ana.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toEqual([]);
  h.clock.set(new Date("2026-01-06T10:00:00Z"));
  await Promise.all([h.app.processRecurrences(), h.app.processRecurrences()]);
  expect((await ana.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toHaveLength(1);
  expect((await bo.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toHaveLength(1);
  await ana.setNoticePreference({ kind: "rsvp-prompt", telegram: true, email: false });
  await bo.setNoticePreference({ kind: "rsvp-prompt", telegram: false, email: true });
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toEqual([{ chatId: "101", text: "Are you going to this Meetup? walk, 2026-01-08 10:00 UTC, Online.", rsvpMeetupId: first.id }]);
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "bo@example.test", subject: "Meetup notice", text: "Are you going to this Meetup? walk, 2026-01-08 10:00 UTC, https://meet.example/private-room." })]);
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toHaveLength(1);
  expect(h.email.outbox).toHaveLength(1);
});

test("Telegram RSVP buttons record answers for the linked Member and enforce occurrence capacity", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const link = await ana.beginTelegramLink();
  await h.app.handleTelegram({ kind: "link", chatId: "101", code: new URL(link.url).searchParams.get("start")! });
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  await h.app.handleTelegram({ kind: "answer-rsvp", chatId: "101", callbackId: "skip", meetupId: first.id, answer: "not-going" });
  expect(await ana.viewMeetup(first.id)).toMatchObject({ participantCount: 1, rsvp: "not-going" });
  await cy.joinMeetup(first.id);
  await h.app.handleTelegram({ kind: "answer-rsvp", chatId: "101", callbackId: "return", meetupId: first.id, answer: "going" });
  expect((await ana.viewMeetup(first.id))?.waitlist?.map((person) => person.name)).toEqual(["Ana Member"]);
  expect(h.telegram.answers).toContainEqual({ callbackId: "return", text: "Going recorded. You are on the waitlist." });
  await bo.answerRsvp(first.id, "not-going");
  expect((await ana.viewMeetup(first.id))?.participants.map((person) => person.name)).toContain("Ana Member");
});

test("only the series Host can stop it, cancelling future occurrences and notifying standing Members who are Not going", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  await h.app.processRecurrences();
  const second = (await ana.listMeetups())[1]!;
  await ana.handOverMeetup(second.id, (await bo.profile()).memberId);
  await bo.answerRsvp(second.id, "not-going");
  await expect(bo.stopSeries(first.recurrence!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  h.clock.set(new Date("2026-01-08T10:00:00Z"));
  await ana.stopSeries(first.recurrence!.id);
  await ana.stopSeries(first.recurrence!.id);
  expect((await ana.viewMeetup(first.id))?.status).toBe("scheduled");
  expect(await ana.viewMeetup(second.id)).toMatchObject({ status: "cancelled", recurrence: { stopped: true } });
  expect((await bo.inbox()).filter((notice) => notice.kind === "meetup-cancelled")).toHaveLength(1);
  h.clock.set(new Date("2026-04-01T09:00:00Z"));
  await h.app.processRecurrences();
  expect(await ana.listMeetups()).toEqual([]);
  await expect(bo.answerRsvp(second.id, "going")).rejects.toBeInstanceOf(InvalidInputError);
});

test("a fifth-Thursday series remains discoverable and manageable in months without an occurrence", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup({ ...input, startsAt: new Date("2026-01-29T10:00:00Z"), recurrence: { frequency: "monthly", endsOn: "2026-04-30" } });
  await bo.joinSeries(first.recurrence!.id);
  h.clock.set(new Date("2026-01-30T10:00:00Z"));
  await h.app.processRecurrences();
  expect(await ana.listMeetups()).toEqual([]);
  expect(await bo.listSeries()).toEqual([expect.objectContaining({
    id: first.recurrence!.id, frequency: "monthly", startsAt: new Date("2026-01-29T10:00:00Z"),
    activity: first.activity, standingCount: 2, isStanding: true,
  })]);
  await bo.leaveSeries(first.recurrence!.id);
  await bo.joinSeries(first.recurrence!.id);
  h.clock.set(new Date("2026-04-16T10:00:00Z"));
  await h.app.processRecurrences();
  expect((await bo.listMeetups()).map((meetup) => [meetup.startsAt.toISOString(), meetup.membership])).toEqual([["2026-04-30T10:00:00.000Z", "participant"]]);
  h.clock.set(new Date("2026-05-01T09:00:00Z"));
  await h.app.processRecurrences();
  expect(await ana.listSeries()).toEqual([]);
  expect(await bo.listMeetups()).toEqual([]);
});

test("ordinary Join and Leave keep RSVP accurate for one-off and recurring Meetups", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const oneOff = await ana.createMeetup({ ...input, recurrence: undefined });
  await bo.joinMeetup(oneOff.id);
  expect((await ana.viewMeetup(oneOff.id))?.rsvps?.map((rsvp) => rsvp.answer)).toEqual(["going", "going"]);
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  await bo.leaveMeetup(first.id);
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: null, rsvp: "not-going", recurrence: { isStanding: true } });
  await bo.joinMeetup(first.id);
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: "participant", rsvp: "going" });
});

test("standing access survives a Site change and Not going, then ends on leaving, while another Organisation stays isolated", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  await h.app.bootstrap(ministryB);
  const outsider = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "outside", name: "Outside", email: "outside@example.test" });
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  await bo.updateProfile({ site: null, department: null });
  await bo.answerRsvp(first.id, "not-going");
  expect(await bo.viewMeetup(first.id)).toMatchObject({ rsvp: "not-going", recurrence: { isStanding: true } });
  await bo.answerRsvp(first.id, "going");
  await bo.leaveSeries(first.recurrence!.id);
  expect(await bo.viewMeetup(first.id)).toBeUndefined();
  expect(await bo.listSeries()).toEqual([]);
  await expect(bo.answerRsvp(first.id, "going")).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await outsider.viewMeetup(first.id)).toBeUndefined();
  expect(await outsider.listSeries()).toEqual([]);
  await expect(outsider.joinSeries(first.recurrence!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(outsider.leaveSeries(first.recurrence!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(outsider.stopSeries(first.recurrence!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(outsider.answerRsvp(first.id, "going")).rejects.toBeInstanceOf(AccessDeniedError);
});

test("editing and cancelling occurrences does not change the template or regenerate their original slots", async () => {
  const { ana, input } = await setup();
  const first = await ana.createMeetup({ ...input, relevantInterests: [{ phrase: "Chess", selection: { name: "Chess", kind: "hobby" } }] });
  await h.app.processRecurrences();
  const second = (await ana.listMeetups())[1]!;
  await ana.editMeetup(first.id, { ...input, startsAt: new Date("2026-01-09T11:00:00Z"), description: "Changed once", relevantInterests: [] });
  await ana.cancelMeetup(second.id);
  await h.app.processRecurrences();
  expect((await ana.listMeetups()).map((meetup) => [meetup.id, meetup.status])).toEqual([[first.id, "scheduled"], [second.id, "cancelled"]]);
  h.clock.set(new Date("2026-01-08T10:00:00Z"));
  await h.app.processRecurrences();
  const third = (await ana.listMeetups()).at(-1)!;
  expect(await ana.viewMeetup(third.id)).toMatchObject({
    startsAt: new Date("2026-01-22T10:00:00Z"), description: "Thursday walk",
    relevantInterests: [{ name: "Chess", kind: "hobby" }],
  });
});

test("late standing joiners receive one prompt and leaving suppresses its pending external delivery", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup(input);
  h.clock.set(new Date("2026-01-07T10:00:00Z"));
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  h.email.reset();
  await bo.joinSeries(first.recurrence!.id);
  await h.app.processRecurrences();
  expect((await bo.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toHaveLength(1);
  await bo.leaveSeries(first.recurrence!.id);
  await h.app.deliverNotices();
  expect(h.email.outbox.filter((message) => message.to === "bo@example.test")).toEqual([]);
  h.clock.set(new Date("2026-01-07T10:01:00Z"));
  await bo.joinSeries(first.recurrence!.id);
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.email.outbox.filter((message) => message.to === "bo@example.test")).toHaveLength(1);
  expect((await ana.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toHaveLength(1);
});

test.each(["2026-01-07", "2026-02-30", "not-a-date"])("an invalid series end %s leaves no partial Meetup or series", async (endsOn) => {
  const { ana, input } = await setup();
  await expect(ana.createMeetup({ ...input, recurrence: { frequency: "weekly", endsOn } })).rejects.toBeInstanceOf(InvalidInputError);
  expect(await ana.listMeetups()).toEqual([]);
  expect(await ana.listSeries()).toEqual([]);
});

test("concurrent standing joins and generation cannot exceed series or occurrence capacity", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const first = await ana.createMeetup(input);
  const [boResult, cyResult, workerResult] = await Promise.allSettled([
    bo.joinSeries(first.recurrence!.id), cy.joinSeries(first.recurrence!.id), h.app.processRecurrences(),
  ]);
  expect([boResult.status, cyResult.status].sort()).toEqual(["fulfilled", "rejected"]);
  expect(workerResult.status).toBe("fulfilled");
  const occurrences = await ana.listMeetups();
  expect(occurrences).toHaveLength(2);
  for (const occurrence of occurrences) expect(occurrence).toMatchObject({ participantCount: 2, recurrence: { standingCount: 2 } });
});

test("leaving the standing list also withdraws from cancelled future occurrences but is harmless for a drop-in", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup(input);
  await bo.joinMeetup(first.id);
  await bo.leaveSeries(first.recurrence!.id);
  expect((await bo.viewMeetup(first.id))?.membership).toBe("participant");
  await bo.joinSeries(first.recurrence!.id);
  await ana.cancelMeetup(first.id);
  await bo.leaveSeries(first.recurrence!.id);
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: null, rsvp: null, status: "cancelled" });
  expect((await ana.viewMeetup(first.id))?.rsvps?.map((entry) => entry.name)).toEqual(["Ana Member"]);
});

test("an Invite-only series requires acceptance and accepting a fresh Invite records Going", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const boId = (await bo.profile()).memberId;
  const first = await ana.createMeetup({ ...input, audience: { kind: "invite-only" } });
  expect(await bo.listSeries()).toEqual([]);
  const invite = await ana.inviteMember(first.id, boId);
  expect((await bo.viewMeetup(first.id))?.recurrence?.canJoin).toBe(false);
  await expect(bo.joinSeries(first.recurrence!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await bo.answerInvite(invite.id, "accept");
  expect((await bo.viewMeetup(first.id))?.recurrence?.canJoin).toBe(true);
  await bo.joinSeries(first.recurrence!.id);
  expect(await bo.viewMeetup(first.id)).toMatchObject({ rsvp: "going", recurrence: { isStanding: true } });
  await bo.answerRsvp(first.id, "not-going");
  const renewed = await ana.inviteSuggestedMember(first.id, boId, invite.id);
  await bo.answerInvite(renewed.id, "accept");
  expect(await bo.viewMeetup(first.id)).toMatchObject({ rsvp: "going", membership: "participant" });
});

test("joining the series after declining a drop-in occurrence allocates its place with no stale Not going answer", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup(input);
  await bo.joinMeetup(first.id);
  await bo.answerRsvp(first.id, "not-going");
  await bo.joinSeries(first.recurrence!.id);
  expect(await bo.viewMeetup(first.id)).toMatchObject({ membership: "participant", rsvp: null, recurrence: { isStanding: true } });
});

test("an occurrence moved beyond the series end keeps its prompt and series management actions", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const cy = await member("cy");
  const first = await ana.createMeetup({ ...input, recurrence: { frequency: "weekly", endsOn: "2026-01-08" } });
  await bo.joinSeries(first.recurrence!.id);
  await ana.editMeetup(first.id, { ...input, startsAt: new Date("2026-01-20T10:00:00Z") });
  h.clock.set(new Date("2026-01-09T10:00:00Z"));
  expect(await ana.listSeries()).toMatchObject([{ id: first.recurrence!.id, ended: true, canStop: true, canJoin: false }]);
  expect(await bo.listSeries()).toMatchObject([{ id: first.recurrence!.id, canLeave: true, canJoin: false }]);
  await expect(cy.joinSeries(first.recurrence!.id)).rejects.toBeInstanceOf(InvalidInputError);
  h.clock.set(new Date("2026-01-18T10:00:00Z"));
  await h.app.processRecurrences();
  expect((await bo.inbox()).filter((notice) => notice.kind === "rsvp-prompt")).toMatchObject([{ meetupId: first.id }]);
  await bo.leaveSeries(first.recurrence!.id);
  expect((await bo.viewMeetup(first.id))?.membership).toBeNull();
  await ana.stopSeries(first.recurrence!.id);
  expect((await ana.viewMeetup(first.id))?.status).toBe("cancelled");
  expect(await ana.listSeries()).toEqual([]);
});

test("rescheduling an occurrence replaces its pending prompt and uses the new forty-eight-hour threshold", async () => {
  const { ana, input } = await setup();
  const bo = await member("bo");
  const first = await ana.createMeetup(input);
  await bo.joinSeries(first.recurrence!.id);
  h.clock.set(new Date("2026-01-06T10:00:00Z"));
  await h.app.processRecurrences();
  h.email.failure = new Error("Email unavailable");
  await h.app.deliverNotices();
  h.email.failure = undefined;
  await ana.editMeetup(first.id, { ...input, startsAt: new Date("2026-01-20T10:00:00Z") });
  h.email.reset();
  h.clock.set(new Date("2026-01-06T10:01:00Z"));
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date("2026-01-18T10:00:00Z"));
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(h.email.outbox.filter((notice) => notice.text.includes("2026-01-20 10:00 UTC"))).toHaveLength(2);
});
