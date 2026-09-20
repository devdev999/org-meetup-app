import { expect, test } from "vitest";
import type { CreateMeetupInput, MemberActions } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, signInAs } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();

async function member(name: string, site = "Harbour House", organisation = "ministry-a") {
  const actor = await signInAndAcknowledgeAs(h, organisation, {
    sub: name,
    email: `${name.toLowerCase()}@example.test`,
    name: `${name} Member`,
  });
  await actor.updateProfile({ department: null, site });
  return actor;
}

async function setup() {
  await h.app.bootstrap({ ...ministryA, organisation: { ...ministryA.organisation, sites: ["Harbour House", "Annex"] } });
  return member("Ana");
}

async function inputFor(host: MemberActions): Promise<CreateMeetupInput> {
  const choices = await host.meetupChoices();
  return {
    activityId: choices.activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T09:30:00Z"),
    durationMinutes: 60,
    place: { kind: "physical", siteId: choices.defaultSiteId!, spot: "Lobby table" },
    capacity: 2,
  };
}

test("a Member creates a Meetup starting in thirty minutes or next week with audience defaults", async () => {
  const host = await setup();
  const input = await inputFor(host);
  const physical = await host.createMeetup(input);
  const virtual = await host.createMeetup({
    ...input,
    startsAt: new Date("2026-09-25T09:00:00Z"),
    place: { kind: "virtual", url: "https://meet.example/coffee" },
    capacity: 30,
  });

  expect(physical).toMatchObject({
    activity: { name: "coffee" },
    startsAt: new Date("2026-09-18T09:30:00Z"),
    durationMinutes: 60,
    audience: { kind: "open", scope: "site", siteId: (await host.meetupChoices()).defaultSiteId },
    place: { kind: "physical", spot: "Lobby table", siteName: "Harbour House" },
    capacity: 2,
    participantCount: 1,
    membership: "host",
    canChange: true,
  });
  expect(virtual.audience).toEqual({ kind: "open", scope: "organisation" });
  expect((await host.listMeetups()).map((meetup) => meetup.id)).toEqual([physical.id, virtual.id]);
  expect(await host.viewMeetup(physical.id)).toEqual(physical);
});

test.each(["meetup", "event"] as const)("%s Members join first-come, leave and receive FIFO promotions with notices", async (kind) => {
  const host = participationFor(await setup(), kind);
  const bo = participationFor(await member("Bo"), kind);
  const cy = participationFor(await member("Cy"), kind);
  const di = participationFor(await member("Di"), kind);
  const meetup = await createMeetupOrEvent(h, host, await inputFor(host), kind);
  expect(await bo.join(meetup.id)).toBe("participant");
  expect(await cy.join(meetup.id)).toBe("waitlisted");
  expect(await cy.join(meetup.id)).toBe("waitlisted");
  expect(await di.join(meetup.id)).toBe("waitlisted");
  expect((await host.view(meetup.id))?.waitlist?.map((person) => person.name)).toEqual(["Cy Member", "Di Member"]);
  expect((await bo.view(meetup.id))?.participants.map((person) => person.name)).toEqual(["Ana Member", "Bo Member"]);
  expect((await bo.view(meetup.id))?.waitlist).toBeNull();
  expect((await cy.view(meetup.id))?.participants).toEqual([]);
  await bo.leave(meetup.id);
  expect((await cy.view(meetup.id))?.membership).toBe("participant");
  expect((await host.view(meetup.id))?.waitlist?.map((person) => person.name)).toEqual(["Di Member"]);
  expect(await cy.inbox()).toEqual([expect.objectContaining({ kind: "meetup-promoted", ...(kind === "event" ? { eventId: meetup.id } : { meetupId: meetup.id }) })]);
  expect((await cy.inbox())[0]?.message).toContain(kind === "event" ? "Event" : "Meetup");
  expect((await host.inbox()).map((notice) => notice.kind)).toEqual(["meetup-left", "meetup-joined"]);
  expect((await host.inbox()).every((notice) => !notice.message.includes("Member"))).toBe(true);
  expect((await host.inbox())[0]?.message).toContain("2026-09-18 09:30 UTC");
  expect((await host.inbox())[0]?.message).toContain("Harbour House");
  expect((await host.inbox())[0]?.message).toContain("Lobby table");
  await di.leave(meetup.id);
  expect((await host.view(meetup.id))?.waitlist).toEqual([]);
  await expect(host.leave(meetup.id)).rejects.toMatchObject({ code: "invalid-meetup" });
});

