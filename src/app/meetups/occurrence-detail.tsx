import Link from "next/link";
import type { EventDetail, MeetupDetail } from "../../application";
import { MeetupTime } from "./meetup-time";
import { MeetupAction } from "./meetup-action";
import { InviteAnswerForm } from "./invite-form";
import { RecurrenceDetails } from "./recurrence";
import { RsvpForm } from "./rsvp-form";

export function OccurrenceDetail({ meetup }: { meetup: MeetupDetail | EventDetail }) {
  const kind = meetup.kind;
  const label = kind === "meetup" ? "Meetup" : "Event";
  const path = kind === "meetup" ? "meetups" : "events";
  const isHost = meetup.membership === "host";
  const hostHasSeat = meetup.participants.some((participant) => participant.memberId === meetup.host.memberId);
  const hostWaitlisted = isHost && meetup.waitlist?.some((participant) => participant.memberId === meetup.host.memberId);
  const otherParticipants = meetup.participants.filter((participant) => participant.memberId !== meetup.host.memberId);
  const canRsvp = meetup.recurrence && (meetup.recurrence.isStanding || meetup.membership || meetup.rsvp !== null);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href={`/${path}`}>Back to {label}s</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <p className="muted">{kind === "event" ? "Organisation Event" : "Meetup"}</p>
      <h1>{meetup.activity.name}</h1>
      {meetup.status === "cancelled" && <p className="notice" role="status">This {label} has been cancelled.</p>}
      {meetup.status === "completed" && <p className="notice">This {label} has ended.</p>}
      <dl>
        <dt>Host</dt><dd>{meetup.host.name}</dd>
        <dt>Start time</dt><dd><MeetupTime value={meetup.startsAt.toISOString()} /></dd>
        <dt>Duration</dt><dd>{meetup.durationMinutes} minutes</dd>
        <dt>Place</dt>
        <dd>{meetup.place.kind === "physical"
          ? `${meetup.place.siteName ?? "Site"}, ${meetup.place.spot}`
          : <a href={meetup.place.url} target="_blank" rel="noreferrer">Open virtual Place</a>}</dd>
        <dt>Capacity</dt><dd>{meetup.capacity === null ? `${meetup.participantCount} Participant${meetup.participantCount === 1 ? "" : "s"}. No capacity limit.` : `${meetup.participantCount} of ${meetup.capacity} places filled`}</dd>
        <dt>Audience</dt><dd>{meetup.audience.kind === "invite-only" ? "Invite-only" : meetup.audience.scope === "organisation" ? "Open to the Organisation" : "Open to Members at the audience Site"}</dd>
      </dl>
      {meetup.recurrence && <section>
        <h2>Recurring {label}</h2>
        <RecurrenceDetails series={meetup.recurrence} />
      </section>}
      {canRsvp && <section>
        <h2>Your RSVP</h2>
        <p>Your RSVP: {meetup.rsvp === "going" ? "Going" : meetup.rsvp === "not-going" ? "Not going" : "No answer"}.</p>
        {meetup.canChange && <>
          {meetup.recurrence?.isStanding && <p>Not going frees your place in this occurrence and keeps your standing place in the series.</p>}
          <RsvpForm meetupId={meetup.id} kind={kind} />
        </>}
      </section>}
      {meetup.description && <p className="meetup-description">{meetup.description}</p>}
      {meetup.relevantInterests.length > 0 && <section>
        <h2>Relevant Interests</h2>
        <ul className="interest-list">{meetup.relevantInterests.map((interest) => <li key={interest.interestId}>{interest.name}</li>)}</ul>
      </section>}
      {(meetup.membership === "waitlisted" || hostWaitlisted) && meetup.status === "scheduled" && (
        <p className="notice">You are on the waitlist. We will notify you in your inbox when a place opens.</p>
      )}
      {meetup.membership === "participant" && meetup.status === "scheduled" && <p className="notice">You joined this {label}.</p>}
      {meetup.invite && (
        <section>
          <h2>Your Invite</h2>
          <p>Your Invite is {meetup.invite.state}.</p>
          {meetup.invite.state === "accepted" && !meetup.membership && <p>You no longer have a place in this {label}.</p>}
          {meetup.canChange && meetup.invite.state === "pending" && <InviteAnswerForm inviteId={meetup.invite.id} />}
        </section>
      )}
      {meetup.canChange && !canRsvp && (!meetup.membership || isHost && !hostHasSeat && !hostWaitlisted) && (meetup.audience.kind === "open" || isHost) && meetup.invite?.state !== "pending" && (
        <MeetupAction meetupId={meetup.id} kind={kind} operation="join" label={meetup.capacity !== null && meetup.participantCount >= meetup.capacity ? "Join waitlist" : `Join ${label}`} />
      )}
      {meetup.canChange && !meetup.recurrence?.isStanding && (meetup.membership === "participant" || meetup.membership === "waitlisted") && (
        <MeetupAction meetupId={meetup.id} kind={kind} operation="leave" label={meetup.membership === "waitlisted" ? "Leave waitlist" : `Leave ${label}`} />
      )}
      {meetup.rsvps && <section>
        <h2>RSVP answers</h2>
        <p>{meetup.rsvps.filter((entry) => entry.answer === "going").length} going · {meetup.rsvps.filter((entry) => entry.answer === "not-going").length} not going · {meetup.rsvps.filter((entry) => entry.answer === null).length} no answer</p>
        <p className="muted">A Going answer on the waitlist does not confirm a place.</p>
        <ul>{meetup.rsvps.map((entry) => <li key={entry.memberId}>{entry.name}: {entry.answer === "going" ? "Going" : entry.answer === "not-going" ? "Not going" : "No answer"}{meetup.waitlist?.some((person) => person.memberId === entry.memberId) ? ", waitlisted" : ""}</li>)}</ul>
      </section>}
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
          <h2>Manage {label}</h2>
          <p><Link href={`/${path}/${meetup.id}/invite`}>Invite a Member</Link></p>
          <p><Link href={`/${path}/${meetup.id}/edit`}>Edit {label}</Link></p>
          {otherParticipants.length > 0 && (
            <>
              <h2>Hand over to a Participant</h2>
              <p>You will remain a Participant and can leave after handing over.</p>
              <MeetupAction meetupId={meetup.id} kind={kind} operation="hand-over" label={`Hand over ${label}`} participants={otherParticipants} />
            </>
          )}
          <h2>Cancel {label}</h2>
          <p>Participants, waitlisted Members and Members with pending Invites will be notified. The waitlist will be cleared.</p>
          <MeetupAction meetupId={meetup.id} kind={kind} operation="cancel" label={`Cancel ${label}`} />
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
