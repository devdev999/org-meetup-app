import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";
import { MeetupTime } from "../meetup-time";
import { MeetupAction } from "../meetup-action";
import { InviteForm, InviteResponse } from "../invite-form";

export default async function MeetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const meetup = await member.viewMeetup(id);
  if (!meetup) notFound();
  const isHost = meetup.membership === "host";
  const otherParticipants = meetup.participants.filter((participant) => participant.memberId !== meetup.host.memberId);
  const invitees = isHost && meetup.canChange ? (await member.searchMembers()).filter((candidate) =>
    !meetup.participants.some((participant) => participant.memberId === candidate.memberId)
    && !meetup.invites?.some((invite) => invite.member.memberId === candidate.memberId)) : [];
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/meetups">Back to Meetups</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <h1>{meetup.activity.name}</h1>
      {meetup.status === "cancelled" && <p className="notice" role="status">This Meetup has been cancelled.</p>}
      {meetup.status === "completed" && <p className="notice">This Meetup has ended.</p>}
      <dl>
        <dt>Host</dt><dd>{meetup.host.name}</dd>
        <dt>Start time</dt><dd><MeetupTime value={meetup.startsAt.toISOString()} /></dd>
        <dt>Duration</dt><dd>{meetup.durationMinutes} minutes</dd>
        <dt>Place</dt>
        <dd>{meetup.place.kind === "physical"
          ? `${meetup.place.siteName ?? "Site"}, ${meetup.place.spot}`
          : <a href={meetup.place.url} target="_blank" rel="noreferrer">Open virtual Place</a>}</dd>
        <dt>Capacity</dt><dd>{meetup.participantCount} of {meetup.capacity} places filled, including the Host</dd>
        <dt>Audience</dt><dd>{meetup.audience.kind === "invite-only" ? "Invite-only" : meetup.audience.scope === "organisation" ? "Open to the Organisation" : "Open to Members at the audience Site"}</dd>
      </dl>
      {meetup.description && <p className="meetup-description">{meetup.description}</p>}
      {meetup.membership === "waitlisted" && meetup.status === "scheduled" && (
        <p className="notice">You are on the waitlist. We will notify you in your inbox when a place opens.</p>
      )}
      {meetup.membership === "participant" && meetup.status === "scheduled" && <p className="notice">You joined this Meetup.</p>}
      {meetup.invite && (
        <section>
          <h2>Your Invite</h2>
          <p>Your Invite is {meetup.invite.state}.</p>
          {meetup.canChange && meetup.invite.state === "pending" && <InviteResponse inviteId={meetup.invite.id} />}
        </section>
      )}
      {meetup.canChange && !meetup.membership && meetup.audience.kind === "open" && meetup.invite?.state !== "pending" && (
        <MeetupAction meetupId={meetup.id} operation="join" label={meetup.participantCount >= meetup.capacity ? "Join waitlist" : "Join Meetup"} />
      )}
      {meetup.canChange && (meetup.membership === "participant" || meetup.membership === "waitlisted") && (
        <MeetupAction meetupId={meetup.id} operation="leave" label={meetup.membership === "waitlisted" ? "Leave waitlist" : "Leave Meetup"} />
      )}
      {(isHost || meetup.membership === "participant") && (
        <section>
          <h2>Participants</h2>
          <ul>{meetup.participants.map((participant) => <li key={participant.memberId}>{participant.name}{participant.memberId === meetup.host.memberId ? ", Host" : ""}</li>)}</ul>
        </section>
      )}
      {isHost && meetup.waitlist && (
        <section>
          <h2>Waitlist</h2>
          {meetup.waitlist.length === 0 ? <p className="muted">Nobody is waiting.</p> : (
            <ol>{meetup.waitlist.map((participant) => <li key={participant.memberId}>{participant.name}</li>)}</ol>
          )}
        </section>
      )}
      {isHost && meetup.canChange && (
        <section>
          <h2>Manage Meetup</h2>
          <h3>Invite a Member</h3>
          <InviteForm meetupId={meetup.id} members={invitees.map(({ memberId, name }) => ({ memberId, name }))} />
          <p><Link href={`/meetups/${meetup.id}/edit`}>Edit Meetup</Link></p>
          {otherParticipants.length > 0 && (
            <>
              <h2>Hand over to a Participant</h2>
              <p>You will remain a Participant and can leave after handing over.</p>
              <MeetupAction meetupId={meetup.id} operation="hand-over" label="Hand over Meetup" participants={otherParticipants} />
            </>
          )}
          <h2>Cancel Meetup</h2>
          <p>Participants, waitlisted Members and Members with pending Invites will be notified. The waitlist will be cleared.</p>
          <MeetupAction meetupId={meetup.id} operation="cancel" label="Cancel Meetup" />
        </section>
      )}
      {isHost && meetup.invites && (
        <section>
          <h2>Invites</h2>
          {meetup.invites.length === 0 ? <p className="muted">No Invites sent yet.</p>
            : <ul>{meetup.invites.map((invite) => <li key={invite.id}>{invite.member.name}: {invite.state}</li>)}</ul>}
        </section>
      )}
    </main>
  );
}
