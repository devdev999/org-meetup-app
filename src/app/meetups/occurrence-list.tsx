import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { MeetupTime } from "./meetup-time";
import { RecurrenceDetails } from "./recurrence";

export async function OccurrenceList({ kind }: { kind: "meetup" | "event" }) {
  const { member } = await requireMemberPastWelcome();
  const label = kind === "meetup" ? "Meetup" : "Event";
  const path = kind === "meetup" ? "meetups" : "events";
  const [meetups, series] = await Promise.all([kind === "meetup" ? member.listMeetups() : member.listEvents(), kind === "meetup" ? member.listSeries() : member.listEventSeries()]);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/profile">Profile</Link>
        <Link href={kind === "meetup" ? "/events" : "/meetups"}>{kind === "meetup" ? "Events" : "Meetups"}</Link>
        <Link href="/availability">Availability</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <h1>Upcoming {label}s</h1>
      <p><Link href={`/${path}/new`}>{kind === "meetup" ? "Create a Meetup" : "Propose an Event"}</Link></p>
      {kind === "event" && <p><Link href="/events/proposals">Your Event proposals</Link></p>}
      {meetups.length === 0 ? (
        <p className="muted">There are no upcoming {label}s for you yet.</p>
      ) : (
        <ul className="meetup-list">
          {meetups.map((meetup) => (
            <li key={meetup.id}>
              <p className="muted">{label}</p>
              <h2><Link href={`/${path}/${meetup.id}`}>{meetup.activity.name}</Link></h2>
              <p><MeetupTime value={meetup.startsAt.toISOString()} /> · {meetup.durationMinutes} minutes</p>
              <p>{meetup.place.kind === "physical" ? `${meetup.place.siteName ?? "Site"}, ${meetup.place.spot}` : "Virtual"}</p>
              <p>Host: {meetup.host.name} · {meetup.capacity === null ? `${meetup.participantCount} joined, no capacity limit` : `${meetup.participantCount} of ${meetup.capacity} places filled`}</p>
              {meetup.status === "cancelled" && <p className="error">Cancelled</p>}
              {meetup.status !== "cancelled" && meetup.membership && (
                <p className="muted">{meetup.membership === "host" ? "You are the Host." : meetup.membership === "waitlisted" ? "You are on the waitlist." : `You joined this ${label}.`}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {series.length > 0 && <section>
        <h2>Recurring {label}s</h2>
        <ul className="meetup-list">{series.map((entry) => <li key={entry.id}>
          <h3>{entry.activity.name}</h3>
          <RecurrenceDetails series={entry} />
        </li>)}</ul>
      </section>}
    </main>
  );
}
