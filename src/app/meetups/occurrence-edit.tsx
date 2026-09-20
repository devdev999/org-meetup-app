import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../web/session";
import { MeetupForm } from "./meetup-form";
import { InviteSuggestions } from "./invite-suggestions";
import { isAccessDeniedError } from "../../application";

export async function OccurrenceEdit({ id, kind }: { id: string; kind: "meetup" | "event" }) {
  const { member } = await requireMemberPastWelcome();
  const label = kind === "meetup" ? "Meetup" : "Event";
  const path = kind === "meetup" ? "meetups" : "events";
  const [meetup, choices, interests] = await Promise.all([kind === "meetup" ? member.viewMeetup(id) : member.viewEvent(id), member.meetupChoices(), member.interests()]);
  if (!meetup || meetup.membership !== "host") notFound();
  const suggestions = meetup.canChange ? await (kind === "meetup" ? member.inviteSuggestions(id) : member.eventInviteSuggestions(id)).catch((error: unknown) => {
    if (isAccessDeniedError(error)) notFound();
    throw error;
  }) : [];
  return (
    <main>
      <p><Link href={`/${path}/${meetup.id}`}>Back to {label}</Link></p>
      <h1>Edit {label}: {meetup.activity.name}</h1>
      {!meetup.canChange ? (
        <p>This {label} can no longer be edited.</p>
      ) : (
        <>
          <p>Participants and waitlisted Members will be notified of changes.</p>
          <MeetupForm mode={kind} choices={choices} meetup={meetup} interests={interests} />
          <InviteSuggestions kind={kind} meetupId={meetup.id} suggestions={suggestions} />
        </>
      )}
    </main>
  );
}
