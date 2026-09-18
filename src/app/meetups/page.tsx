import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { LocalTime } from "./local-time";

export default async function MeetupsPage() {
  const { member } = await requireMemberPastWelcome();
  const meetups = await member.listMeetups();
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/profile">Profile</Link>
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
              <p><LocalTime value={meetup.startsAt.toISOString()} /> · {meetup.durationMinutes} minutes</p>
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
    </main>
  );
}
