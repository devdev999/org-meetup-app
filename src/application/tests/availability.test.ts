import { expect, test } from "vitest";
import type { MemberActions, PostAvailabilityInput } from "../index";
import { ministryA, ministryB, signInAndAcknowledgeAs, signInAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

async function member(name: string, site = "Harbour House", organisation = "ministry-a") {
  return signInAndAcknowledgeAs(h, organisation, {
    sub: name, email: `${name.toLowerCase()}@example.test`, name: `${name} Member`, building: site,
  });
}

async function setup() {
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryA));
  const ana = await member("Ana");
  const bo = await member("Bo");
  const choices = await ana.meetupChoices();
  const input: PostAvailabilityInput = {
    activityId: choices.activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: h.clock.now(), endsAt: new Date("2026-09-18T10:00:00Z"), kind: "physical",
  };
  return { ana, bo, input, choices };
}

test("open Availability is visible at the Member's Site, or across the Organisation when virtual", async () => {
  const { ana, bo, input } = await setup();
  const cy = await member("Cy", "Hill House");
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const outsider = await member("Di", "Harbour House", "ministry-b");
  const physical = await ana.postAvailability(input);
  expect(physical).toMatchObject({ activity: { name: "coffee" }, place: { kind: "physical", siteName: "Harbour House" } });
  expect((await bo.availability()).open.map((entry) => entry.id)).toEqual([physical.id]);
  expect((await cy.availability()).open).toEqual([]);
  expect(await outsider.availability()).toEqual({ open: [], suggestions: [] });
  const virtual = await ana.postAvailability({ ...input, kind: "virtual" });
  expect((await cy.availability()).open.map((entry) => entry.id)).toEqual([virtual.id]);
  h.clock.set(input.endsAt);
  expect(await bo.availability()).toEqual({ open: [], suggestions: [] });
});

async function link(actor: MemberActions, chatId: string) {
  const code = new URL((await actor.beginTelegramLink()).url).searchParams.get("start")!;
  await h.app.handleTelegram({ kind: "link", chatId, code });
}

test("overlaps suggest both Members and notify each pair once per day across posts and Activities", async () => {
  const { ana, bo, input, choices } = await setup();
  await link(ana, "101");
  await link(bo, "102");
  h.telegram.reset();
  const [first, second] = await Promise.all([ana.postAvailability(input), bo.postAvailability(input)]);
  expect((await ana.availability()).suggestions).toEqual([expect.objectContaining({
    ownAvailabilityId: first.id, otherAvailabilityId: second.id, member: { memberId: (await bo.profile()).memberId, name: "Bo Member" },
    startsAt: input.startsAt, endsAt: input.endsAt,
  })]);
  expect((await bo.availability()).suggestions).toEqual([expect.objectContaining({ ownAvailabilityId: second.id, otherAvailabilityId: first.id })]);
  expect(await ana.inbox()).toEqual([expect.objectContaining({ kind: "availability-overlap", meetupId: null, message: expect.stringContaining("Bo") })]);
  expect(await bo.inbox()).toEqual([expect.objectContaining({ kind: "availability-overlap", message: expect.stringContaining("Ana") })]);
  expect(h.telegram.outbox.map((entry) => entry.chatId).sort()).toEqual(["101", "102"]);
  expect(h.email.outbox).toHaveLength(2);
  expect(await ana.postAvailability(input)).toEqual(first);
  const lunch = choices.activities.find((activity) => activity.name === "lunch")!.id;
  await ana.postAvailability({ ...input, activityId: lunch });
  await bo.postAvailability({ ...input, activityId: lunch });
  await h.app.processAvailability();
  await h.app.deliverNotices();
  expect(h.telegram.outbox).toHaveLength(2);
  expect(await ana.inbox()).toHaveLength(1);
  h.clock.set(new Date("2026-09-19T09:00:00Z"));
  const tomorrow = { ...input, startsAt: h.clock.now(), endsAt: new Date("2026-09-19T10:00:00Z") };
  await ana.postAvailability(tomorrow);
  await bo.postAvailability(tomorrow);
  expect(h.telegram.outbox).toHaveLength(4);
});

test("overlaps require matching Activity and place, and touching windows do not overlap", async () => {
  const { ana, bo, input, choices } = await setup();
  const cy = await member("Cy", "Hill House");
  await ana.postAvailability(input);
  await bo.postAvailability({ ...input, activityId: choices.activities.find((activity) => activity.name === "lunch")!.id });
  await cy.postAvailability(input);
  await bo.postAvailability({ ...input, kind: "virtual" });
  await bo.postAvailability({ ...input, startsAt: input.endsAt, endsAt: new Date("2026-09-18T11:00:00Z") });
  expect((await ana.availability()).suggestions).toEqual([]);
  expect(await ana.inbox()).toEqual([]);
  h.clock.set(input.endsAt);
  await h.app.processAvailability();
  expect((await ana.availability()).suggestions).toEqual([]);
  expect(await ana.inbox()).toEqual([]);
});

