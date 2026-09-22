import Link from "next/link";
import { requireMemberPastWelcome } from "../../../web/session";
import { ProposalDetails } from "../proposal-details";
import { PageHeading } from "../../_components/ui";

export default async function EventProposalsPage() {
  const { member } = await requireMemberPastWelcome();
  const proposals = await member.eventProposals();
  return (
    <main>
      <PageHeading title="Your Event proposals">
        <Link className="button" href="/events/new">
          Propose an Event
        </Link>
      </PageHeading>
      {proposals.length === 0 ? (
        <p>You have no Event proposals yet.</p>
      ) : (
        proposals.map((proposal) => (
          <article className="notice" key={proposal.id}>
            <ProposalDetails proposal={proposal} />
            {proposal.state === "approved" && proposal.details && (
              <Link href={`/events/${proposal.id}`}>View Event</Link>
            )}
          </article>
        ))
      )}
    </main>
  );
}
