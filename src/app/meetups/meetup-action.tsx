"use client";

import { useActionState } from "react";
import { changeMeetup, type MeetupActionState } from "./actions";

export function MeetupAction({
  meetupId,
  operation,
  label,
  participants,
}: {
  meetupId: string;
  operation: Parameters<typeof changeMeetup>[1];
  label: string;
  participants?: { memberId: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => changeMeetup(meetupId, operation, form),
    {},
  );
  return (
    <form action={action}>
      {participants && (
        <label>
          New Host
          <select name="participantMemberId" required defaultValue="">
            <option value="" disabled>Choose a Participant</option>
            {participants.map((participant) => <option key={participant.memberId} value={participant.memberId}>{participant.name}</option>)}
          </select>
        </label>
      )}
      <button type="submit" className={operation === "join" ? undefined : "secondary"} disabled={pending}>
        {pending ? "Saving..." : label}
      </button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p className="notice" role="status">{state.message}</p>}
    </form>
  );
}
