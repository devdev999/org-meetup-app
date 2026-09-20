import { expect, test } from "vitest";
import { parse } from "csv-parse/sync";
import { ministryA, ministryB, signInAndAcknowledgeAs, signInAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();
const adminPerson = { sub: "olivia", name: "Olivia", email: "olivia@example.test" };
const period = { from: "2026-09-01", to: "2026-09-30" };

function member(name: string) {
  return signInAndAcknowledgeAs(h, "ministry-a", { sub: name, name, email: `${name.toLowerCase()}@example.test` });
}

async function setup() {
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson,
    organisation: { ...ministryA.organisation, departments: ["Finance", "Legal"], sites: ["Harbour", "Hill"] } });
  const olivia = await signInAndAcknowledgeAs(h, "ministry-a", adminPerson);
  const admin = await olivia.organisationAdmin();
  return { olivia, admin };
}

test("participation uses current Active Members and assignments while retaining Departed Attendance", async () => {
  const { admin } = await setup();
  const people = await Promise.all(["Ana", "Bo", "Cy", "Di", "Ee"].map(member));
  for (const person of people) await person.updateProfile({ department: "Finance", site: "Harbour" });
  const [ana, bo, , , ee] = people;
  const ids = await Promise.all(people.map(async (person) => (await person.profile()).memberId));
  const occurrence = await ana!.createMeetup({
    activityId: (await ana!.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 6,
    place: { kind: "virtual", url: "https://meet.example/reports" },
  });
  await bo!.joinMeetup(occurrence.id);
  await ee!.joinMeetup(occurrence.id);
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await ana!.confirmAttendance(occurrence.id, [ids[0]!, ids[1]!, ids[4]!]);
  const roster = (await admin.roster()).filter((person) => person.memberId !== ids[4]);
  await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);

  const report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "participation-departments")).toMatchObject({
    basis: "Current Active Members and current Departments and Sites; confirmed Attendance in the selected period.",
    rows: expect.arrayContaining([["Finance", 2, 4, 50]]),
  });
  expect(report.tables.find((table) => table.id === "participation-sites")!.rows).toContainEqual(["Harbour", 2, 4, 50]);
  expect(await admin.memberAttendance(ids[4]!)).toContainEqual(expect.objectContaining({ id: occurrence.id, outcome: "attended" }));

  h.clock.set(new Date("2026-10-02T09:00:00Z"));
  await bo!.updateProfile({ department: "Legal", site: "Hill" });
  const changed = await admin.reports(period);
  expect(changed.tables.find((table) => table.id === "participation-departments")!.rows).toEqual([
    ["Finance", 1, 3, 33.33], ["Legal", 1, 1, 100], [null, 0, 1, 0],
  ]);
  expect(changed.tables.find((table) => table.id === "participation-sites")!.rows).toEqual([
    ["Harbour", 1, 3, 33.33], ["Hill", 1, 1, 100], [null, 0, 1, 0],
  ]);
});

