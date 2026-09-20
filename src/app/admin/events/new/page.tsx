import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireMemberPastWelcome, requireOrganisationAdmin } from "../../../../web/session";
import { MeetupForm } from "../../../meetups/meetup-form";

export default async function CreateEventPage() {
  await requireOrganisationAdmin();
  const { member } = await requireMemberPastWelcome();
  const [choices, interests] = await Promise.all([member.meetupChoices(), member.interests()]);
  return <section>
    <p><Link href="/admin/events">Back to Event administration</Link></p>
    <h2>Create an Event</h2>
    <p>This Event is published immediately with you as Host.</p>
    {choices.activities.length === 0 ? <p>Add an Activity before creating an Event.</p>
      : <MeetupForm mode="event-direct" choices={choices} interests={interests} suggestionSeed={randomUUID()} />}
  </section>;
}
