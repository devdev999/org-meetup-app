import type { Pool } from "pg";
import { createApplication } from "../../src/application";
import { ControllableClock } from "../../src/adapters/clock/controllable";
import { FakeIdentity } from "../../src/adapters/identity/fake";
import { MemoryAi } from "../../src/adapters/ai/memory";
import { MemoryEmail } from "../../src/adapters/email/memory";
import { MemoryTelegram } from "../../src/adapters/telegram/memory";

export async function seedAttendance(pool: Pool, appUrl: string) {
  const now = new Date();
  const clock = new ControllableClock(new Date(now.getTime() - 2 * 86_400_000));
  const app = createApplication({ pool, clock, identity: new FakeIdentity(), ai: new MemoryAi(), email: new MemoryEmail(), telegram: new MemoryTelegram("test_bot") });
  async function signIn(person: { name: string; email: string }) {
    const started = await app.beginSignIn({ organisationSlug: "ministry-a", redirectUri: `${appUrl}/auth/callback` });
    const signed = await app.completeSignIn({ pending: started.pending, callbackUrl: FakeIdentity.callbackUrl(started.authorizationUrl, { ...person, sub: person.email }) });
    const member = (await app.asMember(signed.memberId))!;
    await member.acknowledgeAdminVisibilityNotice();
    return member;
  }
  const admin = await (await signIn({ name: "Olivia Admin", email: "olivia@ministry-a.example" })).organisationAdmin();
  const fixtures = [];
  for (const kind of ["meetup", "event"] as const) {
    const label = kind === "meetup" ? "Meetup" : "Event";
    const host = { name: `${label} Host`, email: `${kind}-attendance-host@ministry-a.example` };
    const participant = { name: `${label} Participant`, email: `${kind}-attendance-participant@ministry-a.example` };
    const hostActor = await signIn(host);
    const participantActor = await signIn(participant);
    const input = {
      activityId: (await hostActor.meetupChoices()).activities.find((entry) => entry.name === "coffee")!.id,
      startsAt: new Date(now.getTime() - 86_400_000), durationMinutes: 60, capacity: 3,
      place: { kind: "virtual" as const, url: "https://meet.example/attendance" },
    };
    let id: string;
    if (kind === "meetup") id = (await hostActor.createMeetup(input)).id;
    else {
      id = (await hostActor.proposeEvent({ ...input, recurrence: { frequency: "weekly" } })).id;
      await admin.approveEvent(id);
    }
    await (kind === "meetup" ? participantActor.joinMeetup(id) : participantActor.joinEvent(id));
    fixtures.push({ kind, id, host, participant });
  }
  clock.set(now);
  await app.processAttendance();
  return fixtures;
}
