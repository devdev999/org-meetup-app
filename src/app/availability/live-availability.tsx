"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AvailabilityBoard } from "../../application/index";
import { MeetupTime } from "../meetups/meetup-time";

export function LiveAvailability({ board }: { board: AvailabilityBoard }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => { setNow(Date.now()); router.refresh(); };
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [router]);
  useEffect(() => {
    if (!board.open.length) return;
    const nextEnd = Math.min(...board.open.map((entry) => entry.endsAt.getTime()));
    const timeout = setTimeout(() => { setNow(Date.now()); router.refresh(); }, Math.max(0, nextEnd - Date.now() + 25));
    return () => clearTimeout(timeout);
  }, [board, router]);
  const open = board.open.filter((entry) => now === null || entry.endsAt.getTime() > now);
  const suggestions = board.suggestions.filter((entry) => now === null || entry.endsAt.getTime() > now);
  return (
    <>
      <h2>Overlapping Availability</h2>
      {suggestions.length === 0 ? <p>No overlaps with your Availability right now.</p> : <ul className="meetup-list">
        {suggestions.map((suggestion) => <li key={`${suggestion.ownAvailabilityId}:${suggestion.otherAvailabilityId}`}>
          <h3>{suggestion.member.name} is free for {suggestion.activity.name}</h3>
          <p>Your Availability overlaps from <MeetupTime value={suggestion.startsAt.toISOString()} /> to {suggestion.endsAt.toISOString().slice(11, 16)} UTC.</p>
          <p>{suggestion.place.kind === "physical" ? suggestion.place.siteName : "Virtual"}</p>
          <Link href={`/meetups/new?ownAvailabilityId=${suggestion.ownAvailabilityId}&otherAvailabilityId=${suggestion.otherAvailabilityId}`}>Plan a Meetup with {suggestion.member.name}</Link>
        </li>)}
      </ul>}
      <h2>Who is free now</h2>
      {open.length === 0 ? <p>No Availability is open in your scope right now.</p> : <ul className="member-list">
        {open.map((entry) => <li key={entry.id}>
          <h3>{entry.member.name}</h3>
          <p>{entry.activity.name}, {entry.place.kind === "physical" ? entry.place.siteName : "Virtual"}</p>
          <p><MeetupTime value={entry.startsAt.toISOString()} /> to {entry.endsAt.toISOString().slice(11, 16)} UTC</p>
        </li>)}
      </ul>}
    </>
  );
}
