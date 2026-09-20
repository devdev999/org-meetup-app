"use client";

import { useActionState } from "react";
import { answerRsvp, type MeetupActionState } from "./actions";

export function RsvpForm({ meetupId, kind = "meetup" }: { meetupId: string; kind?: "meetup" | "event" }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>((_previous, form) => answerRsvp(meetupId, form, kind), {});
  return <form action={action}>
    <div className="form-actions">
      <button type="submit" name="answer" value="going" disabled={pending}>Going</button>
      <button type="submit" name="answer" value="not-going" className="secondary" disabled={pending}>Not going</button>
    </div>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
