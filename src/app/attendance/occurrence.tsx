import Link from "next/link";
import type { ConnectionOccurrence } from "../../application";
import { MeetupTime } from "../meetups/meetup-time";

export function PastOccurrence({ occurrence }: { occurrence: ConnectionOccurrence }) {
  return <>
    <p><Link href={`/${occurrence.kind === "event" ? "events" : "meetups"}/${occurrence.id}`}>{occurrence.activity.name}</Link></p>
    <p>{occurrence.kind === "event" ? "Event" : "Meetup"} · <MeetupTime value={occurrence.startsAt.toISOString()} /></p>
    <p>{occurrence.place.kind === "physical" ? `${occurrence.place.siteName}, ${occurrence.place.spot}`
      : <a href={occurrence.place.url} target="_blank" rel="noreferrer">Virtual Place</a>}</p>
  </>;
}
