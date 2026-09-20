import type { Recurrence } from "../../application/index";
import { SeriesAction } from "./series-action";

export function RecurrenceDetails({ series, memberId }: { series: Recurrence; memberId: string }) {
  const date = new Date(series.startsAt);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const ordinal = ["first", "second", "third", "fourth", "fifth"][Math.floor((date.getUTCDate() - 1) / 7)];
  const schedule = series.frequency === "monthly" ? `Monthly on the ${ordinal} ${weekday}` : `${series.frequency === "weekly" ? "Weekly" : "Fortnightly"} on ${weekday}`;
  return <>
    <p>{schedule} at {date.toISOString().slice(11, 16)} UTC{series.endsOn ? `, through ${series.endsOn}` : ""}.</p>
    <p>Series Host: {series.host.name}. {series.standingCount} of {series.capacity} standing places filled.</p>
    {series.isStanding && <p>You are a standing Participant.</p>}
    {series.stopped ? <p>This series has stopped.</p> : series.endsOn && series.endsOn < new Date().toISOString().slice(0, 10) ? <p>This series has ended.</p> : <>
      {series.host.memberId === memberId ? <>
        <p>Stopping cancels future occurrences and notifies their Participants.</p>
        <SeriesAction seriesId={series.id} operation="stop" label="Stop series" />
      </> : series.isStanding ? <SeriesAction seriesId={series.id} operation="leave" label="Leave series" />
        : !series.canJoin ? <p>Joining this series requires an accepted Invite.</p>
        : series.standingCount < series.capacity ? <SeriesAction seriesId={series.id} operation="join" label="Join series" />
          : <p>All standing places are filled. You can still join an occurrence with room.</p>}
    </>}
  </>;
}
