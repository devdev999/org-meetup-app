import type { EventProposal } from "../../application";
import { MeetupTime } from "../meetups/meetup-time";

export function ProposalDetails({ proposal }: { proposal: EventProposal }) {
  const details = proposal.details;
  return <>
    <h3>{details?.activity.name ?? "Event proposal"}</h3>
    <p>Proposed by {proposal.proposer.name}</p>
    <p>State: {proposal.state}</p>
    {details ? <>
      <p><MeetupTime value={details.startsAt.toISOString()} /> · {details.durationMinutes} minutes</p>
      <p>{details.place.kind === "physical" ? `${details.place.siteName}, ${details.place.spot}` : <a href={details.place.url}>Virtual Place</a>}</p>
      <p>{details.capacity === null ? "No capacity limit." : `Capacity: ${details.capacity}, including the Host.`}</p>
      <p>Audience: {details.audience.kind === "invite-only" ? "Invite-only" : details.audience.scope === "organisation" ? "Whole Organisation" : "One Site"}</p>
      {details.recurrence && <p>Repeats {details.recurrence.frequency}{details.recurrence.endsOn ? ` through ${details.recurrence.endsOn}` : " without an end date"}.</p>}
      {details.description && <p className="meetup-description">{details.description}</p>}
      {details.relevantInterests.length > 0 && <p>Relevant Interests: {details.relevantInterests.map((interest) => interest.name).join(", ")}</p>}
      {details.invitedMemberIds.length > 0 && <p>{details.invitedMemberIds.length} selected invitees. Invites are sent on approval.</p>}
    </> : <p>This Event is no longer visible to you.</p>}
    {proposal.note && <p className="notice">Organisation Admin note: {proposal.note}</p>}
  </>;
}
