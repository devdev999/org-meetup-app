import { expect, test } from "vitest";
import { MemoryAi } from "../adapters/ai/memory";
import { ControllableClock } from "../adapters/clock/controllable";
import { MemoryEmail } from "../adapters/email/memory";
import { FakeIdentity } from "../adapters/identity/fake";
import { MemoryTelegram } from "../adapters/telegram/memory";
import { createApplication } from "../application";
import { signInAndAcknowledgeAs } from "../testing/organisation-setup";
import { createTestDatabase } from "../testing/test-database";
import { localDemoSettings, seedDemo } from "./demo-seed";
import { runMigrations } from "./migrate";

test("demo settings require an explicit local environment", () => {
  expect(localDemoSettings({}, ["--local"])).toEqual({
    databaseUrl: "postgres://postgres:postgres@localhost:5439/org_meetup",
    appUrl: "http://localhost:3000",
  });
  expect(() => localDemoSettings({}, [])).toThrow("requires --local");
});

test.each([
  { DATABASE_URL: "postgres://postgres:postgres@database.example/org_meetup" },
  { DATABASE_URL: "postgres://postgres:postgres@localhost:5439/another_database" },
  { DATABASE_URL: "postgres://postgres:postgres@localhost:5439/org_meetup?host=database.example" },
  { NODE_ENV: "production" },
  { IDENTITY_PROVIDER: "oidc" },
  { APP_URL: "https://meetups.example" },
  { APP_URL: "http://localhost:3000/another-app" },
])("demo settings reject unsafe configuration %j", (env) => {
  expect(() => localDemoSettings(env, ["--local"])).toThrow("requires --local");
});

test("demo seed creates a usable walkthrough and preserves existing data on reruns", async () => {
  const database = await createTestDatabase();
  try {
    await runMigrations(database.pool);
    const now = new Date("2026-09-22T04:00:00Z");
    const clock = new ControllableClock(now);
    const app = createApplication({ pool: database.pool, clock, identity: new FakeIdentity(),
      ai: new MemoryAi(), telegram: new MemoryTelegram(), email: new MemoryEmail(),
      deploymentDefaults: { timeZone: "Asia/Singapore" } });
    await app.initializeDeploymentSettings();
    const owner = { name: "Pat Platform", email: "pat@ministry-a.example" };
    await app.initializePlatform({
      organisation: { slug: "ministry-a", name: "Existing organisation" },
      oidc: { issuer: "http://localhost:3000/dev-idp", clientId: "org-meetups", credentialRef: null,
        claimMapping: { email: "email", name: "name", department: "department", site: "site" } },
      platformAdmin: owner,
    });
    const pat = await signInAndAcknowledgeAs({ app }, "ministry-a", { sub: owner.email, ...owner });
    const ownerProfile = await pat.profile();
    const existing = await pat.createMeetup({
      activityId: (await pat.meetupChoices()).activities[0]!.id,
      startsAt: new Date("2026-09-25T04:00:00Z"), durationMinutes: 30, capacity: 4,
      place: { kind: "virtual", url: "https://meet.example/existing" }, description: "Keep this Meetup.",
    });
    const result = await seedDemo(app, clock, "http://localhost:3000");
    expect(result).toMatchObject({ created: true, members: 30 });
    expect(clock.now()).toEqual(now);

    const member = (name: string) => signInAndAcknowledgeAs({ app }, "dsta-demo", {
      sub: `${name.toLowerCase().replaceAll(" ", ".")}@dsta.example.test`,
      email: `${name.toLowerCase().replaceAll(" ", ".")}@dsta.example.test`, name,
    });
    const aisha = await member("Aisha Rahman");
    const admin = await (await member("Maya Tan")).organisationAdmin();
    const roster = await admin.roster();
    expect(roster).toHaveLength(30);
    expect(roster.every(({ status }) => status === "active")).toBe(true);
    expect((await admin.lists()).departments).toHaveLength(8);
    expect(await aisha.profile()).toMatchObject({ department: "Digital Hub", site: "DSTA demo campus" });
    expect(await aisha.myInterests()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Photography", stance: "shares" }),
      expect.objectContaining({ name: "K-dramas", stance: "shares" }),
      expect.objectContaining({ name: "Python", stance: "seeks" }),
    ]));

    const meetups = await aisha.listMeetups();
    expect(meetups.map(({ activity }) => activity.name)).toEqual(expect.arrayContaining([
      "Severance lunch", "K-drama lunch", "Board games", "Easy run", "Photo walk", "Python clinic", "Sketch and kopi", "Badminton",
    ]));
    const events = await aisha.listEvents();
    expect(events.map(({ activity }) => activity.name).sort()).toEqual(["New faces coffee", "Repair cafe", "Skill swap"]);
    expect(await aisha.viewEvent(result.pending!)).toBeUndefined();
    expect(await admin.eventProposals()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.pending, state: "proposed", details: expect.objectContaining({ activity: expect.objectContaining({ name: "Green commute lunch" }) }) }),
      expect.objectContaining({ id: result.skillSwap, state: "approved" }),
    ]));

    const priya = await member("Priya Nair");
    const full = await priya.viewMeetup(result.waitlist!);
    expect(full).toMatchObject({ capacity: 4, participantCount: 4 });
    expect(full!.waitlist!.map(({ name }) => name)).toEqual(["Marcus Lee", "Serene Ho"]);
    expect(await aisha.viewMeetup(result.recurring!)).toMatchObject({
      rsvp: "going", recurrence: { frequency: "weekly", isStanding: true },
    });
    expect(await aisha.listSeries()).toHaveLength(1);
    const history = await aisha.attendanceHistory();
    expect(history).toHaveLength(3);
    expect(history.every(({ outcome }) => outcome === "attended")).toBe(true);
    expect((await aisha.connections()).map(({ member: person }) => person.name)).toContain("Darren Koh");
    const availability = await aisha.availability();
    expect(availability.open).toHaveLength(7);
    expect(availability.suggestions).toHaveLength(6);

    expect(await seedDemo(app, clock, "http://localhost:3000")).toEqual({ created: false });
    expect(await admin.roster()).toEqual(roster);
    expect(await aisha.listMeetups()).toEqual(meetups);
    expect(await aisha.listEvents()).toEqual(events);
    expect(await aisha.attendanceHistory()).toEqual(history);
    expect(await aisha.availability()).toEqual(availability);
    expect(await pat.viewMeetup(existing.id)).toEqual(existing);
    expect(await pat.listMeetups()).toHaveLength(1);
    expect(await pat.profile()).toEqual(ownerProfile);
    expect(await pat.searchMembers()).toEqual([]);
    expect(await aisha.viewMeetup(existing.id)).toBeUndefined();
  } finally {
    await database.dispose();
  }
}, 60_000);
