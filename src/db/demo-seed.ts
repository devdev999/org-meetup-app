import { Temporal } from "@js-temporal/polyfill";
import { FakeIdentity } from "../adapters/identity/fake";
import { ControllableClock } from "../adapters/clock/controllable";
import { NOTICE_KINDS, type Application, type CreateMeetupInput, type InterestChoice, type MemberActions } from "../application";
import { calendarDayStart, localDate } from "../calendar";
import { DEMO_SITE, DEMO_SLUG, demoMembers, demoRoster, interestKind } from "./demo-data";

export function localDemoSettings(env: Record<string, string | undefined>, args: string[]) {
  const databaseUrl = env.DATABASE_URL || "postgres://postgres:postgres@localhost:5439/org_meetup";
  const appUrl = env.APP_URL || "http://localhost:3000";
  const refusal = "Demo seed requires --local, a non-production fake-identity environment, a loopback org_meetup database and a loopback HTTP APP_URL.";
  let database: URL;
  let app: URL;
  try {
    database = new URL(databaseUrl);
    app = new URL(appUrl);
  } catch {
    throw new Error(refusal);
  }
  const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!args.includes("--local") || env.NODE_ENV === "production" || env.IDENTITY_PROVIDER && env.IDENTITY_PROVIDER !== "fake"
    || !["postgres:", "postgresql:"].includes(database.protocol) || !loopback(database.hostname)
    || database.pathname !== "/org_meetup" || database.search || database.hash || !loopback(app.hostname)
    || app.protocol !== "http:" || app.username || app.password || app.pathname !== "/" || app.search || app.hash) {
    throw new Error(refusal);
  }
  return { databaseUrl, appUrl: app.origin };
}

