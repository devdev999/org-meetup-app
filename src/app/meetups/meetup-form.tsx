"use client";

import { useActionState, useEffect, useState } from "react";
import type { Interest, InterestChoice, MemberActions, MeetupDetail } from "../../application/index";
import { saveMeetup, type MeetupActionState } from "./actions";
import { MeetupInterests } from "./meetup-interests";
import { DraftInviteSuggestions } from "./invite-suggestions";

export function MeetupForm({
  choices,
  meetup,
  interests,
  suggestionSeed,
}: {
  choices: Awaited<ReturnType<MemberActions["meetupChoices"]>>;
  meetup?: MeetupDetail;
  interests: Interest[];
  suggestionSeed?: string;
}) {
  const [placeKind, setPlaceKind] = useState(meetup?.place.kind ?? "physical");
  const [audience, setAudience] = useState("default");
  const [activityId, setActivityId] = useState(meetup?.activity.id ?? "");
  const [description, setDescription] = useState(meetup?.description ?? "");
  const [siteId, setSiteId] = useState(meetup?.place.kind === "physical" ? meetup.place.siteId : choices.defaultSiteId ?? "");
  const [relevantInterests, setRelevantInterests] = useState<InterestChoice[]>([]);
  const [startsAt, setStartsAt] = useState(meetup ? new Date(meetup.startsAt).toISOString().slice(0, 16) : "");
  useEffect(() => {
    if (!meetup) setStartsAt(new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16));
  }, [meetup]);
  const [state, action, pending] = useActionState<MeetupActionState, FormData>(
    (_previous, form) => {
      const start = new Date(`${String(form.get("startsAt"))}Z`);
      if (Number.isNaN(start.getTime())) return Promise.resolve({ error: "Choose a start time." });
      form.set("startsAt", start.toISOString());
      return saveMeetup(meetup?.id ?? null, form);
    },
    {},
  );
  const physicalPlace = meetup?.place.kind === "physical" ? meetup.place : null;
  const missingSite = physicalPlace && !choices.sites.some((site) => site.id === physicalPlace.siteId)
    ? physicalPlace
    : null;

  return (
    <form action={action}>
      {!meetup && (
        <label>
          Activity
          <select name="activityId" required value={activityId} onChange={(event) => setActivityId(event.target.value)}>
            <option value="" disabled>Choose an Activity</option>
            {choices.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Start time in UTC
        <input type="datetime-local" name="startsAt" required value={startsAt} onChange={(change) => setStartsAt(change.target.value)} />
      </label>
      <p className="muted">All Meetup times use UTC.</p>
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
            <select name="siteId" required value={siteId} onChange={(event) => setSiteId(event.target.value)}>
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
        Capacity, including the Host
        <input type="number" name="capacity" min="2" max="30" step="1" required defaultValue={meetup?.capacity ?? 6} />
      </label>
      {!meetup && (
        <>
          <label>
            Audience
            <select name="audience" value={audience} onChange={(change) => setAudience(change.target.value)}>
              <option value="default">Default: {placeKind === "physical" ? "your Site" : "whole Organisation"}</option>
              <option value="organisation">Open to the whole Organisation</option>
              <option value="site">Open to one Site</option>
              <option value="invite-only">Invite-only</option>
            </select>
          </label>
          {audience === "default" && placeKind === "physical" && !choices.defaultSiteId && (
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
          {audience === "invite-only" && <p className="muted">Only you and your invitees can see this Meetup.</p>}
        </>
      )}
      <label>
        Description, optional
        <textarea name="description" rows={4} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <MeetupInterests catalog={interests} activityId={activityId} description={description} initialInterests={meetup?.relevantInterests} onChange={setRelevantInterests} />
      {!meetup && suggestionSeed && <DraftInviteSuggestions seed={suggestionSeed} placeKind={placeKind} siteId={siteId} interests={relevantInterests} />}
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Saving..." : meetup ? "Save changes" : "Create Meetup"}</button>
    </form>
  );
}
