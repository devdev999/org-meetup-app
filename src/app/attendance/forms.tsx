"use client";

import { useActionState } from "react";
import type { Attendance } from "../../application";
import { saveAttendance, type AttendanceActionState } from "./actions";

export function AttendanceForm({ id, participants, confirmed }: { id: string; participants: NonNullable<Attendance["participants"]>; confirmed: boolean }) {
  const [state, action, pending] = useActionState<AttendanceActionState, FormData>((_previous, form) => saveAttendance(id, "confirm", form), {});
  return <form action={action}>
    <fieldset disabled={pending}>
      <legend>Who came?</legend>
      <p>Tick everyone who came, including yourself if you came.</p>
      {participants.map((person) => <label className="channel-choice" key={person.memberId}>
        <input type="checkbox" name="memberId" value={person.memberId} defaultChecked={person.attended} />{person.name}
      </label>)}
    </fieldset>
    <button type="submit" disabled={pending}>{pending ? "Saving..." : confirmed ? "Save amended Attendance" : "Confirm Attendance"}</button>
    {state.error && <p role="alert" className="error">{state.error}</p>}
  </form>;
}

export function RatingForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<AttendanceActionState, FormData>((_previous, form) => saveAttendance(id, "rate", form), {});
  return <form action={action}>
    <fieldset disabled={pending}>
      <legend>How was it?</legend>
      <p>Choose one to five. Your rating is used only in aggregate reports and cannot be changed.</p>
      <div className="rating-options">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="submit" name="rating" value={value} aria-label={`Rate ${value} of 5`}>{value}</button>)}</div>
    </fieldset>
    {state.error && <p role="alert" className="error">{state.error}</p>}
  </form>;
}
