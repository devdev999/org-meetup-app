import { expect, test } from "vitest";
import type { CreateMeetupInput, MemberActions } from "../index";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";
import { createMeetupOrEvent, participationFor } from "./meetup-or-event";

const h = harness();
const member = (name: string) => signInAndAcknowledgeAs(h, "ministry-a", { sub: name, name, email: `${name.toLowerCase()}@example.test` });

async function setup() {
  await h.setupOrganisation(ministryA);
  const ana = await member("Ana");
  const input: CreateMeetupInput = {
    activityId: (await ana.meetupChoices()).activities.find((entry) => entry.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 6,
    place: { kind: "virtual", url: "https://meet.example/coffee" },
  };
  return { ana, input };
}

async function metTwice(host: MemberActions, people: MemberActions[], input: CreateMeetupInput, kind: "meetup" | "event") {
  const first = await createMeetupOrEvent(h, host, input, kind);
  const second = await createMeetupOrEvent(h, host, { ...input, startsAt: new Date("2026-09-18T11:00:00Z") }, kind);
  for (const person of people) {
    await participationFor(person, kind).join(first.id);
    await participationFor(person, kind).join(second.id);
  }
  h.clock.set(new Date("2026-09-18T12:00:00Z"));
  const ids = await Promise.all([host, ...people].map(async (person) => (await person.profile()).memberId));
  await host.confirmAttendance(first.id, ids);
  await host.confirmAttendance(second.id, ids);
  return [first.id, second.id];
}

test.each(["meetup", "event"] as const)("%s invite Suggestions prefer new Connections after Interest overlap and update after amendments", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const interests = await ana.interests();
  const sql = interests.find((entry) => entry.name === "SQL")!;
  const rust = interests.find((entry) => entry.name === "Rust")!;
  for (const person of [ana, bo, cy, di]) await person.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  await di.confirmInterest({ phrase: "Rust", selection: { interestId: rust.interestId }, stance: "shares" });
  const past = await metTwice(ana, [bo, di], input, kind);
  const future = await createMeetupOrEvent(h, ana, { ...input, startsAt: new Date("2026-09-19T10:00:00Z"), relevantInterests: [{ phrase: "Rust", selection: { interestId: rust.interestId } }] }, kind);
  const suggestions = () => kind === "meetup" ? ana.inviteSuggestions(future.id) : ana.eventInviteSuggestions(future.id);
  const entries = (await suggestions()).filter((entry) => ["Bo", "Cy", "Di"].includes(entry.member.name));
  expect(entries.find((entry) => entry.member.name === "Bo")!.reasons).not.toContain("No recorded Connection with you.");
  expect(entries.map((entry) => entry.member.name)).toEqual(["Di", "Cy", "Bo"]);
  const retained = [(await ana.profile()).memberId, (await di.profile()).memberId];
  await ana.confirmAttendance(past[0]!, retained);
  expect((await suggestions()).find((entry) => entry.member.name === "Bo")!.reasons).not.toContain("No recorded Connection with you.");
  await ana.confirmAttendance(past[1]!, retained);
  expect((await suggestions()).find((entry) => entry.member.name === "Bo")!.reasons).toContain("No recorded Connection with you.");
});

test.each(["meetup", "event"] as const)("%s Suggestions count distinct connected Participants after Interest overlap and before time", async (kind) => {
  const { ana, input } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const di = await member("Di");
  const ev = await member("Ev");
  const fo = await member("Fo");
  const sql = (await ana.interests()).find((entry) => entry.name === "SQL")!;
  await ana.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  await metTwice(ana, [bo, cy], input, kind);
  const known = await createMeetupOrEvent(h, bo, { ...input, startsAt: new Date("2026-09-19T10:00:00Z") }, kind);
  await participationFor(cy, kind).join(known.id);
  const fresh = await createMeetupOrEvent(h, di, { ...input, startsAt: new Date("2026-09-19T12:00:00Z"), capacity: 2 }, kind);
  await participationFor(fo, kind).join(fresh.id);
  expect(await participationFor(bo, kind).join(fresh.id)).toBe("waitlisted");
  const stronger = await createMeetupOrEvent(h, ev, { ...input, startsAt: new Date("2026-09-19T11:00:00Z"), relevantInterests: [{ phrase: "SQL", selection: { interestId: sql.interestId } }] }, kind);
  await participationFor(bo, kind).join(stronger.id);
  await participationFor(cy, kind).join(stronger.id);
  if (kind === "event") {
    const admin = await h.organisationAdmin();
    await admin.reassignEventHost(fresh.id, (await cy.profile()).memberId);
  }
  const suggestions = kind === "event"
    ? (await ana.eventSuggestions()).map(({ event, reasons }) => ({ id: event.id, reasons }))
    : (await ana.meetupSuggestions()).map(({ meetup, reasons }) => ({ id: meetup.id, reasons }));
  expect(suggestions.map((suggestion) => suggestion.id)).toEqual([stronger.id, fresh.id, known.id]);
  expect(suggestions[0]!.reasons).toContain("2 recorded Connections with Participants.");
  expect(suggestions[1]!.reasons).toContain("0 recorded Connections with Participants.");
  expect(suggestions[2]!.reasons).toContain("2 recorded Connections with Participants.");
});
