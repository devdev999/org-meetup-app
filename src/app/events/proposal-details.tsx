import type { EventProposal } from "../../application";
import { MeetupTime } from "../meetups/meetup-time";

export function ProposalDetails({ proposal }: { proposal: EventProposal }) {
  return <>
    <h3>{proposal.activity.name}</h3>
    <p>Proposed by {proposal.proposer.name}</p>
    <p>State: {proposal.state}</p>
    <p><MeetupTime value={proposal.startsAt.toISOString()} /> · {proposal.durationMinutes} minutes</p>
    <p>{proposal.place.kind === "physical" ? `${proposal.place.siteName}, ${proposal.place.spot}` : <a href={proposal.place.url}>Virtual Place</a>}</p>
    <p>{proposal.capacity === null ? "No capacity limit." : `Capacity: ${proposal.capacity}, including the Host.`}</p>
    <p>Audience: {proposal.audience.kind === "invite-only" ? "Invite-only" : proposal.audience.scope === "organisation" ? "Whole Organisation" : "One Site"}</p>
    {proposal.recurrence && <p>Repeats {proposal.recurrence.frequency}{proposal.recurrence.endsOn ? ` through ${proposal.recurrence.endsOn}` : " without an end date"}.</p>}
    {proposal.description && <p className="meetup-description">{proposal.description}</p>}
    {proposal.relevantInterests.length > 0 && <p>Relevant Interests: {proposal.relevantInterests.map((interest) => interest.name).join(", ")}</p>}
    {proposal.invitedMemberIds.length > 0 && <p>{proposal.invitedMemberIds.length} selected invitees. Invites are sent on approval.</p>}
    {proposal.note && <p className="notice">Admin note: {proposal.note}</p>}
  </>;
}
