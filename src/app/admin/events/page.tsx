import Link from "next/link";
import { requireOrganisationAdmin } from "../../../web/session";
import { ProposalDetails } from "../../events/proposal-details";
import { MeetupTime } from "../../meetups/meetup-time";
import { EventDecisionForm, ReassignEventForm } from "./forms";

export default async function AdminEventsPage() {
  const admin = await requireOrganisationAdmin();
  const [proposals, events, roster] = await Promise.all([admin.eventProposals(), admin.events(), admin.roster()]);
  const members = roster.filter((member) => member.status === "active").map(({ memberId, name }) => ({ memberId, name }));
  return <section>
    <h2>Events</h2>
    <p><Link href="/admin/events/new">Create an Event directly</Link></p>
    <h2>Event proposals</h2>
    {proposals.length === 0 ? <p>No Event proposals yet.</p> : proposals.map((proposal) => <article className="notice" key={proposal.id}>
      <ProposalDetails proposal={proposal} />
      <EventDecisionForm eventId={proposal.id} decided={proposal.state !== "proposed"} />
    </article>)}
    <h2>Published Events</h2>
    <p>Reassign the Host of any occurrence, including past or cancelled Events. Participation and the series Host stay unchanged. A new Host can join a future occurrence separately.</p>
    {events.length === 0 ? <p>No published Events yet.</p> : events.map((event) => <article className="notice" key={event.id}>
      <h3>{event.activity.name}</h3>
      <p><MeetupTime value={event.startsAt.toISOString()} /> · {event.status}</p>
      <p>Host: {event.host.name}</p>
      <ReassignEventForm eventId={event.id} hostId={event.host.memberId} members={members} />
    </article>)}
  </section>;
}
