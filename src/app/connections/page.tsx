import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { PastOccurrence } from "../attendance/occurrence";

export default async function ConnectionsPage() {
  const { member } = await requireMemberPastWelcome();
  const connections = await member.connections();
  return <main>
    <nav className="member-nav"><Link href="/profile">Your profile</Link><Link href="/attendance">Your Attendance history</Link></nav>
    <h1>Your Connections</h1>
    {connections.length === 0 ? <p>No Connections recorded yet.</p> : connections.map((connection) => <section key={connection.member.memberId}>
      <h2>{connection.member.profileVisible ? <Link href={`/members/${connection.member.memberId}`}>{connection.member.name}</Link> : connection.member.name}</h2>
      <ul className="meetup-list">{connection.occurrences.map((occurrence) => <li key={occurrence.id}><PastOccurrence occurrence={occurrence} /></li>)}</ul>
    </section>)}
  </main>;
}
