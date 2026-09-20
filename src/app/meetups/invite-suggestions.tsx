"use client";

import { useActionState, useEffect, useState } from "react";
import type { InterestChoice, InviteSuggestion } from "../../application";
import { sendInvite, type MeetupActionState } from "./actions";

export function InviteSuggestions({ meetupId, suggestions }: { meetupId: string; suggestions: InviteSuggestion[] }) {
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(async (_previous, form) => {
    const suggestion = suggestions.find((entry) => entry.member.memberId === form.get("memberId"));
    if (suggestion?.previousInviteId) form.set("previousInviteId", suggestion.previousInviteId);
    return sendInvite(meetupId, form);
  }, {});
  return (
    <section>
      <h2>Suggested invitees</h2>
      <p>Based on your saved relevant Interests and Place.</p>
      <form action={action}>
        {suggestions.length === 0 ? <p>No eligible Members to suggest.</p> : <ul className="member-list">{suggestions.map((suggestion) => (
          <li className="notice" key={suggestion.member.memberId}>
            <h3>{suggestion.member.name}</h3>
            <p>{suggestion.member.department ?? "Department not set"}, {suggestion.member.site ?? "Site not set"}</p>
            <p>{suggestion.reasons.join(" ")}</p>
            <button name="memberId" value={suggestion.member.memberId} disabled={pending}>Invite {suggestion.member.name}</button>
          </li>
        ))}</ul>}
        {state.error && <p className="error" role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </form>
    </section>
  );
}

export function DraftInviteSuggestions({ seed, placeKind, siteId, interests }: {
  seed: string; placeKind: "physical" | "virtual"; siteId: string; interests: InterestChoice[];
}) {
  const [suggestions, setSuggestions] = useState<InviteSuggestion[]>([]);
  const [selected, setSelected] = useState<InviteSuggestion["member"][]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setSuggestions([]);
    setStatus(placeKind === "physical" && !siteId ? "Choose a Site to see Suggestions." : "Finding Members to invite...");
    const timer = setTimeout(async () => {
      if (placeKind === "physical" && !siteId) return;
      try {
        const response = await fetch("/api/invite-suggestions", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ seed, place: placeKind === "physical" ? { kind: "physical", siteId } : { kind: "virtual" }, relevantInterests: interests }),
        });
        const result: { suggestions?: InviteSuggestion[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        const next = result.suggestions ?? [];
        setSuggestions(next);
        setStatus(next.length ? "" : "No eligible Members to suggest.");
      } catch {
        if (!controller.signal.aborted) setStatus("Suggestions are unavailable. You can create this Meetup and invite Members later.");
      }
    }, 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [seed, placeKind, siteId, interests]);
  return (
    <fieldset>
      <legend>Suggested invitees</legend>
      <p>Choose Members to invite when you create this Meetup.</p>
      {selected.length > 0 && <ul className="member-list">{selected.map((member) => (
        <li key={member.memberId} className="form-actions">
          <span>{member.name}, {member.department ?? "Department not set"}</span>
          <input type="hidden" name="invitedMemberId" value={member.memberId} />
          <button type="button" className="secondary" onClick={() => setSelected((current) => current.filter((entry) => entry.memberId !== member.memberId))}>Remove {member.name}</button>
        </li>
      ))}</ul>}
      {status && <p className="muted" role="status">{status}</p>}
      <ul className="member-list">{suggestions.filter((suggestion) => !selected.some((member) => member.memberId === suggestion.member.memberId)).map((suggestion) => (
        <li className="notice" key={suggestion.member.memberId}>
          <h3>{suggestion.member.name}</h3>
          <p>{suggestion.member.department ?? "Department not set"}, {suggestion.member.site ?? "Site not set"}</p>
          <p>{suggestion.reasons.join(" ")}</p>
          <button type="button" disabled={selected.length >= 20} onClick={() => setSelected((current) => [...current, suggestion.member])}>Invite {suggestion.member.name} on creation</button>
        </li>
      ))}</ul>
    </fieldset>
  );
}
