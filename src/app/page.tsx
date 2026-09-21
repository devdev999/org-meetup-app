import Link from "next/link";
import { requireMemberPastWelcome } from "../web/session";
import { MeetupTime } from "./meetups/meetup-time";

export default async function HomePage() {
  const { member } = await requireMemberPastWelcome();
  const [suggestions, events] = await Promise.all([member.meetupSuggestions(), member.eventSuggestions()]);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation">
        <Link href="/profile">Your profile</Link>
        <Link href="/interests">Your Interests</Link>
        <Link href="/meetups">All Meetups</Link>
        <Link href="/events">All Events</Link>
        <Link href="/attendance">Your Attendance history</Link>
        <Link href="/connections">Your Connections</Link>
        <Link href="/availability">Availability</Link>
        <Link href="/scout">Scout</Link>
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
      <section>
        <h2>Suggested Events</h2>
        <p>Open Events in your scope over the next fourteen days.</p>
        <p><Link href="/events/new">Propose an Event</Link></p>
        {events.length === 0 ? <p>No Events to suggest yet.</p> : <ul className="meetup-list">{events.map(({ event, reasons }) => <li key={event.id}>
          <p className="muted">Event</p>
          <h3><Link href={`/events/${event.id}`}>{event.activity.name}</Link></h3>
          <p><MeetupTime value={event.startsAt.toISOString()} /></p>
          <p>{event.place.kind === "physical" ? `${event.place.siteName}, ${event.place.spot}` : "Virtual"}</p>
          <p>Host: {event.host.name}</p>
          <p>{reasons.join(" ")}</p>
        </li>)}</ul>}
      </section>
    </main>
  );
}