test.each(["meetup", "event"] as const)("%s Host edits notify Participants, increased capacity promotes waitlist and handover preserves participation", async (kind) => {
  const host = participationFor(await setup(), kind);
  const bo = participationFor(await member("Bo"), kind);
  const cy = participationFor(await member("Cy"), kind);
  const input = await inputFor(host);
  const meetup = await createMeetupOrEvent(h, host, input, kind);
  await bo.join(meetup.id);
  await cy.join(meetup.id);
  const edited = { ...input, startsAt: new Date("2026-09-18T10:00:00Z"), place: { kind: "virtual" as const, url: "https://meet.example/new" }, capacity: 3 };
  await expect(bo.edit(meetup.id, edited)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await host.edit(meetup.id, edited);
  expect(await bo.view(meetup.id)).toMatchObject({ startsAt: edited.startsAt, place: edited.place, capacity: 3 });
  expect((await cy.view(meetup.id))?.membership).toBe("participant");
  expect((await bo.inbox()).map((notice) => notice.kind)).toEqual(["meetup-edited"]);
  expect((await bo.inbox())[0]?.message).toContain("https://meet.example/new");
  const boId = (await bo.profile()).memberId;
  await host.handOver(meetup.id, boId);
  expect(await bo.view(meetup.id)).toMatchObject({ host: { memberId: boId }, membership: "host" });
  expect((await cy.inbox()).map((notice) => notice.kind)).toContain("meetup-handed-over");
  await expect(host.cancel(meetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await host.leave(meetup.id);
  expect((await bo.view(meetup.id))?.participantCount).toBe(2);
});

test("Place change notices identify the new Site when the spot has the same name", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const input = await inputFor(host);
  const meetup = await host.createMeetup(input);
  await bo.joinMeetup(meetup.id);
  const annex = (await host.meetupChoices()).sites.find((site) => site.name === "Annex")!;
  await host.editMeetup(meetup.id, { ...input, place: { kind: "physical", siteId: annex.id, spot: "Lobby table" } });
  const [notice] = await bo.inbox();
  expect(notice?.message).toContain("Annex");
  expect(notice?.message).toContain("Lobby table");
  expect(notice?.message).not.toContain("Harbour House");
});

test("cancellation tells every Participant and waitlisted Member, clears the waitlist and prevents changes", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const input = await inputFor(host);
  const meetup = await host.createMeetup(input);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await host.cancelMeetup(meetup.id);
  expect(await host.viewMeetup(meetup.id)).toMatchObject({ status: "cancelled", waitlist: [], participantCount: 2, canChange: false });
  for (const actor of [host, bo, cy]) {
    expect(await actor.inbox()).toContainEqual(expect.objectContaining({ kind: "meetup-cancelled", meetupId: meetup.id }));
  }
  for (const operation of [
    () => cy.joinMeetup(meetup.id),
    () => bo.leaveMeetup(meetup.id),
    () => host.editMeetup(meetup.id, input),
    () => host.cancelMeetup(meetup.id),
    () => host.handOverMeetup(meetup.id, meetup.host.memberId),
  ]) await expect(operation()).rejects.toMatchObject({ code: "invalid-meetup" });
});

test("cancelled Meetups stay visible to former waitlisted Members after a Site change", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const outsider = await member("Eli", "Annex");
  await h.app.bootstrap({ ...ministryB, organisation: { ...ministryB.organisation, sites: ["Harbour House"] } });
  const other = await member("Cy", "Harbour House", "ministry-b");
  const meetup = await host.createMeetup(await inputFor(host));
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await di.joinMeetup(meetup.id);
  await cy.updateProfile({ department: null, site: "Annex" });
  await host.cancelMeetup(meetup.id);
  await di.updateProfile({ department: null, site: "Annex" });

  expect(await host.viewMeetup(meetup.id)).toMatchObject({ status: "cancelled", waitlist: [], participantCount: 2 });
  for (const actor of [cy, di]) {
    const notice = (await actor.inbox()).find((entry) => entry.kind === "meetup-cancelled");
    expect(notice?.meetupId).toBe(meetup.id);
    expect(await actor.viewMeetup(meetup.id)).toMatchObject({ status: "cancelled", membership: null, canChange: false, participants: [], waitlist: null });
    expect((await actor.listMeetups()).map((entry) => entry.id)).toContain(meetup.id);
    await expect(actor.joinMeetup(meetup.id)).rejects.toMatchObject({ code: "invalid-meetup" });
  }
  for (const actor of [outsider, other]) {
    expect(await actor.viewMeetup(meetup.id)).toBeUndefined();
    expect(await actor.listMeetups()).toEqual([]);
    expect(await actor.inbox()).toEqual([]);
  }
});

