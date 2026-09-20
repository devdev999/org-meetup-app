import Link from "next/link";
import { requireMemberPastWelcome } from "../web/session";
import { MeetupTime } from "./meetups/meetup-time";

export default async function HomePage() {
  const { member } = await requireMemberPastWelcome();
  const suggestions = await member.meetupSuggestions();
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/profile">Your profile</Link>
        <Link href="/interests">Your Interests</Link>
        <Link href="/meetups">All Meetups</Link>
        <Link href="/availability">Availability</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <h1>Suggested Meetups</h1>
      <p>Open Meetups in your scope over the next fourteen days.</p>
      <p><Link href="/meetups/new">Create a Meetup</Link></p>
      {suggestions.length === 0 ? <p>No Meetups to suggest yet.</p> : <ul className="meetup-list">{suggestions.map(({ meetup, reasons }) => (
        <li key={meetup.id}>
          <h2><Link href={`/meetups/${meetup.id}`}>{meetup.activity.name}</Link></h2>
          <p><MeetupTime value={meetup.startsAt.toISOString()} /></p>
          <p>{meetup.place.kind === "physical" ? `${meetup.place.siteName}, ${meetup.place.spot}` : "Virtual"}</p>
          <p>Host: {meetup.host.name}</p>
          <p>{reasons.join(" ")}</p>
        </li>
      ))}</ul>}
    </main>
  );
}
