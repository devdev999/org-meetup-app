import Link from "next/link";
import { requireMemberPastWelcome } from "../../../web/session";
import { ProposalDetails } from "../proposal-details";

export default async function EventProposalsPage() {
  const { member } = await requireMemberPastWelcome();
  const proposals = await member.eventProposals();
  return <main>
    <nav className="member-nav" aria-label="Member navigation"><Link href="/events">Events</Link><Link href="/events/new">Propose an Event</Link></nav>
    <h1>Your Event proposals</h1>
    {proposals.length === 0 ? <p>You have no Event proposals yet.</p> : proposals.map((proposal) => <article className="notice" key={proposal.id}>
      <ProposalDetails proposal={proposal} />
      {proposal.state === "approved" && <Link href={`/events/${proposal.id}`}>View Event</Link>}
    </article>)}
  </main>;
}
