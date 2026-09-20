import { expect, test } from "vitest";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("initial setup creates the first Platform Admin once and leaves later Organisation configuration to the UI", async () => {
  await h.app.initializePlatform(ministryA);
  await h.app.initializePlatform({ ...ministryA, organisation: { slug: "ignored", name: "Ignored" },
    platformAdmin: { name: "Replacement", email: "replacement@example.test" } });
  expect(await h.app.signInOptions()).toEqual([{ slug: "ministry-a", name: "Ministry A" }]);
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  expect(await pat.platformAdmin()).toBeDefined();
  await expect(pat.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  const stranger = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "replacement", name: "Replacement", email: "replacement@example.test" });
  await expect(stranger.platformAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

async function platformAdmin() {
  await h.app.initializePlatform(ministryA);
  return (await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin })).platformAdmin();
}

test("a Platform Admin creates a ready Organisation with its first Organisation Admin and starter lists", async () => {
  const platform = await platformAdmin();
  const input = { organisation: { slug: "new-agency", name: "New Agency" },
    oidc: { issuer: "https://issuer.new-agency.example", clientId: "meetups", credentialRef: null, claimMapping: { email: "email", name: "name" } },
    organisationAdmin: { email: "olivia@new-agency.example", name: "Olivia" } };
  const created = await platform.createOrganisation(input);
  expect(created).toMatchObject({ slug: "new-agency", name: "New Agency", signInReady: true, oidc: input.oidc });
  expect(await h.app.signInOptions()).toContainEqual({ slug: "new-agency", name: "New Agency" });
  expect(await platform.organisations()).toContainEqual(created);
  const olivia = await signInAndAcknowledgeAs(h, "new-agency", { sub: "olivia", ...input.organisationAdmin });
  const admin = await olivia.organisationAdmin();
  expect((await admin.lists()).activities.map((activity) => activity.name)).toEqual(["coffee", "game", "learning session", "lunch", "other", "sport", "walk"]);
  expect((await olivia.interests()).map((interest) => interest.name)).toEqual(expect.arrayContaining(["SQL", "Rust", "Board games"]));
  await expect(olivia.platformAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platform.createOrganisation(input)).rejects.toMatchObject({ code: "invalid-organisation" });
});

test("onboarding reports missing OIDC credentials without accepting a secret value", async () => {
  const platform = await platformAdmin();
  const input = { organisation: { slug: "private-agency", name: "Private Agency" },
    oidc: { issuer: "https://issuer.private-agency.example", clientId: "meetups", credentialRef: "agency-sso", claimMapping: { email: "email", name: "name" } },
    organisationAdmin: { email: "olivia@private-agency.example", name: "Olivia" } };
  const created = await platform.createOrganisation(input);
  expect(created).toMatchObject({ signInReady: false, oidc: { credentialRef: "agency-sso" } });
  expect(await platform.organisations()).toContainEqual(created);
  await expect(h.app.beginSignIn({ organisationSlug: "private-agency", redirectUri: "https://meetups.example/auth/callback" }))
    .rejects.toMatchObject({ code: "not-configured" });
  await expect(platform.createOrganisation({ ...input, organisation: { slug: "bad", name: "Bad" },
    oidc: { ...input.oidc, ...{ clientSecret: "must-not-be-stored" } } })).rejects.toMatchObject({ code: "invalid-organisation" });
});

test("a Platform Admin completes the owner Organisation's first Organisation Admin setup without replacing an existing Organisation Admin", async () => {
  const platform = await platformAdmin();
  const owner = (await platform.organisations())[0]!;
  expect(owner.hasOrganisationAdmin).toBe(false);
  const person = { name: "Olivia", email: "olivia@example.test" };
  await platform.setFirstOrganisationAdmin(owner.id, person);
  await platform.setFirstOrganisationAdmin(owner.id, person);
  expect((await platform.organisations())[0]!.hasOrganisationAdmin).toBe(true);
  const olivia = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...person });
  expect(await olivia.organisationAdmin()).toBeDefined();
  await expect(platform.setFirstOrganisationAdmin(owner.id, { name: "Different", email: "different@example.test" }))
    .rejects.toMatchObject({ code: "invalid-organisation" });
});

test("a Platform Admin groups Organisations into Ministries and can remove the grouping", async () => {
  const platform = await platformAdmin();
  const ministry = await platform.createMinistry("Public Services");
  expect(await platform.ministries()).toEqual([ministry]);
  const owner = (await platform.organisations())[0]!;
  await platform.assignMinistry(owner.id, ministry.id);
  expect((await platform.organisations())[0]!.ministryId).toBe(ministry.id);
  await platform.assignMinistry(owner.id, null);
  expect((await platform.organisations())[0]!.ministryId).toBe(null);
  await expect(platform.createMinistry(" public services ")).rejects.toMatchObject({ code: "invalid-ministry" });
});

