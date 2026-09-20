import { expect, test } from "vitest";
import { AccessDeniedError, InvalidInputError } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, signInForId } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent } from "./meetup-or-event";

const h = harness();
const adminPerson = { sub: "olivia", name: "Olivia Admin", email: "olivia@example.test" };

function member(name: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub: name, name, email: `${name.toLowerCase()}@example.test` });
}

async function setup() {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const olivia = await signInAndAcknowledgeAs(h, "ministry-a", adminPerson);
  return { olivia, admin: await olivia.organisationAdmin(), ana: await member("Ana"), bo: await member("Bo") };
}

test("a Member Flag reaches only the Organisation Admin queue and is resolved with a note", async () => {
  const { olivia, admin, ana, bo } = await setup();
  const boId = (await bo.profile()).memberId;
  await ana.flag({ target: { kind: "member", id: boId }, reason: "Repeated unwanted messages." });
  const queue = await admin.flags();
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    state: "open", target: { kind: "member", id: boId, label: "Bo", email: "bo@example.test" },
    reporter: { memberId: (await ana.profile()).memberId, name: "Ana" },
    reason: "Repeated unwanted messages.", resolution: null,
  });
  expect(await bo.inbox()).toEqual([]);
  expect(await ana.viewMember(boId)).not.toHaveProperty("flags");
  await expect(bo.organisationAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await admin.auditLog()).toContainEqual(expect.objectContaining({
    actorMemberId: (await olivia.profile()).memberId, action: "flags", filter: { state: "open" },
  }));
  await admin.resolveFlag(queue[0]!.id, "Discussed expectations with the Member.");
  expect(await admin.flags()).toEqual([]);
  expect(await admin.flags("resolved")).toContainEqual(expect.objectContaining({
    id: queue[0]!.id, state: "resolved", resolution: expect.objectContaining({
      note: "Discussed expectations with the Member.", resolvedAt: h.clock.now(),
    }),
  }));
});

test.each(["meetup", "event"] as const)("a Member can Flag a visible private %s without telling its Host", async (kind) => {
  const { admin, ana, bo } = await setup();
  const occurrence = await createMeetupOrEvent(h, ana, {
    activityId: (await ana.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 4,
    place: { kind: "virtual", url: "https://meet.example/coffee" }, audience: { kind: "invite-only" },
  }, kind);
  const target = { kind, id: occurrence.id };
  await expect(bo.flag({ target, reason: "Unsafe arrangements." })).rejects.toBeInstanceOf(AccessDeniedError);
  const boId = (await bo.profile()).memberId;
  const invite = kind === "event" ? await ana.inviteToEvent(occurrence.id, boId) : await ana.inviteMember(occurrence.id, boId);
  await bo.answerInvite(invite.id, "accept");
  const inboxBefore = await ana.inbox();
  await bo.flag({ target, reason: "Unsafe arrangements." });
  expect(await admin.flags()).toContainEqual(expect.objectContaining({ target: {
    ...target, label: "coffee", startsAt: occurrence.startsAt, host: occurrence.host,
  }, reason: "Unsafe arrangements." }));
  expect(await ana.inbox()).toEqual(inboxBefore);
});

test("Flag submission and resolution validate input and stay inside the Organisation", async () => {
  const { admin, ana, bo } = await setup();
  const otherAdminPerson = { sub: "other-admin", email: "other-admin@example.test", name: "Other Admin" };
  await h.app.bootstrap({ ...ministryB, organisationAdmin: otherAdminPerson });
  const otherMember = await signInAndAcknowledgeAs(h, "ministry-b", otherAdminPerson);
  const otherAdmin = await otherMember.organisationAdmin();
  const target = { kind: "member" as const, id: (await bo.profile()).memberId };
  for (const reason of ["", " ", "x".repeat(2001)]) {
    await expect(ana.flag({ target, reason })).rejects.toBeInstanceOf(InvalidInputError);
  }
  await expect(otherMember.flag({ target, reason: "Outside this Organisation." })).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(ana.flag({ target: { kind: "member", id: (await otherMember.profile()).memberId }, reason: "Outside this Organisation." })).rejects.toBeInstanceOf(AccessDeniedError);
  const platform = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  await expect(platform.organisationAdmin()).rejects.toBeInstanceOf(AccessDeniedError);
  await ana.flag({ target, reason: "  A reason.  " });
  const [entry] = await admin.flags();
  expect(entry!.reason).toBe("A reason.");
  expect(await otherAdmin.flags()).toEqual([]);
  await expect(otherAdmin.resolveFlag(entry!.id, "Resolved elsewhere.")).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(admin.resolveFlag(entry!.id, " ")).rejects.toBeInstanceOf(InvalidInputError);
  await admin.resolveFlag(entry!.id, "  Resolved here.  ");
  await admin.resolveFlag(entry!.id, "Resolved here.");
  await expect(admin.resolveFlag(entry!.id, "Replace the recorded note.")).rejects.toBeInstanceOf(InvalidInputError);
  expect(await admin.flags("resolved")).toContainEqual(expect.objectContaining({ resolution: expect.objectContaining({ note: "Resolved here." }) }));
});

test.each(["meetup", "event"] as const)("an Organisation Admin cancels another Host's private %s and notifies its Participants", async (kind) => {
  const { admin, ana, bo } = await setup();
  const occurrence = await createMeetupOrEvent(h, ana, {
    activityId: (await ana.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 4,
    place: { kind: "virtual", url: "https://meet.example/private" }, audience: { kind: "invite-only" },
  }, kind);
  const boId = (await bo.profile()).memberId;
  const invite = kind === "event" ? await ana.inviteToEvent(occurrence.id, boId) : await ana.inviteMember(occurrence.id, boId);
  await bo.answerInvite(invite.id, "accept");
  expect(await admin.upcomingOccurrences()).toContainEqual(expect.objectContaining({ id: occurrence.id, kind, host: { memberId: (await ana.profile()).memberId, name: "Ana" } }));
  if (kind === "event") await admin.cancelEvent(occurrence.id);
  else await admin.cancelMeetup(occurrence.id);
  expect(await admin.upcomingOccurrences()).not.toContainEqual(expect.objectContaining({ id: occurrence.id }));
  const updated = kind === "event" ? await bo.viewEvent(occurrence.id) : await bo.viewMeetup(occurrence.id);
  expect(updated).toMatchObject({ status: "cancelled", canChange: false });
  const notice = (await bo.inbox()).find((entry) => entry.kind === "meetup-cancelled")!;
  expect(notice.message).toContain(`The Organisation Admin cancelled this ${kind === "event" ? "Event" : "Meetup"}.`);
  expect(notice.message).toContain("https://meet.example/private");
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ to: "bo@example.test", text: notice.message }));
});