test("participation keeps named Not set groups separate from unassigned Members", async () => {
  const { admin } = await setup();
  await admin.createListEntry("department", "Not set");
  await admin.createListEntry("site", "Not set");
  const ana = await member("Ana");
  await member("Bo");
  await ana.updateProfile({ department: "Not set", site: "Not set" });
  const occurrence = await ana.createMeetup({
    activityId: (await ana.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual", url: "https://meet.example/named-group" },
  });
  h.clock.set(new Date("2026-09-18T11:00:00Z"));
  await ana.confirmAttendance(occurrence.id, [(await ana.profile()).memberId]);
  const report = await admin.reports(period);
  for (const id of ["participation-departments", "participation-sites"]) {
    expect(report.tables.find((table) => table.id === id)!.rows).toEqual([
      ["Not set", 1, 1, 100], [null, 0, 2, 0],
    ]);
    const csv = await admin.exportReport(id, period);
    expect(csv.content).toContain('"Not set","1","1","100"');
    expect(csv.content).toContain('"","0","2","0"');
  }
});

test("weekly occurrences, RSVP, confirmed no-shows and Activity ratings match the fixture", async () => {
  const { admin, olivia } = await setup();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const cy = await member("Cy");
  const anaId = (await ana.profile()).memberId;
  const boId = (await bo.profile()).memberId;
  const cyId = (await cy.profile()).memberId;
  const choices = await ana.meetupChoices();
  const input = { activityId: choices.activities.find((activity) => activity.name === "coffee")!.id,
    startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 6,
    place: { kind: "virtual" as const, url: "https://meet.example/metrics" } };
  const first = await ana.createMeetup(input);
  await bo.joinMeetup(first.id);
  await cy.joinMeetup(first.id);
  const recurring = await ana.createMeetup({ ...input, startsAt: new Date("2026-09-19T10:00:00Z"),
    recurrence: { frequency: "weekly", endsOn: "2026-09-19" } });
  await bo.joinSeries(recurring.recurrence!.id);
  await bo.answerRsvp(recurring.id, "going");
  await cy.joinSeries(recurring.recurrence!.id);
  await cy.answerRsvp(recurring.id, "not-going");
  const unknown = await ana.createMeetup({ ...input, startsAt: new Date("2026-09-20T10:00:00Z") });
  await bo.joinMeetup(unknown.id);
  const event = await admin.createEvent({ ...input, startsAt: new Date("2026-09-28T10:00:00Z"),
    activityId: choices.activities.find((activity) => activity.name === "walk")!.id });
  await ana.joinEvent(event.id);
  h.clock.set(new Date("2026-09-19T11:00:00Z"));
  await ana.confirmAttendance(first.id, [anaId, boId]);
  await ana.confirmAttendance(recurring.id, [anaId]);
  await ana.rateOccurrence(first.id, 4);
  await bo.rateOccurrence(first.id, 2);

  let report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([
    ["2026-09-14", "Meetup", "coffee", 3], ["2026-09-28", "Event", "walk", 1],
  ]);
  expect(report.tables.find((table) => table.id === "rsvp-attendance")!.rows).toContainEqual(["Meetup", 4, 1, 1, 4, 3, 2, 50]);
  expect(report.tables.find((table) => table.id === "ratings")!.rows).toEqual([["coffee", 2, 3]]);
  await ana.confirmAttendance(first.id, [anaId, boId, cyId]);
  report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "rsvp-attendance")!.rows).toContainEqual(["Meetup", 4, 1, 1, 4, 4, 1, 25]);

  h.clock.set(new Date("2026-09-28T11:00:00Z"));
  await olivia.confirmAttendance(event.id, [(await olivia.profile()).memberId, anaId]);
  await olivia.rateOccurrence(event.id, 5);
  report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "rsvp-attendance")!.rows).toEqual([
    ["Meetup", 6, 1, 1, 4, 4, 1, 25], ["Event", 2, 0, 0, 2, 2, 0, 0],
  ]);
  expect(report.tables.find((table) => table.id === "ratings")!.rows).toEqual([["coffee", 2, 3], ["walk", 1, 5]]);
});

test.each(["meetup", "event"] as const)("%s waitlist frequency survives promotion and leaving", async (kind) => {
  const { admin, olivia } = await setup();
  const bo = await member("Bo");
  const cy = await member("Cy");
  const input = { activityId: (await olivia.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual" as const, url: "https://meet.example/waitlist" } };
  const first = kind === "meetup" ? await olivia.createMeetup(input) : await admin.createEvent(input);
  if (kind === "meetup") {
    await olivia.createMeetup(input);
    await bo.joinMeetup(first.id);
    expect(await cy.joinMeetup(first.id)).toBe("waitlisted");
    await bo.leaveMeetup(first.id);
    await cy.leaveMeetup(first.id);
  } else {
    await admin.createEvent(input);
    await bo.joinEvent(first.id);
    expect(await cy.joinEvent(first.id)).toBe("waitlisted");
    await bo.leaveEvent(first.id);
    await cy.leaveEvent(first.id);
  }
  const report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "waitlists")!.rows)
    .toContainEqual([kind === "meetup" ? "Meetup" : "Event", 2, 2, 1, 0, 50]);
});

