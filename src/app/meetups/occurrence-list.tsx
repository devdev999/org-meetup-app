import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { RecurrenceDetails } from "./recurrence";
import { OccurrenceCard } from "../_components/occurrence-card";
import { EmptyState, Icon, PageHeading } from "../_components/ui";

export async function OccurrenceList({ kind }: { kind: "meetup" | "event" }) {
  const { member } = await requireMemberPastWelcome();
  const label = kind === "meetup" ? "Meetup" : "Event";
  const path = kind === "meetup" ? "meetups" : "events";
  const [meetups, series] = await Promise.all([
    kind === "meetup" ? member.listMeetups() : member.listEvents(),
    kind === "meetup" ? member.listSeries() : member.listEventSeries(),
  ]);
  return (
    <main className="browse-page">
      <PageHeading
        title={`Upcoming ${label}s`}
        description={`Make time for people and Activities in your Organisation.`}
      >
        <Link className="button" href={`/${path}/new`}>
          <Icon name="plus" size={17} />
          {kind === "meetup" ? "Create a Meetup" : "Propose an Event"}
        </Link>
      </PageHeading>
      {kind === "event" && (
        <p>
          <Link className="text-link" href="/events/proposals">
            Your Event proposals <Icon name="arrow" size={17} />
          </Link>
        </p>
      )}
      {meetups.length === 0 ? (
        <EmptyState title={`There are no upcoming ${label}s for you yet.`}>
          <p>
            {kind === "meetup"
              ? "Create a Meetup around an Activity you enjoy."
              : "Propose an Event for your Organisation Admin to review."}
          </p>
        </EmptyState>
      ) : (
        <ul className="occurrence-grid">
          {meetups.map((meetup) => (
            <OccurrenceCard key={meetup.id} meetup={meetup} />
          ))}
        </ul>
      )}
      {series.length > 0 && (
        <section>
          <h2>Recurring {label}s</h2>
          <ul className="meetup-list series-list">
            {series.map((entry) => (
              <li key={entry.id}>
                <h3>{entry.activity.name}</h3>
                <RecurrenceDetails series={entry} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="image-disclosure">
        Photographs illustrate Activities and do not depict actual Meetups or
        Sites.
      </p>
    </main>
  );
}