test("suspension hides a Member, denies old actors and login, and reinstatement restores access", async () => {
  const { admin, ana, bo } = await setup();
  const boId = (await bo.profile()).memberId;
  await admin.suspendMember(boId);
  expect(await ana.viewMember(boId)).toBeUndefined();
  expect(await h.app.asMember(boId)).toBeUndefined();
  await expect(bo.profile()).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(signInForId(h, "ministry-a", { sub: "Bo", name: "Bo", email: "bo@example.test" })).rejects.toMatchObject({ code: "inactive-member" });
  expect(await admin.roster()).toContainEqual(expect.objectContaining({ memberId: boId, status: "suspended" }));
  await admin.suspendMember(boId);
  await admin.reinstateMember(boId);
  expect(await bo.profile()).toMatchObject({ memberId: boId, status: "active" });
  expect(await ana.viewMember(boId)).toMatchObject({ memberId: boId, name: "Bo" });
});

test("reinstating a Member who never logged in restores Provisioned status", async () => {
  const { admin, ana } = await setup();
  const rows = [...await admin.roster(), { email: "new@example.test", name: "New Member", department: null, site: null }];
  await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  const provisioned = (await admin.roster()).find((entry) => entry.email === "new@example.test")!;
  expect(provisioned.status).toBe("provisioned");
  await admin.suspendMember(provisioned.memberId);
  expect(await ana.viewMember(provisioned.memberId)).toBeUndefined();
  await admin.reinstateMember(provisioned.memberId);
  await admin.reinstateMember(provisioned.memberId);
  expect(await admin.roster()).toContainEqual(expect.objectContaining({ memberId: provisioned.memberId, status: "provisioned" }));
  expect(await h.app.asMember(provisioned.memberId)).toBeUndefined();
  expect(await ana.viewMember(provisioned.memberId)).toMatchObject({ memberId: provisioned.memberId, name: "New Member" });
  const signedIn = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "new", name: "New Member", email: "new@example.test" });
  expect(await signedIn.profile()).toMatchObject({ memberId: provisioned.memberId, status: "active" });
});

test("moderation rechecks current admin access and rejects another Organisation, wrong occurrence kinds and past cancellation", async () => {
  const { olivia, admin, ana, bo } = await setup();
  const boId = (await bo.profile()).memberId;
  const occurrence = await ana.createMeetup({
    activityId: (await ana.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 4,
    place: { kind: "virtual", url: "https://meet.example/coffee" },
  });
  await ana.flag({ target: { kind: "member", id: boId }, reason: "A private concern." });
  const [flag] = await admin.flags();
  const otherPerson = { sub: "other-admin", name: "Other Admin", email: "other-admin@example.test" };
  await h.app.bootstrap({ ...ministryB, organisationAdmin: otherPerson });
  const other = await (await signInAndAcknowledgeAs(h, "ministry-b", otherPerson)).organisationAdmin();
  expect(await other.upcomingOccurrences()).toEqual([]);
  await expect(other.cancelMeetup(occurrence.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(other.suspendMember(boId)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(other.reinstateMember(boId)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(admin.cancelEvent(occurrence.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(ana.flag({ target: { kind: "event", id: occurrence.id }, reason: "Wrong kind." })).rejects.toBeInstanceOf(AccessDeniedError);
  h.clock.set(new Date("2026-09-18T10:00:00Z"));
  await expect(admin.cancelMeetup(occurrence.id)).rejects.toBeInstanceOf(InvalidInputError);
  const secondPerson = { sub: "second", name: "Second Admin", email: "second@example.test" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: secondPerson });
  const second = await (await signInAndAcknowledgeAs(h, "ministry-a", secondPerson)).organisationAdmin();
  await second.suspendMember((await olivia.profile()).memberId);
  for (const action of [
    () => admin.flags(), () => admin.resolveFlag(flag!.id, "Resolved."), () => admin.upcomingOccurrences(),
    () => admin.cancelMeetup(occurrence.id), () => admin.cancelEvent(occurrence.id),
    () => admin.suspendMember(boId), () => admin.reinstateMember(boId),
  ]) await expect(action()).rejects.toBeInstanceOf(AccessDeniedError);
});
