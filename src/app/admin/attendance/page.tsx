import { notFound } from "next/navigation";
import { requireOrganisationAdmin } from "../../../web/session";
import { PastOccurrence } from "../../attendance/occurrence";
import { attendanceLabels } from "../../attendance/labels";

export default async function AdminAttendancePage({ searchParams }: { searchParams: Promise<{ memberId?: string }> }) {
  const admin = await requireOrganisationAdmin();
  const [roster, ratings] = await Promise.all([admin.roster(), admin.ratings()]);
  const { memberId } = await searchParams;
  if (memberId && !roster.some((member) => member.memberId === memberId)) notFound();
  const history = memberId ? await admin.memberAttendance(memberId) : null;
  return <>
    <h2>Attendance and ratings</h2>
    <section>
      <h3>Member Attendance</h3>
      <form>
        <label>Member<select name="memberId" defaultValue={memberId ?? ""} required>
          <option value="" disabled>Choose a Member</option>
          {roster.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
        </select></label>
        <button type="submit">View Attendance</button>
      </form>
      <p>Every individual view is recorded in the audit log.</p>
      {history && (history.length === 0 ? <p>No past occurrences for this Member.</p> : <ul className="meetup-list">{history.map((occurrence) => <li key={occurrence.id}>
        <PastOccurrence occurrence={occurrence} /><p>Attendance: {attendanceLabels[occurrence.outcome]}.</p>
      </li>)}</ul>)}
    </section>
    <section>
      <h3>Ratings by Activity</h3>
      {ratings.length === 0 ? <p>No ratings recorded yet.</p> : <table>
        <thead><tr><th>Activity</th><th>Ratings</th><th>Average out of five</th></tr></thead>
        <tbody>{ratings.map((rating) => <tr key={rating.activity.id}><td>{rating.activity.name}</td><td>{rating.ratingCount}</td><td>{rating.averageRating.toFixed(2)}</td></tr>)}</tbody>
      </table>}
    </section>
  </>;
}