test("Interest demand, Availability and Telegram figures use the documented populations without multiplying joins", async () => {
  const { admin } = await setup();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const cy = await member("Cy");
  const departed = await member("Departed");
  const catalog = await ana.interests();
  const sql = catalog.find((interest) => interest.name === "SQL")!;
  const rust = catalog.find((interest) => interest.name === "Rust")!;
  for (const person of [ana, bo]) {
    await person.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
    await person.confirmInterest({ phrase: "Rust", selection: { interestId: rust.interestId }, stance: "seeks" });
  }
  await cy.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "seeks" });
  await departed.confirmInterest({ phrase: "Rust", selection: { interestId: rust.interestId }, stance: "shares" });
  for (const [person, chatId] of [[ana, "ana-chat"], [departed, "departed-chat"]] as const) {
    const link = await person.beginTelegramLink();
    await h.app.handleTelegram({ kind: "link", chatId, code: new URL(link.url).searchParams.get("start")! });
  }
  await admin.suspendMember((await departed.profile()).memberId);
  const choices = await ana.meetupChoices();
  for (const person of [ana, bo]) for (const name of ["coffee", "walk"]) {
    await person.postAvailability({ activityId: choices.activities.find((activity) => activity.name === name)!.id,
      startsAt: new Date("2026-09-18T09:00:00Z"), endsAt: new Date("2026-09-18T10:00:00Z"), kind: "virtual" });
  }
  const report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "shared-interests")!.rows).toEqual([["SQL", "Skill", 2]]);
  expect(report.tables.find((table) => table.id === "sought-interests")!.rows).toEqual([["Rust", "Skill", 2], ["SQL", "Skill", 1]]);
  expect(report.tables.find((table) => table.id === "unmet-seeks")!.rows).toEqual([["Rust", "Skill", 2]]);
  expect(report.tables.find((table) => table.id === "availability")!.rows).toEqual([[4, 2, 2]]);
  expect((await admin.exportReport("availability", period)).content).toContain('"4","2","2"');
  expect(report.tables.find((table) => table.id === "telegram")!.rows).toEqual([[1, 4, 25]]);
});

test("Availability overlaps survive missed worker runs and exclude future or nonconcurrent posts", async () => {
  const { admin } = await setup();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const activityId = (await ana.meetupChoices()).activities[0]!.id;
  for (const person of [ana, bo]) await person.postAvailability({ activityId, kind: "virtual",
    startsAt: new Date("2026-09-18T09:01:10Z"), endsAt: new Date("2026-09-18T09:01:30Z") });
  const usage = async () => (await admin.reports(period)).tables.find((table) => table.id === "availability")!.rows;
  h.clock.set(new Date("2026-09-18T09:01:00Z"));
  await h.app.processAvailability();
  expect(await usage()).toEqual([[2, 2, 0]]);
  h.clock.set(new Date("2026-09-18T09:01:20Z"));
  expect((await ana.availability()).suggestions).toHaveLength(1);
  expect(await usage()).toEqual([[2, 2, 1]]);
  h.clock.set(new Date("2026-09-18T09:02:00Z"));
  await h.app.processAvailability();
  expect(await usage()).toEqual([[2, 2, 1]]);

  const cy = await member("Cy");
  await ana.postAvailability({ activityId, kind: "virtual",
    startsAt: new Date("2026-09-18T09:03:10Z"), endsAt: new Date("2026-09-18T09:03:30Z") });
  h.clock.set(new Date("2026-09-18T09:03:40Z"));
  await cy.postAvailability({ activityId, kind: "virtual",
    startsAt: new Date("2026-09-18T09:03:10Z"), endsAt: new Date("2026-09-18T09:04:30Z") });
  expect((await cy.availability()).suggestions).toHaveLength(0);
  expect(await usage()).toEqual([[4, 3, 1]]);
});

