import { requireMemberPastWelcome } from "../../web/session";
import { PastOccurrence } from "./occurrence";
import { attendanceLabels } from "./labels";

export default async function AttendancePage() {
  const { member } = await requireMemberPastWelcome();
  const history = await member.attendanceHistory();
  return (
    <main>
      <h1>Your Attendance</h1>
      <p>
        No-show records are visible only to you and Organisation Admins and
        carry no penalty.
      </p>
      {history.length === 0 ? (
        <p>No past occurrences yet.</p>
      ) : (
        <ul className="meetup-list">
          {history.map((occurrence) => (
            <li key={occurrence.id}>
              <PastOccurrence occurrence={occurrence} />
              <p>Your Attendance: {attendanceLabels[occurrence.outcome]}.</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
