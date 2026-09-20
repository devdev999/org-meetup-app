import type { Recurrence } from "../../application/index";
import { SeriesAction } from "./series-action";

export function RecurrenceDetails({ series }: { series: Recurrence }) {
  const date = new Date(series.startsAt);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const ordinal = ["first", "second", "third", "fourth", "fifth"][Math.floor((date.getUTCDate() - 1) / 7)];
  const schedule = series.frequency === "monthly" ? `Monthly on the ${ordinal} ${weekday}` : `${series.frequency === "weekly" ? "Weekly" : "Fortnightly"} on ${weekday}`;
  return <>
    <p>{schedule} at {date.toISOString().slice(11, 16)} UTC{series.endsOn ? `, through ${series.endsOn}` : ""}.</p>
    <p>Series Host: {series.host.name}. {series.capacity === null ? `${series.standingCount} standing Participants. No capacity limit.` : `${series.standingCount} of ${series.capacity} standing places filled.`}</p>
    {series.isStanding && <p>You are a standing Participant.</p>}
    {series.stopped ? <p>This series has stopped.</p> : series.ended && <p>This series has ended.</p>}
    {series.canStop ? <>
      <p>Stopping cancels future occurrences and notifies their Participants.</p>
      <SeriesAction seriesId={series.id} operation="stop" label="Stop series" />
    </> : series.canLeave ? <SeriesAction seriesId={series.id} operation="leave" label="Leave series" />
      : series.canJoin ? <SeriesAction seriesId={series.id} operation="join" label="Join series" />
      : !series.stopped && !series.ended && (series.capacity !== null && series.standingCount >= series.capacity
        ? <p>All standing places are filled. You can still join an occurrence with room.</p>
        : <p>Joining this series requires an accepted Invite.</p>)}
  </>;
}