test.each(["suspension", "departure"] as const)("activation requires Interest and Attendance within the original window after %s", async (change) => {
  h.clock.set(new Date("2026-09-01T09:00:00Z"));
  const { admin, olivia } = await setup();
  const rows = [...await admin.roster(), ...["Ana", "Going", "Late"].map((name) => ({
    name, email: `${name.toLowerCase()}@example.test`, department: null, site: null,
  }))];
  await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  h.clock.set(new Date("2026-09-05T09:00:00Z"));
  const ana = await member("Ana");
  const going = await member("Going");
  const late = await member("Late");
  const sql = (await ana.interests()).find((interest) => interest.name === "SQL")!;
  for (const person of [ana, going, late]) await person.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  const input = { activityId: (await olivia.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-10T10:00:00Z"), durationMinutes: 60, capacity: 5,
    place: { kind: "virtual" as const, url: "https://meet.example/activation" } };
  const early = await olivia.createMeetup(input);
  await ana.joinMeetup(early.id);
  await going.joinMeetup(early.id);
  h.clock.set(new Date("2026-09-10T11:00:00Z"));
  await olivia.confirmAttendance(early.id, [(await ana.profile()).memberId]);
  const anaId = (await ana.profile()).memberId;
  const lateId = (await late.profile()).memberId;
  if (change === "suspension") {
    await admin.suspendMember(anaId);
    await admin.suspendMember(lateId);
  } else {
    const remaining = rows.filter((row) => row.email !== "ana@example.test" && row.email !== "late@example.test");
    await admin.commitRoster(remaining, (await admin.previewRoster(remaining)).revision);
  }
  h.clock.set(new Date("2026-10-02T09:00:00Z"));
  if (change === "suspension") {
    await admin.reinstateMember(anaId);
    await admin.reinstateMember(lateId);
  } else {
    await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
    await member("Ana");
    await member("Late");
  }
  await ana.setInterestStance({ interestId: sql.interestId, stance: "seeks" });
  const later = await admin.createEvent({ ...input, startsAt: new Date("2026-10-03T10:00:00Z") });
  await late.joinEvent(later.id);
  h.clock.set(new Date("2026-10-03T11:00:00Z"));
  await olivia.confirmAttendance(later.id, [lateId]);

  const report = await admin.reports(period);
  expect(report.tables.find((table) => table.id === "activation")!.rows).toEqual([[5, 1, 0, 20]]);
});

test("the individual report retains occurrence counts, Connections, Availability, Interests and Flags", async () => {
  const { admin, olivia } = await setup();
  const ana = await member("Ana");
  const bo = await member("Bo");
  const anaId = (await ana.profile()).memberId;
  const boId = (await bo.profile()).memberId;
  const activityId = (await ana.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id;
  const input = { activityId, startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 4,
    place: { kind: "virtual" as const, url: "https://meet.example/individual" } };
  const first = await ana.createMeetup(input);
  const second = await ana.createMeetup({ ...input, startsAt: new Date("2026-09-19T10:00:00Z") });
  const event = await admin.createEvent({ ...input, startsAt: new Date("2026-09-20T10:00:00Z") });
  await bo.joinMeetup(first.id);
  await bo.joinMeetup(second.id);
  await ana.joinEvent(event.id);
  const interest = (await ana.interests()).find((row) => row.name === "Rust")!;
  await ana.confirmInterest({ phrase: "Rust", selection: { interestId: interest.interestId }, stance: "seeks" });
  await ana.postAvailability({ activityId, kind: "virtual", startsAt: h.clock.now(), endsAt: new Date("2026-09-18T09:30:00Z") });
  await ana.flag({ target: { kind: "member", id: boId }, reason: "Please review." });
  await bo.flag({ target: { kind: "member", id: anaId }, reason: "Please review this Member." });
  h.clock.set(new Date("2026-09-20T11:00:00Z"));
  await ana.confirmAttendance(first.id, [anaId, boId]);
  await ana.confirmAttendance(second.id, [anaId, boId]);
  await olivia.confirmAttendance(event.id, [(await olivia.profile()).memberId]);
  await admin.suspendMember(anaId);

  const report = await admin.memberReport(anaId, period);
  expect(report.tables.find((table) => table.id === "member-counts")!.rows).toEqual([
    ["Meetup", 2, 2, 2, 0], ["Event", 0, 1, 0, 1],
  ]);
  expect(report.tables.find((table) => table.id === "member-connections")!.rows).toEqual([["Bo", 2]]);
  expect(report.tables.find((table) => table.id === "member-interests")!.rows).toEqual([["Rust", "Skill", "Seeks"]]);
  expect(report.tables.find((table) => table.id === "member-flags")!.rows).toEqual([[1, 1]]);
  expect(report.tables.find((table) => table.id === "member-availability")!.rows).toEqual([
    ["coffee", "2026-09-18T09:00:00.000Z", "2026-09-18T09:30:00.000Z", "Virtual"],
  ]);
  expect(await admin.auditLog()).toContainEqual(expect.objectContaining({ action: "member-report", filter: { ...period, memberId: anaId } }));
});

test("last activity records successful Member actions and login but excludes reads, failures, admin edits and jobs", async () => {
  const { admin, olivia } = await setup();
  const ana = await member("Ana");
  const anaId = (await ana.profile()).memberId;
  async function lastActivity() {
    const report = await admin.memberReport(anaId, period);
    const table = report.tables.find((entry) => entry.id === "member-profile")!;
    return table.rows[0]![table.columns.indexOf("Last activity")];
  }
  expect(await lastActivity()).toBe("2026-09-18T09:00:00.000Z");
  h.clock.set(new Date("2026-09-18T09:05:00Z"));
  await ana.profile();
  await ana.myInterests();
  await expect(ana.updateProfile({ department: "Missing", site: null })).rejects.toThrow();
  const roster = (await admin.roster()).map((row) => row.memberId === anaId ? { ...row, department: "Legal" } : row);
  await admin.commitRoster(roster, (await admin.previewRoster(roster)).revision);
  const input = { activityId: (await olivia.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 4,
    place: { kind: "virtual" as const, url: "https://meet.example/activity" }, recurrence: { frequency: "weekly" as const } };
  await olivia.createMeetup(input);
  await h.app.processRecurrences();
  await h.app.deliverNotices();
  expect(await lastActivity()).toBe("2026-09-18T09:00:00.000Z");

  await signInAs(h, "ministry-a", { sub: "Ana", name: "Ana", email: "ana@example.test" });
  expect(await lastActivity()).toBe("2026-09-18T09:05:00.000Z");
  h.clock.set(new Date("2026-09-18T09:10:00Z"));
  await ana.updateProfile({ department: "Finance", site: "Harbour" });
  expect(await lastActivity()).toBe("2026-09-18T09:10:00.000Z");
  const sql = (await ana.interests()).find((interest) => interest.name === "SQL")!;
  h.clock.set(new Date("2026-09-18T09:15:00Z"));
  await ana.confirmInterest({ phrase: "SQL", selection: { interestId: sql.interestId }, stance: "shares" });
  expect(await lastActivity()).toBe("2026-09-18T09:15:00.000Z");
  h.clock.set(new Date("2026-09-18T09:20:00Z"));
  await ana.setInterestStance({ interestId: sql.interestId, stance: "seeks" });
  expect(await lastActivity()).toBe("2026-09-18T09:20:00.000Z");
  h.clock.set(new Date("2026-09-18T09:25:00Z"));
  await ana.createMeetup({ ...input, recurrence: undefined });
  expect(await lastActivity()).toBe("2026-09-18T09:25:00.000Z");
  const link = await ana.beginTelegramLink();
  h.clock.set(new Date("2026-09-18T09:26:00Z"));
  await h.app.handleTelegram({ kind: "link", chatId: "ana-chat", code: new URL(link.url).searchParams.get("start")! });
  expect(await lastActivity()).toBe("2026-09-18T09:26:00.000Z");
});

test("an Organisation Admin command records the acting admin's activity without changing the target's", async () => {
  const { admin, olivia } = await setup();
  const ana = await member("Ana");
  const anaId = (await ana.profile()).memberId;
  const adminId = (await olivia.profile()).memberId;
  h.clock.set(new Date("2026-09-18T09:05:00Z"));
  await admin.suspendMember(anaId);
  for (const [id, expected] of [[adminId, "2026-09-18T09:05:00.000Z"], [anaId, "2026-09-18T09:00:00.000Z"]]) {
    const table = (await admin.memberReport(id!, period)).tables.find((row) => row.id === "member-profile")!;
    expect(table.rows[0]![table.columns.indexOf("Last activity")]).toBe(expected);
  }
});

test("every report table exports its figures and basis as safe CSV and records the access", async () => {
  const { admin, olivia } = await setup();
  const ana = await member("Ana");
  const memberId = (await ana.profile()).memberId;
  const name = '=1+1, "Finance"\nOffice';
  await admin.createListEntry("department", name);
  await ana.updateProfile({ department: name, site: "Harbour" });
  const report = await admin.reports(period);
  expect(report.tables.map((table) => table.id).sort()).toEqual([
    "activation", "availability", "participation-departments", "participation-sites", "ratings", "rsvp-attendance",
    "shared-interests", "sought-interests", "telegram", "unmet-seeks", "waitlists", "weekly-occurrences",
  ]);
  for (const table of report.tables) {
    const csv = await admin.exportReport(table.id, period);
    const rows = parse(csv.content, { bom: true, relax_column_count: true });
    expect(csv.filename).toBe(`${table.id}-2026-09-01-2026-09-30.csv`);
    expect(rows).toContainEqual(table.columns);
    expect(rows).toContainEqual(["Basis", table.basis]);
    expect(rows).toContainEqual(["From", "2026-09-01"]);
    if (table.id === "participation-departments") expect(rows).toContainEqual([`'${name}`, "0", "1", "0"]);
  }
  const individual = await admin.memberReport(memberId, period);
  for (const table of individual.tables) {
    const csv = await admin.exportMemberReport(memberId, table.id, period);
    expect(parse(csv.content, { bom: true, relax_column_count: true })).toContainEqual(table.columns);
  }
  const audit = await admin.auditLog();
  expect(audit.filter((entry) => entry.action === "aggregate-report-export")).toHaveLength(12);
  expect(audit.filter((entry) => entry.action === "member-report-export")).toHaveLength(individual.tables.length);
  expect(audit).toContainEqual(expect.objectContaining({ actorMemberId: (await olivia.profile()).memberId,
    action: "member-report-export", filter: { memberId, table: "member-counts", ...period }, createdAt: h.clock.now() }));
  const auditCsv = await admin.exportAuditLog();
  expect(auditCsv.content).toContain("member-report-export");
  expect(await admin.auditLog()).toContainEqual(expect.objectContaining({ action: "audit-log-export", filter: {} }));
  expect((await admin.exportRatings()).content).toContain('"Activity","Ratings","Average"');
  expect((await admin.exportMemberAttendance(memberId)).content).toContain('"Kind","Activity","Starts at","Place","Attendance"');
});

test("Platform Admin audit identifies accessing admins while omitting viewed Members and personal filters", async () => {
  const { admin, olivia } = await setup();
  const target = await member("PrivatePerson");
  const memberId = (await target.profile()).memberId;
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  const platform = await pat.platformAdmin();
  await admin.memberReport(memberId, period);
  await admin.exportMemberReport(memberId, "member-counts", period);
  await olivia.searchMembers({ interest: "personal search value", department: "Private Department", site: "Private Site" });
  const otherPerson = { sub: "other-admin", name: "Other Admin", email: "admin@other.example" };
  await h.app.bootstrap({ ...ministryB, organisationAdmin: otherPerson });
  const otherActor = await signInAndAcknowledgeAs(h, "ministry-b", otherPerson);
  const otherAdmin = await otherActor.organisationAdmin();
  await otherAdmin.memberReport((await otherActor.profile()).memberId, period);
  const entries = await platform.auditLog();
  expect(entries).toContainEqual(expect.objectContaining({ actorName: "Olivia", actorMemberId: (await olivia.profile()).memberId,
    action: "member-report-export", createdAt: h.clock.now(), filter: { ...period, table: "member-counts" } }));
  expect(entries).toContainEqual(expect.objectContaining({ actorName: "Other Admin", organisationName: "Ministry B" }));
  expect(entries.find((entry) => entry.action === "member-search")!.filter).toEqual({});
  const exported = await platform.exportAuditLog();
  for (const secret of [memberId, "PrivatePerson", "privateperson@example.test", "personal search value", "Private Department", "Private Site"]) {
    expect(JSON.stringify(entries)).not.toContain(secret);
    expect(exported.content).not.toContain(secret);
  }
  expect(exported.content).toContain("Olivia");
  expect(exported.content).toContain("2026-09-18T09:00:00.000Z");
  expect(await admin.auditLog()).toContainEqual(expect.objectContaining({ action: "member-report", filter: { memberId, ...period } }));
  expect((await admin.auditLog()).every((entry) => entry.organisationName === "Ministry A")).toBe(true);
  expect((await otherAdmin.auditLog()).every((entry) => entry.organisationName === "Ministry B")).toBe(true);
  expect(platform).not.toHaveProperty("memberReport");
  expect(platform).not.toHaveProperty("exportMemberReport");
  await expect(target.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(pat.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(olivia.platformAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(otherAdmin.memberReport(memberId, period)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(otherAdmin.exportMemberReport(memberId, "member-profile", period)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await admin.suspendMember((await pat.profile()).memberId);
  await expect(platform.auditLog()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platform.exportAuditLog()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

test("reports validate periods, isolate Organisations and recheck a retained admin actor", async () => {
  const { admin, olivia } = await setup();
  await h.app.bootstrap({ ...ministryB, organisationAdmin: { name: "Other", email: "other@example.test" } });
  const other = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other", name: "Other", email: "other@example.test" });
  await other.createMeetup({ activityId: (await other.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-09-19T10:00:00Z"), durationMinutes: 60, capacity: 2,
    place: { kind: "virtual", url: "https://meet.example/other" } });
  expect((await admin.reports(period)).tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([]);
  for (const invalid of [{ from: "2026-02-30", to: "2026-09-30" }, { from: "2026-10-01", to: "2026-09-30" }, { from: "Private Person", to: "2026-09-30" }]) {
    await expect(admin.reports(invalid)).rejects.toMatchObject({ code: "invalid-report" });
    await expect(admin.exportReport("ratings", invalid)).rejects.toMatchObject({ code: "invalid-report" });
  }
  await expect(admin.exportReport("member-profile", period)).rejects.toMatchObject({ code: "invalid-report" });
  await expect(admin.memberReport((await other.profile()).memberId, period)).rejects.toMatchObject({ name: "AccessDeniedError" });
  const anaPerson = { sub: "ana", name: "Ana", email: "ana@example.test" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: anaPerson });
  const anaAdmin = await (await signInAndAcknowledgeAs(h, "ministry-a", anaPerson)).organisationAdmin();
  const adminId = (await olivia.profile()).memberId;
  await anaAdmin.suspendMember(adminId);
  for (const selected of [period, { from: "invalid", to: "2026-09-30" }]) {
    await expect(admin.reports(selected)).rejects.toMatchObject({ name: "AccessDeniedError" });
    await expect(admin.memberReport(adminId, selected)).rejects.toMatchObject({ name: "AccessDeniedError" });
    await expect(admin.exportReport("ratings", selected)).rejects.toMatchObject({ name: "AccessDeniedError" });
    await expect(admin.exportMemberReport(adminId, "member-counts", selected)).rejects.toMatchObject({ name: "AccessDeniedError" });
  }
  await expect(admin.exportMemberAttendance(adminId)).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(admin.exportRatings()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(admin.exportAuditLog()).rejects.toMatchObject({ name: "AccessDeniedError" });
});
