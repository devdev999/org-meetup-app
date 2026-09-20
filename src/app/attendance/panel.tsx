import Link from "next/link";
import type { Attendance } from "../../application";
import { MeetupTime } from "../meetups/meetup-time";
import { AttendanceForm, RatingForm } from "./forms";
import { attendanceLabels } from "./labels";

export function AttendancePanel({ id, attendance }: { id: string; attendance?: Attendance }) {
  if (!attendance?.hasEnded) return null;
  return <section>
    <h2>Attendance</h2>
    <p role="status">Your Attendance: {attendanceLabels[attendance.outcome]}.</p>
    {attendance.outcome === "no-show" && <p>Only you and Organisation Admins can see your no-show record. It carries no penalty.</p>}
    {attendance.outcome === "unknown" && <p>The Host has not confirmed Attendance.</p>}
    <p>Confirmation and amendments close at <MeetupTime value={attendance.closesAt.toISOString()} />.</p>
    {attendance.canConfirm && attendance.participants && <AttendanceForm key={attendance.confirmedAt?.toISOString() ?? "unconfirmed"} id={id} participants={attendance.participants} confirmed={attendance.confirmedAt !== null} />}
    {attendance.hasRated ? <p role="status">Your rating was recorded.</p> : attendance.canRate && <RatingForm id={id} />}
    <p><Link href="/connections">Your Connections</Link> · <Link href="/attendance">Your Attendance history</Link></p>
  </section>;
}
