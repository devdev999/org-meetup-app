import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireMemberPastWelcome } from "../../../web/session";
import { MeetupForm } from "../../meetups/meetup-form";

export default async function ProposeEventPage() {
  const { member } = await requireMemberPastWelcome();
  const [choices, interests] = await Promise.all([member.meetupChoices(), member.interests()]);
  return <main>
    <p><Link href="/events">Back to Events</Link></p>
    <h1>Propose an Event</h1>
    <p>Your proposal stays private to you and Organisation Admins until approval. You become the Host when it is approved.</p>
    {choices.activities.length === 0 ? <p>Your Organisation Admin needs to add an Activity before you can propose an Event.</p>
      : <MeetupForm mode="event" choices={choices} interests={interests} suggestionSeed={randomUUID()} />}
  </main>;
}