test("the worker opens future windows, respects independent preferences and expires them permanently", async () => {
  const { ana, bo, input } = await setup();
  await link(ana, "101");
  await link(bo, "102");
  h.telegram.reset();
  await ana.setNoticePreference({ kind: "availability-overlap", telegram: false, email: true });
  await bo.setNoticePreference({ kind: "availability-overlap", telegram: true, email: false });
  const later = { ...input, kind: "virtual" as const, startsAt: new Date("2026-09-18T09:30:00Z") };
  await ana.postAvailability(later);
  await bo.postAvailability(later);
  expect(await ana.availability()).toEqual({ open: [], suggestions: [] });
  expect(h.telegram.outbox).toEqual([]);
  h.clock.set(later.startsAt);
  expect((await ana.availability()).suggestions).toHaveLength(1);
  expect(await ana.inbox()).toEqual([]);
  await Promise.all([h.app.processAvailability(), h.app.processAvailability()]);
  expect(h.telegram.outbox).toEqual([expect.objectContaining({ chatId: "102", text: expect.stringContaining("Online") })]);
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: "ana@example.test" })]);
  expect(await ana.inbox()).toHaveLength(1);
  expect(await bo.inbox()).toHaveLength(1);
  h.clock.set(input.endsAt);
  expect((await ana.availability()).open).toEqual([]);
  await h.app.processAvailability();
  h.clock.set(later.startsAt);
  expect(await ana.availability()).toEqual({ open: [], suggestions: [] });
});

test.each(["physical", "virtual"] as const)("a %s overlap only creates a Meetup and Invite after valid confirmation", async (kind) => {
  const { ana, bo, input, choices } = await setup();
  const first = await ana.postAvailability({ ...input, kind });
  const second = await bo.postAvailability({ ...input, kind });
  const availabilityOverlap = { ownAvailabilityId: first.id, otherAvailabilityId: second.id };
  const inbox = await bo.inbox();
  const prefill = await ana.availabilityMeetup(availabilityOverlap);
  expect(prefill).toMatchObject({ ...availabilityOverlap, activity: first.activity, place: first.place, startsAt: input.startsAt });
  expect(prefill!.meetupStartsAt).toEqual(new Date("2026-09-18T09:01:00Z"));
  expect(await ana.listMeetups()).toEqual([]);
  expect(await bo.inbox()).toEqual(inbox);
  const confirmation = {
    activityId: prefill!.activity.id, startsAt: prefill!.meetupStartsAt, durationMinutes: 30, capacity: 4, availabilityOverlap,
    place: kind === "physical" ? { kind, siteId: choices.defaultSiteId!, spot: "" } : { kind, url: "" },
  };
  await expect(ana.createMeetup(confirmation)).rejects.toMatchObject({ code: "invalid-meetup" });
  expect(await ana.listMeetups()).toEqual([]);
  expect(await bo.inbox()).toEqual(inbox);
  const meetup = await ana.createMeetup({
    ...confirmation,
    place: kind === "physical" ? { kind, siteId: choices.defaultSiteId!, spot: "Cafe" } : { kind, url: "https://meet.example/coffee" },
  });
  expect(meetup.audience).toEqual(kind === "physical" ? { kind: "open", scope: "site", siteId: choices.defaultSiteId } : { kind: "open", scope: "organisation" });
  expect((await bo.viewMeetup(meetup.id))?.invite).toMatchObject({ state: "pending", member: { memberId: (await bo.profile()).memberId } });
  expect((await bo.inbox()).filter((notice) => notice.kind === "invite-received")).toHaveLength(1);
});

