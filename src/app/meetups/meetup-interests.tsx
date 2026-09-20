"use client";

import { useEffect, useMemo, useState } from "react";
import type { Interest, InterestChoice, InterestResolution } from "../../application";

function choiceKey({ selection }: InterestChoice) {
  return "interestId" in selection ? selection.interestId : selection.name.toLowerCase();
}

export function MeetupInterests({ catalog, activityId, description, initialInterests, onChange }: {
  catalog: Interest[];
  activityId: string;
  description: string;
  initialInterests?: Interest[];
  onChange: (value: InterestChoice[]) => void;
}) {
  const [manual, setManual] = useState<InterestChoice[]>(() => (initialInterests ?? []).map((interest) => ({ phrase: interest.name, selection: { interestId: interest.interestId } })));
  const [automatic, setAutomatic] = useState<InterestChoice[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (initialInterests !== undefined) return;
    const controller = new AbortController();
    setAutomatic([]);
    setStatus(activityId ? "Finding relevant Interests. You can create the Meetup while this runs." : "Choose an Activity to find relevant Interests.");
    const timer = setTimeout(async () => {
      if (!activityId) return;
      try {
        const response = await fetch("/api/meetup-interests", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityId, description }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("Automatic Interests are unavailable.");
        const result: { proposals: InterestResolution[] } = await response.json();
        if (controller.signal.aborted) return;
        setAutomatic(result.proposals.map((proposal) => ({ phrase: proposal.phrase, selection: proposal.proposed })));
        setStatus(result.proposals.length ? "Review these Interests before creating your Meetup." : "No automatic Interests were added. Choose manually or create without them.");
      } catch {
        if (!controller.signal.aborted) setStatus("Automatic Interests are unavailable. Choose manually or create without them.");
      }
    }, 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activityId, description, initialInterests]);
  const selected = useMemo(() => {
    const included = automatic.filter((choice) => !excluded.includes(choiceKey(choice))
      && !manual.some((entry) => choiceKey(entry) === choiceKey(choice)));
    const unique = new Map([...manual, ...included].map((choice) => [choiceKey(choice), choice]));
    return [...unique.values()].slice(0, 20);
  }, [manual, automatic, excluded]);
  useEffect(() => onChange(selected), [selected, onChange]);
  return (
    <fieldset>
      <legend>Relevant Interests, optional</legend>
      <p>These describe this Meetup and leave your own Shares and Seeks unchanged.</p>
      <label>
        Add a relevant Interest
        <select value="" onChange={(change) => {
          const interest = catalog.find((entry) => entry.interestId === change.target.value);
          if (interest) setManual((current) => [...current, { phrase: interest.name, selection: { interestId: interest.interestId } }]);
        }} disabled={selected.length >= 20}>
          <option value="">Choose an Interest</option>
          {catalog.filter((interest) => !selected.some((choice) => choiceKey(choice) === interest.interestId)).map((interest) => (
            <option key={interest.interestId} value={interest.interestId}>{interest.name}</option>
          ))}
        </select>
      </label>
      {status && <p className="muted" role="status">{status}</p>}
      {selected.length > 0 && <ul className="member-list">{selected.map((choice) => {
        const key = choiceKey(choice);
        const selection = choice.selection;
        const name = "interestId" in selection ? catalog.find((interest) => interest.interestId === selection.interestId)?.name ?? choice.phrase
          : `New ${selection.kind === "skill" ? "Skill" : "Hobby"}: ${selection.name}`;
        return <li key={key} className="form-actions"><span>{name}</span><button type="button" className="secondary" onClick={() => {
          setManual((current) => current.filter((entry) => choiceKey(entry) !== key));
          setExcluded((current) => [...current, key]);
        }}>Remove {name}</button></li>;
      })}</ul>}
      <input type="hidden" name="relevantInterests" value={JSON.stringify(selected)} />
    </fieldset>
  );
}