export async function seedDemo(app: Application, clock: ControllableClock, appUrl: string) {
  if ((await app.signInOptions()).some(({ slug }) => slug === DEMO_SLUG)) return { created: false };

  async function signIn(slug: string, person: { name: string; email: string }) {
    const started = await app.beginSignIn({ organisationSlug: slug, redirectUri: `${appUrl}/auth/callback` });
    const authorization = new URL(started.authorizationUrl);
    if (authorization.origin !== appUrl || authorization.pathname !== "/dev-idp/authorize") {
      throw new Error("Demo seed requires the local /dev-idp issuer. Run the standard local db:setup first.");
    }
    const { memberId } = await app.completeSignIn({ pending: started.pending,
      callbackUrl: FakeIdentity.callbackUrl(started.authorizationUrl, { sub: person.email, name: person.name, email: person.email }) });
    const actor = await app.asMember(memberId);
    if (!actor) throw new Error("Demo Member did not become Active.");
    await actor.acknowledgeAdminVisibilityNotice();
    return { actor, memberId };
  }

  const now = clock.now();
  const day = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO("Asia/Singapore").toPlainDate();
  function at(offset: number, time = "12:15", weekdaysOnly = true) {
    let target = day;
    for (let left = Math.abs(offset); left > 0;) {
      target = target.add({ days: offset < 0 ? -1 : 1 });
      if (!weekdaysOnly || target.dayOfWeek <= 5) left--;
    }
    return new Date(target.toPlainDateTime(time).toZonedDateTime("Asia/Singapore").epochMilliseconds);
  }

  const platformMember = await signIn("ministry-a", { email: "pat@ministry-a.example", name: "Pat Platform" });
  const platform = await platformMember.actor.platformAdmin();
  await platform.createOrganisation({
    organisation: { slug: DEMO_SLUG, name: "DSTA demo" },
    oidc: { issuer: `${appUrl}/dev-idp`, clientId: "org-meetups", credentialRef: null,
      claimMapping: { email: "email", name: "name", department: "department", site: "site" } },
    organisationAdmin: { name: demoMembers[0]!.name, email: demoMembers[0]!.email },
  });
  clock.set(at(-8, "09:00"));
  const adminMember = await signIn(DEMO_SLUG, demoMembers[0]!);
  const admin = await adminMember.actor.organisationAdmin();
  const preview = await admin.previewRoster(demoRoster);
  await admin.commitRoster(demoRoster, preview.revision);

  const actors: MemberActions[] = [];
  const memberIds: string[] = [];
  for (const person of demoMembers) {
    const { actor, memberId } = await signIn(DEMO_SLUG, person);
    actors.push(actor);
    memberIds.push(memberId);
    for (const kind of NOTICE_KINDS) await actor.setNoticePreference({ kind, email: false, telegram: false });
    for (const [stance, names] of [["shares", person.shares], ["seeks", [person.seeks]]] as const) {
      for (const name of names) await actor.confirmInterest({ phrase: name, selection: { name, kind: interestKind(name) }, stance });
    }
  }

  const activityNames = ["Severance lunch", "K-drama lunch", "Board games", "Easy run", "Photo walk", "Python clinic",
    "Sketch and kopi", "Badminton", "Skill swap", "New faces coffee", "Repair cafe", "Green commute lunch"];
  const activities = new Map<string, string>();
  for (const name of activityNames) activities.set(name, (await admin.createListEntry("activity", name)).id);
  const choices = await actors[1]!.meetupChoices();
  for (const activity of choices.activities) activities.set(activity.name, activity.id);
  const siteId = choices.sites.find(({ name }) => name === DEMO_SITE)!.id;
  const interestChoices = new Map((await actors[1]!.interests()).map((interest) => [interest.name, interest.interestId]));
  const relevant = (names: string[]): InterestChoice[] => names.map((name) => ({ phrase: name, selection: { interestId: interestChoices.get(name)! } }));
  function input(activity: string, startsAt: Date, description: string, interests: string[], capacity = 8, spot = "The lunch table") : CreateMeetupInput {
    return { activityId: activities.get(activity)!, startsAt, durationMinutes: 60, capacity,
      place: { kind: "physical", siteId, spot }, description, relevantInterests: relevant(interests) };
  }
  async function meetup(host: number, details: CreateMeetupInput, participants: number[]) {
    const created = await actors[host]!.createMeetup(details);
    for (const index of participants) await actors[index]!.joinMeetup(created.id);
    return created;
  }

  const history = [
    { host: 1, days: -6, activity: "coffee", description: "One coffee, four Programme Centres. Our first new-faces table.", interests: ["Photography"], people: [2, 3, 4, 9] },
    { host: 14, days: -4, activity: "learning session", description: "Spreadsheet shortcuts worth sharing. Bring one everyday task and leave with a simpler way to do it.", interests: ["Spreadsheets"], people: [1, 7, 11, 20, 28] },
    { host: 4, days: -2, activity: "Board games", description: "A first round of Codenames. Easy rules and plenty of reasons to talk to someone new.", interests: ["Board games"], people: [1, 2, 12, 19, 23] },
  ];
  for (const item of history) {
    clock.set(at(item.days, "09:00"));
    const occurrence = await meetup(item.host, input(item.activity, at(item.days), item.description, item.interests), item.people);
    clock.set(new Date(occurrence.startsAt.getTime() + 90 * 60_000));
    await actors[item.host]!.confirmAttendance(occurrence.id, [item.host, ...item.people.slice(0, -1)].map((index) => memberIds[index]!));
    for (const index of item.people.slice(0, 3)) await actors[index]!.rateOccurrence(occurrence.id, index % 2 ? 5 : 4);
  }

  clock.set(now);
  const severance = await meetup(2, input("Severance lunch", at(1),
    "Your outie is invited to lunch. Share favourite characters and spoiler-free theories over your own lunch. New viewers welcome; no plot reveals.", ["Severance"], 6), [12, 16, 22]);
  const kdrama = await meetup(1, input("K-drama lunch", at(2),
    "One lunch break, one good recommendation. Swap comfort-watch K-dramas, compare favourite soundtracks and meet someone from another Programme Centre. No spoilers.", ["K-dramas"], 8), [7, 11, 17, 21]);
  await actors[1]!.inviteMember(kdrama.id, memberIds[24]!);
  const games = await meetup(4, input("Board games", at(3),
    "A quick game before the afternoon starts. Codenames and Just One, with rules explained at the table. This table is full; join the waitlist for the next seat.", ["Board games"], 4, "Community table"), [12, 19, 23, 16, 28]);
  const run = await meetup(3, { ...input("Easy run", at(1, "18:15"),
    "Five kilometres at conversation pace. Walk breaks welcome. Meet at the demo campus entrance, bring water and choose a comfortable pace.", ["Running"], 10, "Campus entrance"),
    durationMinutes: 45, recurrence: { frequency: "weekly", endsOn: localDate(at(8, "18:15", false), await app.timeZone()) } }, []);
  for (const index of [1, 5, 10, 18, 24, 27]) {
    await actors[index]!.joinSeries(run.recurrence!.id);
    if (index !== 24) await actors[index]!.answerRsvp(run.id, index === 18 ? "not-going" : "going");
  }
  await meetup(5, input("Photo walk", at(4, "17:45"),
    "Find a better photo in an ordinary street. Practise framing and evening light around public paths. Phone cameras welcome; keep all photos outside work premises.", ["Photography"], 8, "Public walking route meeting point"), [13, 20, 26]);
  await meetup(6, { ...input("Python clinic", at(2, "10:30"),
    "Trade one Python tip over coffee. Bring a public toy dataset or a beginner question. No work data needed; we will practise a small CSV task together.", ["Python"], 6, "Learning corner"), durationMinutes: 45 }, [9, 15, 25]);
  await meetup(7, input("Sketch and kopi", at(5),
    "Draw your coffee cup, meet a new face. A relaxed sketch break with spare pencils and no experience required.", ["Sketching"], 8, "Cafe corner"), [13, 19, 23]);
  await meetup(8, { ...input("Badminton", at(6, "18:00"),
    "Friendly doubles after work. All levels welcome; rotate partners between games. Bring a racket if you have one.", ["Badminton"], 8, "Demo sports hall"), durationMinutes: 90 }, [6, 11, 22, 27]);

  const skillSwap = await actors[9]!.proposeEvent(input("Skill swap", at(7),
    "Teach one useful thing in ten minutes. Small tables for Python, spreadsheet shortcuts and public speaking. Choose something you Share or something you Seek.", ["Python", "Spreadsheets", "Public speaking"], 30, "Learning commons"));
  await admin.approveEvent(skillSwap.id, "Demo Event approved. Use public examples and leave time for cross-centre introductions.");
  for (const index of [1, 2, 3, 4, 6, 7, 10, 11, 14, 15, 17, 20, 25, 28]) await actors[index]!.joinEvent(skillSwap.id);
  const welcome = await admin.createEvent({ ...input("New faces coffee", at(4, "10:00"),
    "Make your first cross-centre connection. New joiners and familiar faces pair up for a coffee and one thing they enjoy outside work.", ["Public speaking"], 30, "Community commons"), capacity: null });
  for (const index of [1, 5, 8, 9, 13, 16, 18, 21, 24, 26, 29]) await actors[index]!.joinEvent(welcome.id);
  const repair = await admin.createEvent(input("Repair cafe", at(8, "16:00"),
    "Give everyday things a second chance. Swap simple mending tips and share ways to reduce waste. Bring a small non-electrical item or just your curiosity.", ["Repair and reuse"], 25, "Community commons"));
  for (const index of [10, 18, 25, 29, 13, 23]) await actors[index]!.joinEvent(repair.id);
  const pending = await actors[1]!.proposeEvent(input("Green commute lunch", at(9),
    "Compare greener ways to get to work. Bring a favourite public route, walking tip or cycling question. A lunch conversation proposed for Organisation Admin review.", ["Running", "Repair and reuse"], 20));

  const timeZone = await app.timeZone();
  const endOfDay = calendarDayStart(localDate(now, timeZone), timeZone, 1);
  for (const index of [1, 2, 5, 9, 13, 17, 20]) await actors[index]!.postAvailability({
    activityId: activities.get("lunch")!, startsAt: now,
    endsAt: new Date(Math.min(now.getTime() + 4 * 60 * 60_000, endOfDay.getTime())), kind: "physical",
  });

  return { created: true, members: actors.length, severance: severance.id, kdrama: kdrama.id,
    waitlist: games.id, recurring: run.id, skillSwap: skillSwap.id, pending: pending.id };
}