test("Ministry reports combine underlying populations and ratings and keep Availability inside each Organisation", async () => {
  const platform = await platformAdmin();
  const ministry = await platform.createMinistry("Public Services");
  const period = { from: "2026-09-01", to: "2026-09-30" };
  const scope = { kind: "ministry" as const, id: ministry.id };
  for (const [slug, population, scores] of [["agency-a", 2, [[5]]], ["agency-b", 8, [[1, 2], [3]]]] as const) {
    h.clock.set(new Date("2026-09-18T09:00:00Z"));
    const firstAdmin = { name: `${slug} 0`, email: `0@${slug}.example` };
    const organisation = await platform.createOrganisation({ organisation: { slug, name: slug }, oidc: ministryA.oidc, organisationAdmin: firstAdmin });
    await platform.assignMinistry(organisation.id, ministry.id);
    const people = [];
    for (let index = 0; index < population; index++) {
      people.push(await signInAndAcknowledgeAs(h, slug, { sub: `${index}`, name: `${slug} ${index}`, email: `${index}@${slug}.example` }));
    }
    const host = people[0]!;
    const admin = await host.organisationAdmin();
    await admin.createListEntry("department", "Finance");
    for (const person of people) await person.updateProfile({ department: "Finance", site: null });
    const activityId = (await host.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id;
    await host.postAvailability({ activityId, kind: "virtual", startsAt: new Date("2026-09-18T09:00:00Z"), endsAt: new Date("2026-09-18T10:00:00Z") });
    const interestId = (await host.interests()).find((interest) => interest.name === "SQL")!.interestId;
    await host.confirmInterest({ phrase: "SQL", selection: { interestId }, stance: slug === "agency-a" ? "seeks" : "shares" });
    for (const [index, values] of scores.entries()) {
      const occurrence = await host.createMeetup({ activityId, startsAt: new Date(`2026-09-${19 + index}T10:00:00Z`),
        durationMinutes: 60, capacity: 4, place: { kind: "virtual", url: "https://meet.example/ministry" } });
      if (values.length > 1) await people[1]!.joinMeetup(occurrence.id);
      h.clock.set(new Date(`2026-09-${19 + index}T11:00:00Z`));
      const attendees = people.slice(0, values.length);
      await host.confirmAttendance(occurrence.id, await Promise.all(attendees.map(async (person) => (await person.profile()).memberId)));
      for (const [ratingIndex, rating] of values.entries()) await people[ratingIndex]!.rateOccurrence(occurrence.id, rating);
    }
    const report = await platform.reports({ kind: "organisation", id: organisation.id }, period);
    expect(report.tables.find((table) => table.id === "participation-departments")!.rows)
      .toEqual([["Finance", slug === "agency-a" ? 1 : 2, population, slug === "agency-a" ? 50 : 25]]);
  }
  const report = await platform.reports(scope, period);
  expect(report.tables.find((table) => table.id === "participation-departments")!.rows).toEqual([["Finance", 3, 10, 30]]);
  expect(report.tables.find((table) => table.id === "ratings")!.rows).toEqual([["coffee", 4, 2.75]]);
  expect(report.tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([["2026-09-14", "Meetup", "coffee", 3]]);
  expect(report.tables.find((table) => table.id === "unmet-seeks")!.rows).toEqual([]);
  expect(report.tables.find((table) => table.id === "availability")!.rows).toEqual([[2, 2, 0]]);
  const csv = await platform.exportReport(scope, "participation-departments", period);
  expect(csv.content).toContain('"Finance","3","10","30"');
  expect(csv.content).toContain("Public Services");
  expect(csv.content).not.toContain("agency-a 0");
  await expect(platform.exportReport(scope, "member-profile", period)).rejects.toMatchObject({ code: "invalid-report" });
  const empty = await platform.createMinistry("Empty Ministry");
  const emptyReport = await platform.reports({ kind: "ministry", id: empty.id }, period);
  expect(emptyReport.tables.find((table) => table.id === "participation-departments")!.rows).toEqual([]);
  expect(emptyReport.tables.find((table) => table.id === "telegram")!.rows).toEqual([[0, 0, null]]);
  await expect(platform.reports({ kind: "ministry", id: "00000000-0000-4000-8000-000000000000" }, period)).rejects.toMatchObject({ code: "invalid-report" });
});

test("saved deployment settings affect the same running application and keep extraction separate from Scout", async () => {
  const platform = await platformAdmin();
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  const settings = { aiBaseUrl: "https://ai.example/v1", scoutModel: "scout-model", extractionModel: "gpt-5.6-luna",
    telegramBotUsername: "new_meetups_bot", emailFrom: "notices@example.test", timeZone: "Asia/Singapore" };
  await platform.updateSettings(settings);
  expect(await platform.settings()).toEqual(settings);
  await h.app.initializeDeploymentSettings();
  expect(await platform.settings()).toEqual(settings);
  await pat.resolveInterest({ phrase: "Woodturning", kind: "hobby" });
  const activityId = (await pat.meetupChoices()).activities[0]!.id;
  await pat.extractMeetupInterests({ activityId, description: "SQL practice" });
  expect(h.ai.requestSettings[0]).toEqual({ baseUrl: settings.aiBaseUrl, model: "gpt-5.6-luna" });
  expect(h.ai.extractionSettings[0]).toEqual({ baseUrl: settings.aiBaseUrl, model: "gpt-5.6-luna" });
  expect((await pat.beginTelegramLink()).url).toMatch(/^https:\/\/t.me\/new_meetups_bot\?/);
  const meetup = await pat.createMeetup({ activityId, startsAt: new Date("2026-09-18T10:00:00Z"), durationMinutes: 60, capacity: 3,
    place: { kind: "virtual", url: "https://meet.example/settings" } });
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  await ana.joinMeetup(meetup.id);
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ from: "notices@example.test", to: ministryA.platformAdmin.email }));
  await platform.updateSettings({ ...settings, aiBaseUrl: "https://new-ai.example/v2", extractionModel: "new-small-model", telegramBotUsername: null, emailFrom: "changed@example.test" });
  await pat.resolveInterest({ phrase: "Wood carving", kind: "hobby" });
  expect(h.ai.requestSettings.at(-1)).toEqual({ baseUrl: "https://new-ai.example/v2", model: "new-small-model" });
  expect((await platform.settings()).scoutModel).toBe("scout-model");
  expect((await pat.notificationSettings()).telegramAvailable).toBe(false);
  await expect(pat.beginTelegramLink()).rejects.toMatchObject({ code: "invalid-telegram-link" });
  await pat.cancelMeetup(meetup.id);
  expect(h.email.outbox).toContainEqual(expect.objectContaining({ from: "changed@example.test", to: "ana@example.test" }));
  for (const invalid of [{ apiKey: "must-not-be-stored" }, { aiBaseUrl: "https://ai.example/v1?api_key=secret" }, { aiBaseUrl: "https://key@ai.example/v1" }, { timeZone: "Not/AZone" }]) {
    await expect(platform.updateSettings({ ...settings, ...invalid })).rejects.toMatchObject({ code: "invalid-settings" });
  }
  await expect(ana.platformAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

test("the deployment calendar controls Availability days, report dates and the next morning's digest", async () => {
  h.clock.set(new Date("2026-09-18T16:30:00Z"));
  const platform = await platformAdmin();
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  await platform.updateSettings({ ...await platform.settings(), timeZone: "Asia/Singapore" });
  const activityId = (await pat.meetupChoices()).activities[0]!.id;
  await pat.postAvailability({ activityId, kind: "virtual", startsAt: new Date("2026-09-18T16:30:00Z"), endsAt: new Date("2026-09-19T16:00:00Z") });
  await expect(pat.postAvailability({ activityId, kind: "virtual", startsAt: new Date("2026-09-18T15:59:00Z"), endsAt: new Date("2026-09-18T17:00:00Z") }))
    .rejects.toMatchObject({ code: "invalid-availability" });
  const meetup = await pat.createMeetup({ activityId, startsAt: new Date("2026-09-19T16:00:00Z"), durationMinutes: 60, capacity: 3,
    place: { kind: "virtual", url: "https://meet.example/calendar" } });
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  await ana.joinMeetup(meetup.id);
  await ana.leaveMeetup(meetup.id);
  expect((await pat.inbox())[0]!.message).toContain("2026-09-20 00:00 Asia/Singapore");
  h.email.reset();
  h.clock.set(new Date("2026-09-19T00:59:00Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date("2026-09-19T01:00:00Z"));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toHaveLength(1);
  const scope = { kind: "organisation" as const, id: (await platform.organisations())[0]!.id };
  const period = { from: "2026-09-20", to: "2026-09-20" };
  const report = await platform.reports(scope, period);
  expect(report.timeZone).toBe("Asia/Singapore");
  expect(report.tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([["2026-09-14", "Meetup", "coffee", 1]]);
  expect((await platform.exportReport(scope, "weekly-occurrences", period)).content).toContain('"Time zone","Asia/Singapore"');
  const previousDay = await platform.reports(scope, { from: "2026-09-19", to: "2026-09-19" });
  expect(previousDay.tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([]);
});

test("a recurring Meetup keeps its creation calendar through daylight saving and later deployment changes", async () => {
  h.clock.set(new Date("2026-03-01T14:00:00Z"));
  const platform = await platformAdmin();
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  await platform.updateSettings({ ...await platform.settings(), timeZone: "America/New_York" });
  const first = await pat.createMeetup({ activityId: (await pat.meetupChoices()).activities[0]!.id,
    startsAt: new Date("2026-03-01T15:00:00Z"), durationMinutes: 60, capacity: 3,
    place: { kind: "virtual", url: "https://meet.example/daylight-saving" }, recurrence: { frequency: "weekly", endsOn: "2026-03-15" } });
  expect(first.recurrence!.timeZone).toBe("America/New_York");
  await platform.updateSettings({ ...await platform.settings(), timeZone: "UTC" });
  h.clock.set(new Date("2026-03-07T00:00:00Z"));
  await h.app.processRecurrences();
  expect((await pat.listMeetups()).map((meetup) => meetup.startsAt.toISOString())).toEqual(["2026-03-08T14:00:00.000Z", "2026-03-15T14:00:00.000Z"]);
  expect((await pat.viewMeetup(first.id))!.startsAt.toISOString()).toBe("2026-03-01T15:00:00.000Z");
});

test.each([
  { day: "2026-03-08", start: "2026-03-08T05:00:00Z", end: "2026-03-09T04:00:00Z", queued: "2026-03-07T14:00:00Z", morning: "2026-03-08T13:00:00Z", week: "2026-03-02" },
  { day: "2026-11-01", start: "2026-11-01T04:00:00Z", end: "2026-11-02T05:00:00Z", queued: "2026-10-31T13:00:00Z", morning: "2026-11-01T14:00:00Z", week: "2026-10-26" },
])("reports and the 09:00 digest follow the New York calendar on $day", async ({ day, start, end, queued, morning, week }) => {
  h.clock.set(new Date(queued));
  const platform = await platformAdmin();
  await platform.updateSettings({ ...await platform.settings(), timeZone: "America/New_York" });
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  const activityId = (await pat.meetupChoices()).activities.find((activity) => activity.name === "coffee")!.id;
  const occurrences = [];
  for (const instant of [new Date(start).getTime() - 60_000, new Date(start).getTime(), new Date(end).getTime() - 60_000, new Date(end).getTime()]) {
    occurrences.push(await pat.createMeetup({ activityId, startsAt: new Date(instant), durationMinutes: 30, capacity: 3,
      place: { kind: "virtual", url: "https://meet.example/calendar-boundary" } }));
  }
  const scope = { kind: "organisation" as const, id: (await platform.organisations())[0]!.id };
  const report = await platform.reports(scope, { from: day, to: day });
  expect(report.tables.find((table) => table.id === "weekly-occurrences")!.rows).toEqual([[week, "Meetup", "coffee", 2]]);
  const ana = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "ana", name: "Ana", email: "ana@example.test" });
  await ana.joinMeetup(occurrences[0]!.id);
  await ana.leaveMeetup(occurrences[0]!.id);
  h.email.reset();
  h.clock.set(new Date(new Date(morning).getTime() - 60_000));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([]);
  h.clock.set(new Date(morning));
  await h.app.sendDailyDigests();
  expect(h.email.outbox).toEqual([expect.objectContaining({ to: ministryA.platformAdmin.email, subject: "Daily Meetup digest" })]);
});

test("a suspended Platform Admin cannot keep using an earlier authorised handle", async () => {
  const platform = await platformAdmin();
  const pat = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  const owner = (await platform.organisations())[0]!;
  await platform.setFirstOrganisationAdmin(owner.id, { name: "Olivia", email: "olivia@example.test" });
  const olivia = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", name: "Olivia", email: "olivia@example.test" });
  await (await olivia.organisationAdmin()).suspendMember((await pat.profile()).memberId);
  await expect(platform.settings()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platform.createMinistry("Unauthorised")).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platform.exportReport({ kind: "organisation", id: owner.id }, "telegram", { from: "2026-09-01", to: "2026-09-30" }))
    .rejects.toMatchObject({ name: "AccessDeniedError" });
});
