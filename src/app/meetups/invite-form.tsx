"use client";

import { useActionState } from "react";
import type { InviteChoices } from "../../application";
import { answerInvite, sendInvite, type MeetupActionState } from "./actions";

export function InviteForm({ meetupId, members }: { meetupId: string; members: InviteChoices["members"] }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => sendInvite(meetupId, form), {},
  );
  return (
    <form action={action}>
      <label>
        Member to invite
        <select name="memberId" required defaultValue="">
          <option value="" disabled>Choose a Member</option>
          {members.map((member) => (
            <option key={member.memberId} value={member.memberId}>
              {member.name}, {member.department ?? "Department not set"}, {member.site ?? "Site not set"}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending || members.length === 0}>{pending ? "Sending..." : "Send Invite"}</button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}

export function InviteAnswerForm({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => answerInvite(inviteId, form), {},
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
