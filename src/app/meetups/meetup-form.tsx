"use client";

import { localDateTime, parseLocalDateTime, formatTime } from "../../calendar";
import { useTimeZone } from "../_components/calendar";
import { useActionState, useEffect, useState } from "react";
import type { AvailabilitySuggestion, EventDetail, Interest, InterestChoice, MemberActions, MeetupDetail } from "../../application/index";
import { saveMeetup, type MeetupActionState } from "./actions";
import { MeetupInterests } from "./meetup-interests";
import { DraftInviteSuggestions } from "./invite-suggestions";

export function MeetupForm({
  choices,
  meetup,
  interests,
  suggestionSeed,
  availability,
  mode = "meetup",
}: {
  choices: Awaited<ReturnType<MemberActions["meetupChoices"]>>;
  meetup?: MeetupDetail | EventDetail;
  interests: Interest[];
  suggestionSeed?: string;
  availability?: AvailabilitySuggestion;
  mode?: "meetup" | "event" | "event-direct";
}) {
  const timeZone = useTimeZone();
  const kind = mode === "meetup" ? "meetup" : "event";
  const label = kind === "meetup" ? "Meetup" : "Event";
  const [placeKind, setPlaceKind] = useState(meetup?.place.kind ?? availability?.place.kind ?? "physical");
  const [audience, setAudience] = useState("default");
  const [frequency, setFrequency] = useState("once");
  const [endsOn, setEndsOn] = useState("");
  const [activityId, setActivityId] = useState(meetup?.activity.id ?? availability?.activity.id ?? "");
  const [description, setDescription] = useState(meetup?.description ?? "");
  const [siteId, setSiteId] = useState(meetup?.place.kind === "physical" ? meetup.place.siteId : availability?.place.kind === "physical" ? availability.place.siteId : choices.defaultSiteId ?? "");
  const [relevantInterests, setRelevantInterests] = useState<InterestChoice[]>([]);
  const [startsAt, setStartsAt] = useState(meetup ? localDateTime(meetup.startsAt, timeZone) : availability ? localDateTime(availability.startsAt, timeZone, true) : "");
  useEffect(() => {
    if (!meetup && !availability) setStartsAt(localDateTime(new Date(Date.now() + 30 * 60 * 1000), timeZone));
  }, [meetup, availability, timeZone]);
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => {
      try {
        const value = String(form.get("startsAt"));
        const start = meetup && value === localDateTime(meetup.startsAt, timeZone) ? new Date(meetup.startsAt) : parseLocalDateTime(value, timeZone);
        form.set("startsAt", start.toISOString());
      } catch { return Promise.resolve({ error: "Choose a valid local time. Daylight-saving transitions can skip or repeat a time." }); }
      return saveMeetup(meetup?.id ?? null, form, mode);
    },
    {},
  );
  const physicalPlace = meetup?.place.kind === "physical" ? meetup.place : null;
  const missingSite = physicalPlace && !choices.sites.some((site) => site.id === physicalPlace.siteId)
    ? physicalPlace
    : null;

  return (
    <form action={action} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="timeZone" value={timeZone} />
      {availability && <>
        <input type="hidden" name="ownAvailabilityId" value={availability.ownAvailabilityId} />
        <input type="hidden" name="otherAvailabilityId" value={availability.otherAvailabilityId} />
        <p className="notice">Creating this Meetup will invite {availability.member.name}. Supply the Place and review the fields before confirming.</p>
        <p className="muted">Your overlap is {formatTime(availability.startsAt, timeZone)} to {formatTime(availability.endsAt, timeZone)}. The overlap start is filled in. Choose a future start within this window before confirming.</p>
      </>}
      {!meetup && (
        <label>
          Activity
          <select name="activityId" required value={activityId} onChange={(change) => setActivityId(change.target.value)}>
            <option value="" disabled>Choose an Activity</option>
            {choices.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Start time in {timeZone}
        <input type="datetime-local" name="startsAt" required step={availability ? 1 : 60} value={startsAt} onChange={(change) => setStartsAt(change.target.value)} />
      </label>
      <p className="muted">Times use {timeZone}.</p>
      {!meetup && <>
        <label>
          Repeats
          <select name="frequency" value={frequency} onChange={(change) => setFrequency(change.target.value)}>
            <option value="once">Once</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {frequency !== "once" && <>
          <p className="muted">The first start sets the weekday and time. Monthly uses the same numbered weekday and skips months without a matching fifth weekday.</p>
          <label>
            Series end date in {timeZone}, optional
            <input type="date" name="endsOn" value={endsOn} onChange={(change) => setEndsOn(change.target.value)} />
          </label>
        </>}
      </>}
      {meetup?.recurrence && <p className="notice">These changes apply to this occurrence.</p>}
      <label>
        Duration in minutes
        <input type="number" name="durationMinutes" min="1" max="1440" step="1" required defaultValue={meetup?.durationMinutes ?? 60} />
      </label>
      <label>
        Place
        <select name="placeKind" value={placeKind} onChange={(change) => setPlaceKind(change.target.value === "virtual" ? "virtual" : "physical")}>
          <option value="physical">At a Site</option>
          <option value="virtual">Virtual</option>
        </select>
      </label>
      {placeKind === "physical" ? (
        <>
          <label>
            Site
            <select name="siteId" required value={siteId} onChange={(change) => setSiteId(change.target.value)}>
              <option value="" disabled>Choose a Site</option>
              {missingSite && <option value={missingSite.siteId}>{missingSite.siteName ?? "Current Site"}, retired</option>}
              {choices.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label>
            Spot at the Site
            <input name="spot" required maxLength={300} placeholder="For example, the ground floor cafe" defaultValue={meetup?.place.kind === "physical" ? meetup.place.spot : ""} />
          </label>
        </>
      ) : (
        <label>
          Virtual Place URL
          <input type="url" name="url" required maxLength={2000} placeholder="https://" defaultValue={meetup?.place.kind === "virtual" ? meetup.place.url : ""} />
        </label>
      )}
      <label>
        Capacity, including the Host{kind === "event" ? ", optional" : ""}
        <input type="number" name="capacity" min={kind === "event" ? 1 : 2} max={kind === "event" ? 2147483647 : 30} step="1" required={kind === "meetup"} defaultValue={meetup?.capacity ?? (kind === "event" ? "" : 6)} />
      </label>
      {kind === "event" && <p className="muted">Leave capacity blank for no limit.</p>}
      {!meetup && (
        <>
          <label>
            Audience
            <select name="audience" value={audience} onChange={(change) => setAudience(change.target.value)}>
              <option value="default">Default: {kind === "meetup" && placeKind === "physical" ? "your Site" : "whole Organisation"}</option>
              <option value="organisation">Open to the whole Organisation</option>
              <option value="site">Open to one Site</option>
              <option value="invite-only">Invite-only</option>
            </select>
          </label>
          {kind === "meetup" && audience === "default" && placeKind === "physical" && !choices.defaultSiteId && (
            <p className="muted">Set your Site in your profile or choose an audience.</p>
          )}
          {audience === "site" && (
            <label>
              Audience Site
              <select name="audienceSiteId" required defaultValue={choices.defaultSiteId ?? ""}>
                <option value="" disabled>Choose a Site</option>
                {choices.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          )}
          {audience === "invite-only" && <p className="muted">Only you and your invitees can see this {label} after publication.</p>}
        </>
      )}
      <label>
        Description, optional
        <textarea name="description" rows={4} maxLength={5000} value={description} onChange={(change) => setDescription(change.target.value)} />
      </label>
      <MeetupInterests kind={kind} catalog={interests} activityId={activityId} description={description} initialInterests={meetup?.relevantInterests} onChange={setRelevantInterests} />
      {!meetup && suggestionSeed && <DraftInviteSuggestions mode={mode} key={`${placeKind}:${siteId}`} seed={suggestionSeed} placeKind={placeKind} siteId={siteId} interests={relevantInterests} />}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Saving..." : meetup ? "Save changes" : mode === "event" ? "Submit Event proposal" : `Create ${label}`}</button>
    </form>
  );
}