test("only Members in scope see open Meetups and only the Host sees invite-only Meetups", async () => {
  const host = await setup();
  const nearby = await member("Bo");
  const remote = await member("Cy", "Annex");
  const input = await inputFor(host);
  const physical = await host.createMeetup(input);
  const virtual = await host.createMeetup({ ...input, place: { kind: "virtual", url: "https://meet.example/coffee" } });
  const privateMeetup = await host.createMeetup({ ...input, audience: { kind: "invite-only" } });
  const explicit = await host.createMeetup({ ...input, audience: { kind: "open", scope: "organisation" } });
  expect((await nearby.listMeetups()).map((meetup) => meetup.id)).toEqual(expect.arrayContaining([physical.id, virtual.id, explicit.id]));
  expect(await remote.viewMeetup(physical.id)).toBeUndefined();
  expect((await remote.listMeetups()).map((meetup) => meetup.id).sort()).toEqual([virtual.id, explicit.id].sort());
  await expect(remote.joinMeetup(physical.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  expect(await host.viewMeetup(privateMeetup.id)).toBeDefined();
  for (const actor of [nearby, remote]) {
    expect(await actor.viewMeetup(privateMeetup.id)).toBeUndefined();
    await expect(actor.joinMeetup(privateMeetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  }
  expect((await nearby.viewMeetup(physical.id))?.participants).toEqual([]);
});

test("Meetup queries, commands, choices and inbox stay inside the actor's Organisation", async () => {
  const host = await setup();
  await h.app.bootstrap({ ...ministryB, organisation: { ...ministryB.organisation, sites: ["Harbour House"] } });
  const other = await member("Bo", "Harbour House", "ministry-b");
  const input = await inputFor(host);
  const foreignInput = await inputFor(other);
  const meetup = await host.createMeetup({ ...input, audience: { kind: "open", scope: "organisation" } });
  expect(await other.listMeetups()).toEqual([]);
  expect(await other.viewMeetup(meetup.id)).toBeUndefined();
  for (const operation of [
    () => other.joinMeetup(meetup.id),
    () => other.leaveMeetup(meetup.id),
    () => other.cancelMeetup(meetup.id),
    () => other.editMeetup(meetup.id, foreignInput),
    () => other.handOverMeetup(meetup.id, meetup.host.memberId),
  ]) await expect(operation()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(host.createMeetup({ ...input, activityId: foreignInput.activityId })).rejects.toMatchObject({ code: "invalid-meetup" });
  await expect(host.createMeetup({ ...input, place: foreignInput.place })).rejects.toMatchObject({ code: "invalid-meetup" });
  await expect(host.createMeetup({ ...input, audience: { kind: "open", scope: "site", siteId: (await other.meetupChoices()).defaultSiteId! } })).rejects.toMatchObject({ code: "invalid-meetup" });
  await expect(host.handOverMeetup(meetup.id, (await other.profile()).memberId)).rejects.toMatchObject({ code: "invalid-meetup" });
  const participant = await member("Cy");
  await participant.joinMeetup(meetup.id);
  expect(await host.inbox()).toHaveLength(1);
  expect(await other.inbox()).toEqual([]);
  expect(await participant.inbox()).toEqual([]);
});

test("concurrent joins cannot overfill the last spot and repeated joins do not duplicate notices", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const meetup = await host.createMeetup(await inputFor(host));
  const results = await Promise.all([bo.joinMeetup(meetup.id), cy.joinMeetup(meetup.id)]);
  expect([...results].sort()).toEqual(["participant", "waitlisted"]);
  expect(await host.viewMeetup(meetup.id)).toMatchObject({ participantCount: 2, waitlist: [expect.any(Object)] });
  const [participant, waitlisted] = results[0] === "participant" ? [bo, cy] : [cy, bo];
  await Promise.all([participant.joinMeetup(meetup.id), participant.joinMeetup(meetup.id)]);
  expect(await host.inbox()).toHaveLength(1);
  await Promise.all([participant.leaveMeetup(meetup.id), participant.leaveMeetup(meetup.id)]);
  expect((await waitlisted.viewMeetup(meetup.id))?.membership).toBe("participant");
  expect(await waitlisted.inbox()).toHaveLength(1);
});

test("invalid capacity, time, duration and Place are rejected without creating a Meetup", async () => {
  const host = await setup();
  const input = await inputFor(host);
  for (const capacity of [1, 31, 2.5, NaN]) {
    await expect(host.createMeetup({ ...input, capacity })).rejects.toMatchObject({ code: "invalid-meetup" });
  }
  for (const startsAt of [h.clock.now(), new Date("2020-01-01"), new Date("invalid")]) {
    await expect(host.createMeetup({ ...input, startsAt })).rejects.toMatchObject({ code: "invalid-meetup" });
  }
  for (const durationMinutes of [0, -1, 1.5]) {
    await expect(host.createMeetup({ ...input, durationMinutes })).rejects.toMatchObject({ code: "invalid-meetup" });
  }
  await expect(host.createMeetup({ ...input, place: { kind: "virtual", url: "javascript:alert(1)" } })).rejects.toMatchObject({ code: "invalid-meetup" });
  await expect(host.createMeetup({ ...input, place: { kind: "physical", siteId: (await host.meetupChoices()).defaultSiteId!, spot: " " } })).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(await host.listMeetups()).toEqual([]);
  expect(await host.viewMeetup("invalid")).toBeUndefined();
});

test("a Host without a Site chooses an audience for physical Meetups", async () => {
  const host = await setup();
  const input = await inputFor(host);
  await host.updateProfile({ department: null, site: null });
  await expect(host.createMeetup(input)).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(await host.createMeetup({ ...input, audience: { kind: "open", scope: "organisation" } })).toMatchObject({ audience: { kind: "open", scope: "organisation" } });
});

test("started Meetups cannot be joined, left, edited, cancelled or handed over", async () => {
  const host = await setup();
  const participant = await member("Bo");
  const input = await inputFor(host);
  const meetup = await host.createMeetup(input);
  await participant.joinMeetup(meetup.id);
  h.clock.set(input.startsAt);
  expect((await host.viewMeetup(meetup.id))?.canChange).toBe(false);
  for (const operation of [
    () => participant.joinMeetup(meetup.id),
    () => participant.leaveMeetup(meetup.id),
    () => host.editMeetup(meetup.id, input),
    () => host.cancelMeetup(meetup.id),
    () => host.handOverMeetup(meetup.id, meetup.host.memberId),
  ]) await expect(operation()).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(await host.listMeetups()).toEqual([]);
});

test("Hosts cannot demote Participants through a capacity edit or hand over to the waitlist", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const input = { ...await inputFor(host), capacity: 3 };
  const meetup = await host.createMeetup(input);
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await di.joinMeetup(meetup.id);
  await expect(host.editMeetup(meetup.id, { ...input, capacity: 2 })).rejects.toMatchObject({ code: "invalid-meetup" });
  await expect(host.handOverMeetup(meetup.id, (await di.profile()).memberId)).rejects.toMatchObject({ code: "invalid-meetup" });
  await host.editMeetup(meetup.id, { ...input, description: "Bring a mug" });
  expect(await bo.inbox()).toEqual([]);
  expect(await host.viewMeetup(meetup.id)).toMatchObject({ capacity: 3, description: "Bring a mug" });
});

test("Meetup commands and queries require acknowledgement and refuse a retained Departed actor", async () => {
  const adminPerson = { email: "admin@example.test", name: "Organisation Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson, organisation: { ...ministryA.organisation, sites: ["Harbour House"] } });
  const adminMember = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "admin", ...adminPerson });
  await adminMember.updateProfile({ department: null, site: "Harbour House" });
  const input = await inputFor(adminMember);
  const meetup = await adminMember.createMeetup(input);
  const actor = await signInAs(h, "ministry-a", { sub: "bo", name: "Bo Member", email: "bo@example.test" });
  const operations = [
    () => actor.meetupChoices(),
    () => actor.listMeetups(),
    () => actor.viewMeetup(meetup.id),
    () => actor.inbox(),
    () => actor.createMeetup(input),
    () => actor.joinMeetup(meetup.id),
    () => actor.leaveMeetup(meetup.id),
    () => actor.editMeetup(meetup.id, input),
    () => actor.cancelMeetup(meetup.id),
    () => actor.handOverMeetup(meetup.id, meetup.host.memberId),
  ];
  for (const operation of operations) await expect(operation()).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await actor.acknowledgeAdminVisibilityNotice();
  const admin = await adminMember.organisationAdmin();
  const roster = [adminPerson, ministryA.platformAdmin].map((person) => ({ ...person, department: null, site: null }));
  await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);
  for (const operation of operations) await expect(operation()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

test("joined Members retain access to leave after moving to another Site", async () => {
  const host = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const outsider = await member("Di", "Annex");
  const meetup = await host.createMeetup(await inputFor(host));
  await bo.joinMeetup(meetup.id);
  await cy.joinMeetup(meetup.id);
  await bo.updateProfile({ department: null, site: "Annex" });
  await cy.updateProfile({ department: null, site: "Annex" });
  expect((await bo.viewMeetup(meetup.id))?.membership).toBe("participant");
  expect((await cy.listMeetups()).map((entry) => entry.id)).toContain(meetup.id);
  expect(await outsider.viewMeetup(meetup.id)).toBeUndefined();
  await expect(outsider.joinMeetup(meetup.id)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await bo.leaveMeetup(meetup.id);
  expect((await cy.viewMeetup(meetup.id))?.membership).toBe("participant");
  await cy.leaveMeetup(meetup.id);
  expect(await cy.viewMeetup(meetup.id)).toBeUndefined();
  expect((await host.viewMeetup(meetup.id))?.participantCount).toBe(1);
});
