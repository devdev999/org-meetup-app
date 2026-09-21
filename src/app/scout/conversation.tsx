"use client";

import Link from "next/link";
import { useActionState } from "react";
import { askScout, type ScoutState } from "./actions";

export function ScoutConversation() {
  const [state, action, pending] = useActionState<ScoutState, FormData>(askScout, {});
  return <>
    <section aria-label="Scout conversation" aria-live="polite" className="scout-conversation">
      {state.reset && <p role="status">Started a new conversation because earlier information changed or the conversation was full.</p>}
      {!state.conversation?.turns.length && <p className="muted">Ask your first question.</p>}
      {state.conversation?.turns.map((turn, index) => <div className="notice" key={index}>
        <h2>You</h2>
        <p className="scout-text">{turn.question}</p>
        <h2>Scout</h2>
        <p className="scout-text">{turn.answer}</p>
        <ul>{turn.links.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
      </div>)}
    </section>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    <form action={action}>
      <label>Question<textarea name="question" maxLength={2000} rows={3} required disabled={pending} /></label>
      <button type="submit" disabled={pending}>{pending ? "Asking Scout..." : "Ask Scout"}</button>
      <button type="submit" name="intent" value="clear" formNoValidate className="secondary" disabled={pending}>New conversation</button>
    </form>
  </>;
}
