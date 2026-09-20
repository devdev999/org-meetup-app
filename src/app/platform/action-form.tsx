"use client";

import { useActionState, type ReactNode } from "react";
import type { PlatformActionState } from "./actions";

export function ActionForm({ action, label, children }: {
  action: (previous: PlatformActionState, form: FormData) => Promise<PlatformActionState>;
  label: string;
  children: ReactNode;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return <form action={submit} onReset={(event) => event.preventDefault()}>
    {children}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
    <button type="submit" disabled={pending}>{pending ? "Saving..." : label}</button>
  </form>;
}
