import Link from "next/link";
import { requireOrganisationAdmin } from "../../../web/session";
import { MeetupTime } from "../../meetups/meetup-time";
import { ModerationForm } from "./form";

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const admin = await requireOrganisationAdmin();
  const state = (await searchParams).state === "resolved" ? "resolved" : "open";
  const [flags, roster, occurrences] = await Promise.all([admin.flags(state), admin.roster(), admin.upcomingOccurrences()]);
  const upcomingIds = new Set(occurrences.map((occurrence) => occurrence.id));
  return <section>
    <h2>Moderation</h2>
    <p>Flags and reporter identities are visible only to Organisation Admins.</p>
    <nav className="member-nav" aria-label="Flag queue">
      <Link href="/admin/moderation" aria-current={state === "open" ? "page" : undefined}>Open Flags</Link>
      <Link href="/admin/moderation?state=resolved" aria-current={state === "resolved" ? "page" : undefined}>Resolved Flags</Link>
    </nav>
    <h3>{state === "open" ? "Open Flags" : "Resolved Flags"}</h3>
    {flags.length === 0 ? <p>No {state} Flags.</p> : flags.map((flag) => <article className="notice" key={flag.id}>
      <h4>{flag.target.label} · {flag.target.kind === "member" ? "Member" : flag.target.kind === "meetup" ? "Meetup" : "Event"}</h4>
      {flag.target.kind === "member" ? <>
        <p>{flag.target.email}</p>
        <p><a href={`#member-${flag.target.id}`}>Review Member access</a></p>
      </> : <>
        <p>Host: {flag.target.host.name}</p>
        <p><MeetupTime value={flag.target.startsAt.toISOString()} /></p>
        {upcomingIds.has(flag.target.id) && <p><a href={`#occurrence-${flag.target.id}`}>Review this {flag.target.kind === "meetup" ? "Meetup" : "Event"}</a></p>}
      </>}
      <p>Flagged by {flag.reporter.name} on <MeetupTime value={flag.createdAt.toISOString()} />.</p>
      <p className="meetup-description">{flag.reason}</p>
      {flag.resolution ? <>
        <p>Resolved on <MeetupTime value={flag.resolution.resolvedAt.toISOString()} />.</p>
        <p className="meetup-description">{flag.resolution.note}</p>
      </> : <ModerationForm id={flag.id} operation="resolve" label="Resolve Flag" />}
    </article>)}
    <h3>Member access</h3>
    <p>Suspension blocks access, hides the Member, cancels their upcoming hosted occurrences and removes their future places. History and Connections are kept. Reinstatement restores access without restoring cancelled work or places.</p>
    {roster.map((member) => <article className="notice" id={`member-${member.memberId}`} tabIndex={-1} key={member.memberId}>
      <h4>{member.name}</h4>
      <p>{member.email}</p>
      <p>Status: {member.status}</p>
      {member.status === "departed" ? <p>Restore this Member through the <Link href="/admin/roster">roster</Link>.</p>
        : <ModerationForm key={member.status} id={member.memberId} operation={member.status === "suspended" ? "reinstate" : "suspend"}
          label={member.status === "suspended" ? "Reinstate Member" : "Suspend Member"} />}
    </article>)}
    <h3>Upcoming occurrences</h3>
    <p>Cancelling an occurrence notifies its Host and Participants and clears its waitlist.</p>
    {occurrences.length === 0 ? <p>No upcoming occurrences.</p> : occurrences.map((occurrence) => <article className="notice" id={`occurrence-${occurrence.id}`} tabIndex={-1} key={occurrence.id}>
      <h4>{occurrence.activity.name} · {occurrence.kind === "meetup" ? "Meetup" : "Event"}</h4>
      <p>Host: {occurrence.host.name}</p>
      <p><MeetupTime value={occurrence.startsAt.toISOString()} /></p>
      <ModerationForm id={occurrence.id} operation={occurrence.kind === "meetup" ? "cancel-meetup" : "cancel-event"}
        label={occurrence.kind === "meetup" ? "Cancel Meetup" : "Cancel Event"} />
    </article>)}
  </section>;
}
