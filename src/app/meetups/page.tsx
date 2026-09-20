import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { MeetupTime } from "./meetup-time";
import { RecurrenceDetails } from "./recurrence";

export default async function MeetupsPage() {
  const { member } = await requireMemberPastWelcome();
  const [meetups, series] = await Promise.all([member.listMeetups(), member.listSeries()]);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/profile">Profile</Link>
        <Link href="/availability">Availability</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <h1>Upcoming Meetups</h1>
      <p><Link href="/meetups/new">Create a Meetup</Link></p>
      {meetups.length === 0 ? (
        <p className="muted">There are no upcoming Meetups for you yet.</p>
      ) : (
        <ul className="meetup-list">
          {meetups.map((meetup) => (
            <li key={meetup.id}>
              <h2><Link href={`/meetups/${meetup.id}`}>{meetup.activity.name}</Link></h2>
              <p><MeetupTime value={meetup.startsAt.toISOString()} /> · {meetup.durationMinutes} minutes</p>
              <p>{meetup.place.kind === "physical" ? `${meetup.place.siteName ?? "Site"}, ${meetup.place.spot}` : "Virtual"}</p>
              <p>Host: {meetup.host.name} · {meetup.participantCount} of {meetup.capacity} places filled</p>
              {meetup.status === "cancelled" && <p className="error">Cancelled</p>}
              {meetup.status !== "cancelled" && meetup.membership && (
                <p className="muted">{meetup.membership === "host" ? "You are the Host." : meetup.membership === "waitlisted" ? "You are on the waitlist." : "You joined this Meetup."}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {series.length > 0 && <section>
        <h2>Recurring Meetups</h2>
        <ul className="meetup-list">{series.map((entry) => <li key={entry.id}>
          <h3>{entry.activity.name}</h3>
          <RecurrenceDetails series={entry} />
        </li>)}</ul>
      </section>}
    </main>
  );
}
