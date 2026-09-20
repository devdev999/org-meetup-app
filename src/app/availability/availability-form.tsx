"use client";

import { useActionState, useEffect, useState } from "react";
import type { MeetupChoices } from "../../application/index";
import { postAvailability } from "./actions";

export function AvailabilityForm({ choices }: { choices: MeetupChoices }) {
  const [state, action, pending] = useActionState(postAvailability, {});
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  useEffect(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0);
    setStartsAt(now.toISOString().slice(0, 16));
    setEndsAt(new Date(Math.min(now.getTime() + 60 * 60_000, endOfDay.getTime())).toISOString().slice(0, 16));
  }, []);
  const site = choices.sites.find((entry) => entry.id === choices.defaultSiteId);
  return (
    <form action={action} onReset={(event) => event.preventDefault()}>
      <label>Activity
        <select name="activityId" required defaultValue="">
          <option value="" disabled>Choose an Activity</option>
          {choices.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
        </select>
      </label>
      <label>Place setting
        <select name="kind" defaultValue={site ? "physical" : "virtual"}>
          {site && <option value="physical">At my Site, {site.name}</option>}
          <option value="virtual">Virtual</option>
        </select>
      </label>
      {!site && <p className="muted">Set a current Site in your profile to post physical Availability.</p>}
      <label>Available from, UTC
        <input name="startsAt" type="datetime-local" required value={startsAt} onChange={(change) => setStartsAt(change.target.value)} />
      </label>
      <label>Available until, UTC
        <input name="endsAt" type="datetime-local" required value={endsAt} onChange={(change) => setEndsAt(change.target.value)} />
      </label>
      <p className="muted">Choose a window today. Availability ends by midnight UTC.</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" disabled={pending || !choices.activities.length}>{pending ? "Posting..." : "Post Availability"}</button>
    </form>
  );
}
