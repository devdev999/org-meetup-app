"use client";

import { useActionState } from "react";
import type { Interest } from "../../application/index";
import { confirmInterest, previewInterest, type InterestPreviewState, type InterestSaveState } from "./actions";

export function InterestDeclaration({ catalog }: { catalog: Interest[] }) {
  const [state, action, pending] = useActionState<InterestPreviewState, FormData>(
    (_previous, form) => previewInterest(form),
    {},
  );
  return (
    <section>
      <h2>Add an Interest</h2>
      <p>Describe an Interest in your own words. Review how it will be listed before saving.</p>
      <form action={action}>
        <label>
          Interest
          <input name="phrase" required maxLength={120} placeholder="For example, rustlang or board games" />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue="skill">
            <option value="skill">Skill</option>
            <option value="hobby">Hobby</option>
          </select>
        </label>
        <label>
          Stance
          <select name="stance" defaultValue="shares" aria-describedby="stance-help">
            <option value="shares">Shares</option>
            <option value="seeks">Seeks</option>
          </select>
        </label>
        <p id="stance-help" className="muted">Shares means you will do it with, or help, others. Seeks means you want to learn or get into it.</p>
        <button disabled={pending}>{pending ? "Preparing preview..." : "Preview Interest"}</button>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
      {!pending && state.preview && <InterestConfirmation key={state.preview.token} preview={state.preview} catalog={catalog} />}
    </section>
  );
}

function InterestConfirmation({ preview, catalog }: { preview: NonNullable<InterestPreviewState["preview"]>; catalog: Interest[] }) {
  const [state, action, pending] = useActionState<InterestSaveState, FormData>(
    (_previous, form) => confirmInterest(form),
    {},
  );
  if (state.saved) return <p className="notice" role="status">Interest saved.</p>;
  const proposed = preview.resolution.proposed;
  const proposedInterest = "interestId" in proposed
    ? [...preview.resolution.shortlist, ...catalog].find((interest) => interest.interestId === proposed.interestId)
    : proposed;
  const alternatives = preview.resolution.shortlist.filter((interest) => !("interestId" in proposed) || interest.interestId !== proposed.interestId);
  return (
    <section className="notice interest-preview" aria-label="Interest preview">
      <h3>Your Interest will be listed as {proposedInterest?.name ?? preview.resolution.phrase}</h3>
      <p>You typed "{preview.resolution.phrase}". Your Stance is {preview.stance === "shares" ? "Shares" : "Seeks"}.</p>
      <form action={action}>
        <input type="hidden" name="token" value={preview.token} />
        <label>
          Confirm or choose another Interest
          <select name="choice" defaultValue="proposed">
            <option value="proposed">Use {proposedInterest?.name ?? preview.resolution.phrase} ({proposedInterest?.kind === "hobby" ? "Hobby" : "Skill"})</option>
            {alternatives.map((interest) => (
              <option key={interest.interestId} value={interest.interestId}>{interest.name} ({interest.kind === "skill" ? "Skill" : "Hobby"})</option>
            ))}
            <option value="original">Keep my phrase: {preview.resolution.phrase} ({preview.kind === "skill" ? "Skill" : "Hobby"})</option>
          </select>
        </label>
        <button disabled={pending}>{pending ? "Saving..." : "Confirm Interest"}</button>
        {state.error && <p className="error" role="alert">{state.error}</p>}
      </form>
    </section>
  );
}
