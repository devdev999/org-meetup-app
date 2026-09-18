import Link from "next/link";
import { requireMemberPastWelcome } from "../../../web/session";
import { MeetupForm } from "../meetup-form";

export default async function NewMeetupPage() {
  const { member } = await requireMemberPastWelcome();
  const choices = await member.meetupChoices();
  return (
    <main>
      <p><Link href="/meetups">Back to Meetups</Link></p>
      <h1>Create a Meetup</h1>
      {choices.activities.length === 0 ? (
        <p>Your Organisation Admin needs to add an Activity before you can create a Meetup.</p>
      ) : (
        <MeetupForm choices={choices} />
      )}
    </main>
  );
}
