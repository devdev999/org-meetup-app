"use client";

import { useActionState } from "react";
import type { MemberInterest } from "../../application/index";
import { updateInterestStance, type InterestSaveState } from "./actions";

export function StanceForm({ interest }: { interest: MemberInterest }) {
  const [state, action, pending] = useActionState<InterestSaveState, FormData>(
    (_previous, form) => updateInterestStance(form),
    {},
  );
  return (
    <form action={action} className="stance-form">
      <input type="hidden" name="interestId" value={interest.interestId} />
      <label>
        Stance for {interest.name}
        <select name="stance" defaultValue={interest.stance}>
          <option value="shares">Shares</option>
          <option value="seeks">Seeks</option>
        </select>
      </label>
      <button className="secondary" disabled={pending}>{pending ? "Saving..." : "Save Stance"}</button>
      {state.saved && !pending && <span role="status">Saved.</span>}
      {state.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
