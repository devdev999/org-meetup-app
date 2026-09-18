import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../../web/session";
import { MeetupForm } from "../../meetup-form";

export default async function EditMeetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const [meetup, choices] = await Promise.all([member.viewMeetup(id), member.meetupChoices()]);
  if (!meetup || meetup.membership !== "host") notFound();
  return (
    <main>
      <p><Link href={`/meetups/${meetup.id}`}>Back to Meetup</Link></p>
      <h1>Edit {meetup.activity.name}</h1>
      {meetup.status !== "scheduled" || meetup.startsAt.getTime() <= Date.now() ? (
        <p>This Meetup can no longer be edited.</p>
      ) : (
        <>
          <p>Participants and waitlisted Members will be notified of changes.</p>
          <MeetupForm choices={choices} meetup={meetup} />
        </>
      )}
    </main>
  );
}
