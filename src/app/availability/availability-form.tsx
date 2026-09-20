"use client";

import { calendarDayStart, localDate, localDateTime } from "../../calendar";
import { useTimeZone } from "../_components/calendar";
import { useActionState, useEffect, useState } from "react";
import type { MeetupChoices } from "../../application/index";
import { postAvailability } from "./actions";

export function AvailabilityForm({ choices }: { choices: MeetupChoices }) {
  const timeZone = useTimeZone();
  const [state, action, pending] = useActionState(postAvailability, {});
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  useEffect(() => {
    const now = new Date();
    const endOfDay = calendarDayStart(localDate(now, timeZone), timeZone, 1);
    setStartsAt(localDateTime(now, timeZone));
    setEndsAt(localDateTime(new Date(Math.min(now.getTime() + 60 * 60_000, endOfDay.getTime())), timeZone));
  }, [timeZone]);
  const site = choices.sites.find((entry) => entry.id === choices.defaultSiteId);
  return (
    <form action={action} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="timeZone" value={timeZone} />
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
      <label>Available from, {timeZone}
        <input name="startsAt" type="datetime-local" required value={startsAt} onChange={(change) => setStartsAt(change.target.value)} />
      </label>
      <label>Available until, {timeZone}
        <input name="endsAt" type="datetime-local" required value={endsAt} onChange={(change) => setEndsAt(change.target.value)} />
      </label>
      <p className="muted">Choose a window today. Availability ends by midnight {timeZone}.</p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" disabled={pending || !choices.activities.length}>{pending ? "Posting..." : "Post Availability"}</button>
    </form>
  );
}
