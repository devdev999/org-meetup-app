"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { NoticeKind, NoticePreference } from "../../application/index";
import { changeTelegram, saveNoticePreference, type NotificationActionState } from "./actions";

const labels: Record<NoticeKind, string> = {
  "meetup-joined": "Meetup joins",
  "meetup-left": "Meetup departures",
  "meetup-promoted": "Waitlist promotions",
  "meetup-edited": "Time or Place changes",
  "meetup-cancelled": "Meetup cancellations",
  "meetup-handed-over": "Host handovers",
  "invite-received": "Invites",
  "invite-accepted": "Accepted Invites",
  "invite-declined": "Declined Invites",
  "availability-overlap": "Overlapping Availability",
  "rsvp-prompt": "RSVP prompts",
};

export function NoticePreferenceForm({ preference }: { preference: NoticePreference }) {
  const [state, action, pending] = useActionState<NotificationActionState, FormData>(
    (_previous, form) => saveNoticePreference(preference.kind, form), {},
  );
  const title = labels[preference.kind];
  return (
    <form action={action} className="notice-preference" aria-label={title}>
      <h3>{title}</h3>
      <div className="form-actions">
        <label className="channel-choice">
          <input type="checkbox" name="telegram" aria-label={`Telegram for ${title}`} defaultChecked={preference.telegram} /> Telegram
        </label>
        <label className="channel-choice">
          <input type="checkbox" name="email" aria-label={`Email for ${title}`} defaultChecked={preference.email} /> Email
        </label>
        <button type="submit" disabled={pending}>{pending ? "Saving..." : "Save"}</button>
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}

export function TelegramConnection({ available, linked }: { available: boolean; linked: boolean }) {
  const [state, action, pending] = useActionState(changeTelegram, {});
  const router = useRouter();
  if (!available) return <p className="muted">Telegram linking is unavailable for this deployment.</p>;
  return (
    <>
      <p>{linked ? "Telegram is linked." : "Link your Telegram account to receive notices there."}</p>
      <form action={action}>
        <button type="submit" name="operation" value={linked ? "unlink" : "link"} disabled={pending}>
          {pending ? "Saving..." : linked ? "Unlink Telegram" : "Link Telegram"}
        </button>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </form>
      {!linked && state.link && (
        <div className="notice" role="status">
          <p><a href={state.link.url} target="_blank" rel="noreferrer">Open Telegram</a> and press Start to link your account.</p>
          <p>This link expires at {state.link.expiresAt.slice(11, 16)} UTC.</p>
          <button type="button" className="secondary" onClick={() => router.refresh()}>Refresh link status</button>
        </div>
      )}
    </>
  );
}
