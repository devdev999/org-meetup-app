import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { MeetupTime } from "../meetups/meetup-time";

export default async function InboxPage() {
  const { member } = await requireMemberPastWelcome();
  const notices = await member.inbox();
  return (
    <main>
      <h1>Inbox</h1>
      {notices.length === 0 ? (
        <p className="muted">You have no notices yet.</p>
      ) : (
        <ul className="meetup-list">
          {notices.map((notice) => (
            <li key={notice.id}>
              <p>{notice.message}</p>
              <p className="muted">
                <MeetupTime value={notice.createdAt.toISOString()} />
              </p>
              {notice.eventId ? (
                <Link href={`/events/${notice.eventId}`}>View Event</Link>
              ) : notice.meetupId ? (
                <Link href={`/meetups/${notice.meetupId}`}>View Meetup</Link>
              ) : (
                <Link href="/availability">View Availability</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
