"use client";

import { useActionState } from "react";
import type { FlagInput } from "../../application";
import type { MeetupActionState } from "../meetups/actions";
import { sendFlag } from "./actions";

export function FlagForm({ target }: { target: FlagInput["target"] }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>((_previous, form) => sendFlag(target, form), {});
  const label = target.kind === "member" ? "Member" : target.kind === "meetup" ? "Meetup" : "Event";
  return <details>
    <summary>Flag this {label}</summary>
    <p>Your Flag and identity are visible only to your Organisation Admins.</p>
    {state.message ? <p role="status">{state.message}</p> : <form action={action}>
      <label>Reason for this Flag<textarea name="reason" required maxLength={2000} rows={3} /></label>
      <button disabled={pending}>Send Flag</button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
    </form>}
  </details>;
}
