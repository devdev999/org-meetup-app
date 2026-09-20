"use client";

import { useActionState } from "react";
import type { MeetupActionState } from "../../meetups/actions";
import { moderate, type ModerationOperation } from "./actions";

export function ModerationForm({ id, operation, label }: { id: string; operation: ModerationOperation; label: string }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>((_previous, form) => moderate(id, operation, form), {});
  return <form action={action}>
    {operation === "resolve" && <label>Resolution note<textarea name="note" required maxLength={2000} rows={3} /></label>}
    <button className="secondary" disabled={pending}>{label}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
