import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../../web/session";
import { MeetupForm } from "../../meetup-form";
import { InviteSuggestions } from "../../invite-suggestions";
import { isAccessDeniedError } from "../../../../application";

export default async function EditMeetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const [meetup, choices, interests] = await Promise.all([member.viewMeetup(id), member.meetupChoices(), member.interests()]);
  if (!meetup || meetup.membership !== "host") notFound();
  const suggestions = meetup.canChange ? await member.inviteSuggestions(id).catch((error: unknown) => {
    if (isAccessDeniedError(error)) notFound();
    throw error;
  }) : [];
  return (
    <main>
      <p><Link href={`/meetups/${meetup.id}`}>Back to Meetup</Link></p>
      <h1>Edit {meetup.activity.name}</h1>
      {!meetup.canChange ? (
        <p>This Meetup can no longer be edited.</p>
      ) : (
        <>
          <p>Participants and waitlisted Members will be notified of changes.</p>
          <MeetupForm choices={choices} meetup={meetup} interests={interests} />
          <InviteSuggestions meetupId={meetup.id} suggestions={suggestions} />
        </>
      )}
    </main>
  );
}
