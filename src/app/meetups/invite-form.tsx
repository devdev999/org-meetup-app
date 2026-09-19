"use client";

import { useActionState } from "react";
import { respondToInvite, sendInvite, type MeetupActionState } from "./actions";

export function InviteForm({ meetupId, members }: { meetupId: string; members: { memberId: string; name: string }[] }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => sendInvite(meetupId, form), {},
  );
  return (
    <form action={action}>
      <label>
        Member to invite
        <select name="memberId" required defaultValue="">
          <option value="" disabled>Choose a Member</option>
          {members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={pending || members.length === 0}>{pending ? "Sending..." : "Send Invite"}</button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}

export function InviteResponse({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => respondToInvite(inviteId, form), {},
  );
  return (
    <form action={action}>
      <div className="form-actions">
        <button type="submit" name="answer" value="accept" disabled={pending}>Accept Invite</button>
        <button type="submit" name="answer" value="decline" className="secondary" disabled={pending}>Decline Invite</button>
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
