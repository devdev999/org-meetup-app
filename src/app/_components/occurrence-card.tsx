import Link from "next/link";
import type { EventSummary, MeetupSummary } from "../../application";
import { MeetupTime } from "../meetups/meetup-time";
import { activityPhoto, Avatar, Icon } from "./ui";

export function occurrencePath(meetup: MeetupSummary | EventSummary) {
  return `/${meetup.kind === "meetup" ? "meetups" : "events"}/${meetup.id}`;
}

export function OccurrenceCard({
  meetup,
  reasons = [],
}: {
  meetup: MeetupSummary | EventSummary;
  reasons?: string[];
}) {
  const label = meetup.kind === "meetup" ? "Meetup" : "Event";
  return (
    <li className="occurrence-card">
      <Link
        href={occurrencePath(meetup)}
        className="card-photo"
        aria-label={`View ${label}: ${meetup.activity.name}`}
      >
        <img
          src={activityPhoto(meetup.activity.name)}
          alt=""
          width="700"
          height="440"
          loading="lazy"
        />
        <span>{meetup.kind === "event" ? "Event" : meetup.activity.name}</span>
      </Link>
      <div className="card-body">
        <p className="card-time">
          <MeetupTime value={meetup.startsAt.toISOString()} />
        </p>
        <h2>
          <Link href={occurrencePath(meetup)}>{meetup.activity.name}</Link>
        </h2>
        <p className="card-place">
          <Icon name="pin" size={15} />
          {meetup.place.kind === "physical"
            ? `${meetup.place.siteName ?? "Site"}, ${meetup.place.spot}`
            : "Virtual"}
        </p>
        <p className="card-host">
          <Avatar name={meetup.host.name} />
          Host: {meetup.host.name}
        </p>
        {reasons.length > 0 && (
          <p className="card-reasons">{reasons.join(" ")}</p>
        )}
        <div className="card-foot">
          <span>
            <Icon name="people" size={16} />
            {meetup.capacity === null
              ? `${meetup.participantCount} joined, no capacity limit`
              : `${meetup.participantCount} of ${meetup.capacity} places filled`}
          </span>
          {meetup.status === "cancelled" ? (
            <span className="status warning">Cancelled</span>
          ) : (
            meetup.membership && (
              <span className="status">
                {meetup.membership === "host"
                  ? "Host"
                  : meetup.membership === "waitlisted"
                    ? "Waitlisted"
                    : "Joined"}
              </span>
            )
          )}
        </div>
      </div>
    </li>
  );
}