test("conversion rejects expired, foreign, unrelated and stale Site overlaps without saving", async () => {
  const { ana, bo, input, choices } = await setup();
  const first = await ana.postAvailability(input);
  const second = await bo.postAvailability(input);
  const availabilityOverlap = { ownAvailabilityId: first.id, otherAvailabilityId: second.id };
  const confirmation = {
    activityId: input.activityId, startsAt: new Date("2026-09-18T09:30:00Z"), durationMinutes: 30, capacity: 3,
    place: { kind: "physical" as const, siteId: choices.defaultSiteId!, spot: "Cafe" }, availabilityOverlap,
  };
  const cy = await member("Cy", "Hill House");
  expect(await cy.availabilityMeetup(availabilityOverlap)).toBeUndefined();
  await expect(cy.createMeetup(confirmation)).rejects.toMatchObject({ code: "invalid-availability" });
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const outsider = await member("Di", "Harbour House", "ministry-b");
  expect(await outsider.availabilityMeetup(availabilityOverlap)).toBeUndefined();
  await expect(ana.createMeetup({ ...confirmation, activityId: choices.activities.find((entry) => entry.name === "lunch")!.id })).rejects.toMatchObject({ code: "invalid-availability" });
  await expect(ana.createMeetup({ ...confirmation, place: { kind: "virtual", url: "https://meet.example/coffee" } })).rejects.toMatchObject({ code: "invalid-availability" });
  await bo.updateProfile({ department: null, site: "Hill House" });
  expect(await ana.availabilityMeetup(availabilityOverlap)).toBeUndefined();
  await expect(ana.createMeetup(confirmation)).rejects.toMatchObject({ code: "invalid-availability" });
  await bo.updateProfile({ department: null, site: "Harbour House" });
  h.clock.set(input.endsAt);
  expect(await ana.availabilityMeetup(availabilityOverlap)).toBeUndefined();
  await expect(ana.createMeetup({ ...confirmation, startsAt: new Date("2026-09-18T10:30:00Z") })).rejects.toMatchObject({ code: "invalid-availability" });
  expect(await ana.listMeetups()).toEqual([]);
  expect((await bo.inbox()).map((notice) => notice.kind)).toEqual(["availability-overlap"]);
});

test("posting requires acknowledgement, a current Activity and Site, and a live window today", async () => {
  const { ana, input } = await setup();
  for (const window of [
    { startsAt: new Date("2026-09-19T09:00:00Z"), endsAt: new Date("2026-09-19T10:00:00Z") },
    { startsAt: new Date("2026-09-18T23:00:00Z"), endsAt: new Date("2026-09-19T01:00:00Z") },
    { startsAt: new Date("2026-09-18T08:00:00Z"), endsAt: input.startsAt },
    { startsAt: input.endsAt, endsAt: input.startsAt },
  ]) await expect(ana.postAvailability({ ...input, ...window })).rejects.toMatchObject({ code: "invalid-availability" });
  const waiting = await signInAs(h, "ministry-a", { sub: "ev", email: "ev@example.test", name: "Ev" });
  await expect(waiting.postAvailability({ ...input, kind: "virtual" })).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await expect(waiting.availability()).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await ana.updateProfile({ department: null, site: null });
  await expect(ana.postAvailability(input)).rejects.toMatchObject({ code: "invalid-availability" });
  await h.app.bootstrap(ministryB);
  const outsider = await member("Di", "Harbour House", "ministry-b");
  await expect(ana.postAvailability({ ...input, kind: "virtual", activityId: (await outsider.meetupChoices()).activities[0]!.id })).rejects.toMatchObject({ code: "invalid-availability" });
  expect((await ana.availability()).open).toEqual([]);
});

test("Availability ends at midnight and the worker cannot revive it", async () => {
  const { ana, input } = await setup();
  h.clock.set(new Date("2026-09-18T23:55:00Z"));
  await ana.postAvailability({ ...input, startsAt: h.clock.now(), endsAt: new Date("2026-09-19T00:00:00Z") });
  expect((await ana.availability()).open).toHaveLength(1);
  h.clock.set(new Date("2026-09-19T00:00:00Z"));
  expect((await ana.availability()).open).toEqual([]);
  await h.app.processAvailability();
  h.clock.set(new Date("2026-09-18T23:56:00Z"));
  expect((await ana.availability()).open).toEqual([]);
});

test("Organisation Admin Availability views record access and retired Activities hide their posts", async () => {
  const adminPerson = { sub: "olivia", email: "olivia@ministry-a.example", name: "Olivia Admin", building: "Harbour House" };
  await h.app.bootstrap({ ...withDepartmentAndSiteClaims(ministryA), organisationAdmin: adminPerson });
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", adminPerson);
  const bo = await member("Bo");
  const input: PostAvailabilityInput = {
    activityId: (await actor.meetupChoices()).activities[0]!.id, startsAt: h.clock.now(), endsAt: new Date("2026-09-18T10:00:00Z"), kind: "virtual",
  };
  const own = await actor.postAvailability(input);
  const other = await bo.postAvailability(input);
  await actor.availability();
  await actor.availabilityMeetup({ ownAvailabilityId: own.id, otherAvailabilityId: other.id });
  const admin = await actor.organisationAdmin();
  expect(await admin.auditLog()).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "availability", filter: {} }),
    expect.objectContaining({ action: "availability-meetup", filter: { ownAvailabilityId: own.id, otherAvailabilityId: other.id } }),
  ]));
  await admin.retireListEntry("activity", input.activityId);
  expect(await bo.availability()).toEqual({ open: [], suggestions: [] });
  await expect(bo.postAvailability(input)).rejects.toMatchObject({ code: "invalid-availability" });
});
