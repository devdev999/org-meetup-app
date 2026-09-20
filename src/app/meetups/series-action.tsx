"use client";

import { useActionState } from "react";
import { changeSeries, type MeetupActionState } from "./actions";

export function SeriesAction({ seriesId, operation, label }: { seriesId: string; operation: Parameters<typeof changeSeries>[1]; label: string }) {
  const [state, action, pending] = useActionState<MeetupActionState>(() => changeSeries(seriesId, operation), {});
  return <form action={action}>
    <button type="submit" className={operation === "join" ? undefined : "secondary"} disabled={pending}>{pending ? "Saving..." : label}</button>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
