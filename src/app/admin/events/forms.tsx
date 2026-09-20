"use client";

import { useActionState, useState } from "react";
import type { RosterMember } from "../../../application";
import type { MeetupActionState } from "../../meetups/actions";
import { manageEvent } from "./actions";

export function EventDecisionForm({ eventId, decided }: { eventId: string; decided: boolean }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>((_previous, form) => manageEvent(eventId, form), {});
  return <form action={action}>
    {!decided && <>
      <label>Note, required for rejection<textarea name="note" maxLength={2000} rows={3} /></label>
      <div className="form-actions">
        <button name="operation" value="approve" disabled={pending}>Approve Event</button>
        <button name="operation" value="reject" className="secondary" disabled={pending}>Reject Event</button>
      </div>
    </>}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function ReassignEventForm({ eventId, hostId, members }: { eventId: string; hostId: string; members: Pick<RosterMember, "memberId" | "name">[] }) {
  const [choosing, setChoosing] = useState(false);
  const [state, action, pending] = useActionState<MeetupActionState, FormData>((_previous, form) => manageEvent(eventId, form), {});
  return <form action={action}>
    {choosing ? <>
      <label>New Event Host<select name="memberId" required defaultValue="">
        <option value="" disabled>Choose an Active Member</option>
        {members.filter((member) => member.memberId !== hostId).map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
      </select></label>
      <div className="form-actions">
        <button name="operation" value="reassign" disabled={pending}>Reassign Event Host</button>
        <button type="button" className="secondary" disabled={pending} onClick={() => setChoosing(false)}>Cancel</button>
      </div>
    </> : <button type="button" onClick={() => setChoosing(true)}>Reassign Event Host</button>}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
