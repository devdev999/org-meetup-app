import { useState } from "react";
import {
  Avatar,
  EmptyState,
  Icon,
  PageHeading,
  SectionHeading,
  Status,
} from "./components";
import {
  formatMeetupDate,
  initialMeetups,
  members,
  type Meetup,
  type Navigate,
  type Notify,
  type Variant,
} from "./data";

type DiscoveryProps = {
  variant: Variant;
  meetups: Meetup[];
  kind?: "Meetup" | "Event";
  navigate: Navigate;
  joined: string[];
};

export function MeetupCard({
  meetup,
  navigate,
  joined,
}: {
  meetup: Meetup;
  navigate: Navigate;
  joined: boolean;
}) {
  return (
    <article className="mock-meetup-card">
      <button
        className="mock-image-button"
        onClick={() => navigate("detail", meetup.id)}
        aria-label={`View ${meetup.title}`}
      >
        <img
          src={`/prototype-ui/${meetup.photo}.webp`}
          alt=""
          width="700"
          height="440"
        />
        <span className="mock-image-label">{meetup.activity}</span>
      </button>
      <div className="mock-card-copy">
        <p className="mock-card-time">
          {formatMeetupDate(meetup.date)} <span>·</span> {meetup.time}
        </p>
        <h3>
          <button
            className="mock-text-button"
            onClick={() => navigate("detail", meetup.id)}
          >
            {meetup.title}
          </button>
        </h3>
        <p className="mock-meta">
          <Icon name="pin" size={15} />
          {meetup.place}
        </p>
        <p className="mock-card-reason">{meetup.reason}</p>
        <div className="mock-card-bottom">
          <span className="mock-meta">
            <Icon name="people" size={16} />
            {meetup.participants}/{meetup.capacity} joined
          </span>
          {joined ? (
            <Status>Joined</Status>
          ) : (
            <span>
              {meetup.capacity === meetup.participants
                ? "Waitlist open"
                : `${meetup.capacity - meetup.participants} places left`}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Agenda({ navigate }: { navigate: Navigate }) {
  return (
    <aside className="mock-agenda">
      <SectionHeading title="Your week">
        <Icon name="calendar" />
      </SectionHeading>
      <p className="mock-muted">September 2026</p>
      <div className="mock-week" aria-label="Week of 21 September">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <div className={index === 1 ? "today" : ""} key={index}>
            <span>{day}</span>
            <strong>{21 + index}</strong>
            <span className={index === 1 || index === 3 ? "has-meetup" : ""} />
          </div>
        ))}
      </div>
      <div className="mock-agenda-item">
        <span className="mock-date-tile">
          THU<strong>24</strong>
        </span>
        <div>
          <p>14:00 · Learning session</p>
          <button
            className="mock-text-button"
            onClick={() => navigate("detail", "learning")}
          >
            Make your data tell a story
          </button>
          <small>North Site</small>
        </div>
      </div>
      <button className="mock-link-button" onClick={() => navigate("meetups")}>
        See your Meetups <Icon name="arrow" size={17} />
      </button>
      <div className="mock-availability-note">
        <Icon name="coffee" size={28} />
        <h3>A little time to spare?</h3>
        <p>Share your Availability and find someone to spend it with.</p>
        <button
          className="mock-button secondary"
          onClick={() => navigate("availability")}
        >
          Set Availability <Icon name="plus" size={17} />
        </button>
      </div>
    </aside>
  );
}

export function Discovery({
  variant,
  meetups,
  kind,
  navigate,
  joined,
}: DiscoveryProps) {
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("All Activities");
  const filtered = meetups.filter(
    (meetup) =>
      !meetup.cancelled &&
      (!kind || meetup.kind === kind) &&
      (activity === "All Activities" || meetup.activity === activity) &&
      `${meetup.title} ${meetup.place} ${meetup.interest}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const feature = meetups[0] ?? initialMeetups[0];
  const isDiscovery = !kind;
  const dates = filtered.map((meetup) => meetup.date).sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  let scheduleTitle = "Your schedule";
  if (firstDate && lastDate) {
    scheduleTitle = formatMeetupDate(lastDate, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (firstDate !== lastDate)
      scheduleTitle = `${formatMeetupDate(firstDate, { day: "numeric", month: "short" })} to ${scheduleTitle}`;
  }
  const title = kind
    ? `${kind}s`
    : variant === "fieldwork"
      ? scheduleTitle
      : variant === "studio"
        ? "Good company.\nShared Interests."
        : "A little time, well spent.";
  const filterBar = (
    <div className="mock-filters">
      <label className="mock-search">
        <Icon name="search" size={19} />
        <input
          type="search"
          aria-label="Search Meetups"
          placeholder="Find an Interest, Activity or Place"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className="mock-filter-select">
        <span className="mock-sr-only">Activity</span>
        <select
          value={activity}
          onChange={(event) => setActivity(event.target.value)}
        >
          {["All Activities", "Coffee", "Walk", "Game", "Learning session"].map(
            (name) => (
              <option key={name}>{name}</option>
            ),
          )}
        </select>
      </label>
    </div>
  );

  return (
    <>
      <PageHeading
        title={title}
        description={
          kind
            ? `Find your next ${kind.toLowerCase()} within Ministry A.`
            : "Meet someone new. Make time for what you enjoy."
        }
      >
        <button
          className="mock-button"
          onClick={() =>
            navigate("create", kind === "Event" ? "event" : undefined)
          }
        >
          <Icon name="plus" size={17} />
          {kind === "Event" ? "Propose an Event" : "Create a Meetup"}
        </button>
      </PageHeading>

      {variant === "atrium" && isDiscovery && (
        <div className="mock-atrium-feature">
          <article className="mock-feature">
            <button
              className="mock-feature-photo"
              onClick={() => navigate("detail", feature.id)}
              aria-label={`Explore ${feature.title}`}
            >
              <img
                src="/prototype-ui/coffee.webp"
                alt="Three cups of coffee held together over a café table"
                width="1400"
                height="933"
              />
            </button>
            <div className="mock-feature-copy">
              <span className="mock-feature-date">
                <Icon name="clock" size={16} />
                Today at {feature.time}
              </span>
              <h2>{feature.title}</h2>
              <p>A familiar ritual. A few new faces.</p>
              <div className="mock-feature-footer">
                <span>
                  <Avatar name="Priya Nair" /> Hosted by Priya
                </span>
                <button
                  className="mock-circle"
                  onClick={() => navigate("detail", feature.id)}
                  aria-label="View coffee Meetup"
                >
                  <Icon name="arrow" />
                </button>
              </div>
            </div>
          </article>
          <Agenda navigate={navigate} />
        </div>
      )}

      {variant === "studio" && isDiscovery && (
        <div className="mock-studio-intro">
          <div>
            <p>Your next Connection could start with a coffee.</p>
            <button
              className="mock-button"
              onClick={() => navigate("detail", feature.id)}
            >
              Find your next Meetup <Icon name="arrow" size={18} />
            </button>
            <div className="mock-studio-members">
              <div className="mock-avatar-stack">
                {members.slice(0, 3).map((member) => (
                  <Avatar
                    key={member.id}
                    name={member.name}
                    color={member.color}
                  />
                ))}
              </div>
              <span>
                Discover people across
                <br />
                your Organisation.
              </span>
            </div>
          </div>
          <img
            src="/prototype-ui/coffee.webp"
            alt="Coffee shared around a café table"
            width="1400"
            height="933"
          />
        </div>
      )}

      <div className={variant === "fieldwork" ? "mock-fieldwork-content" : ""}>
        <section className="mock-discovery-list">
          <SectionHeading
            title={
              isDiscovery
                ? variant === "fieldwork"
                  ? "This week, together"
                  : "Find your next Meetup"
                : `Upcoming ${kind}s`
            }
          >
            <span className="mock-muted">
              {filtered.length}{" "}
              {filtered.length === 1 ? "Suggestion" : "Suggestions"}
            </span>
          </SectionHeading>
          {filterBar}
          {filtered.length === 0 ? (
            <EmptyState title="No Meetups found">
              <p>Try another Activity or a shorter search.</p>
              <button
                className="mock-button secondary"
                onClick={() => {
                  setQuery("");
                  setActivity("All Activities");
                }}
              >
                Clear filters
              </button>
            </EmptyState>
          ) : variant === "fieldwork" ? (
            <div className="mock-schedule">
              {filtered.map((meetup) => (
                <article key={meetup.id}>
                  <div className="mock-schedule-time">
                    <strong>{meetup.time}</strong>
                    <span>{formatMeetupDate(meetup.date)}</span>
                  </div>
                  <img
                    src={`/prototype-ui/${meetup.photo}.webp`}
                    alt=""
                    width="130"
                    height="100"
                  />
                  <div className="mock-schedule-copy">
                    <span className="mock-muted">
                      {meetup.activity} · {meetup.duration}
                    </span>
                    <h3>
                      <button
                        className="mock-text-button"
                        onClick={() => navigate("detail", meetup.id)}
                      >
                        {meetup.title}
                      </button>
                    </h3>
                    <p className="mock-meta">
                      <Icon name="pin" size={15} />
                      {meetup.place}
                    </p>
                    <p className="mock-suggestion">{meetup.reason}</p>
                  </div>
                  <button
                    className="mock-circle"
                    aria-label={`View ${meetup.title}`}
                    onClick={() => navigate("detail", meetup.id)}
                  >
                    <Icon name="arrow" />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="mock-meetup-grid">
              {filtered.map((meetup) => (
                <MeetupCard
                  key={meetup.id}
                  meetup={meetup}
                  navigate={navigate}
                  joined={joined.includes(meetup.id)}
                />
              ))}
            </div>
          )}
        </section>
        {variant === "fieldwork" && <Agenda navigate={navigate} />}
      </div>
      {isDiscovery && (
        <section className="mock-discovery-members">
          <SectionHeading title="An Interest in common">
            <button
              className="mock-link-button"
              onClick={() => navigate("members")}
            >
              Explore Members <Icon name="arrow" size={17} />
            </button>
          </SectionHeading>
          <div>
            {members.slice(0, 3).map((member) => (
              <button
                key={member.id}
                onClick={() => navigate("member", member.id)}
              >
                <Avatar name={member.name} color={member.color} />
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    Shares {member.shares} · {member.department}
                  </small>
                </span>
                <Icon name="arrow" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function HostControls({
  meetup,
  onUpdate,
  notify,
}: {
  meetup: Meetup;
  onUpdate: (meetup: Meetup) => void;
  notify: Notify;
}) {
  if (meetup.cancelled) return null;
  return (
    <details className="mock-host-controls">
      <summary>You are the Host. Manage this Meetup</summary>
      <form
        className="mock-form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          onUpdate({
            ...meetup,
            time: String(values.get("time")),
            place: String(values.get("place")),
            capacity: Number(values.get("capacity")),
            description: String(values.get("description")),
          });
          notify("Sample Meetup details updated.");
        }}
      >
        <div className="mock-form-row">
          <label>
            Start time
            <input
              name="time"
              type="time"
              defaultValue={meetup.time}
              required
            />
          </label>
          <label>
            Capacity
            <input
              name="capacity"
              type="number"
              min={Math.max(2, meetup.participants)}
              max={30}
              defaultValue={meetup.capacity}
              required
            />
          </label>
        </div>
        <label>
          Place
          <input name="place" defaultValue={meetup.place} required />
        </label>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={meetup.description}
            required
          />
        </label>
        <div className="mock-form-actions">
          <button className="mock-button">Save changes</button>
          <button
            type="button"
            className="mock-button secondary"
            onClick={() => {
              onUpdate({ ...meetup, cancelled: true });
              notify("Sample Meetup cancelled. No notices were sent.");
            }}
          >
            Cancel Meetup
          </button>
        </div>
      </form>
    </details>
  );
}

export function MeetupDetails({
  meetup,
  joined,
  waitlisted,
  navigate,
  onJoin,
  onLeave,
  onUpdate,
  notify,
}: {
  meetup: Meetup;
  joined: boolean;
  waitlisted: boolean;
  navigate: Navigate;
  onJoin: () => void;
  onLeave: () => void;
  onUpdate: (meetup: Meetup) => void;
  notify: Notify;
}) {
  const full = meetup.participants >= meetup.capacity;
  const isHost = meetup.host === "Alex Morgan";
  return (
    <>
      <button
        className="mock-link-button mock-back"
        onClick={() => navigate(meetup.kind === "Event" ? "events" : "meetups")}
      >
        <Icon name="back" size={17} />
        Back to {meetup.kind}s
      </button>
      {isHost && (
        <HostControls meetup={meetup} onUpdate={onUpdate} notify={notify} />
      )}
      <div className="mock-detail-gallery">
        <img
          className="mock-detail-cover"
          src={`/prototype-ui/${meetup.photo}.webp`}
          alt={`Illustrative photograph for ${meetup.activity}`}
          width="1400"
          height="933"
        />
        <div className="mock-detail-side">
          <div>
            <Icon
              name={meetup.activity === "Coffee" ? "coffee" : "calendar"}
              size={32}
            />
            <strong>{formatMeetupDate(meetup.date, { day: "numeric" })}</strong>
            <span>
              {formatMeetupDate(meetup.date, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <p>
              {meetup.time} · {meetup.duration}
            </p>
          </div>
          <img
            src={`/prototype-ui/${meetup.photo === "coffee" ? "workshop" : "coffee"}.webp`}
            alt=""
            width="700"
            height="460"
          />
        </div>
      </div>
      <div className="mock-detail-layout">
        <section>
          <p className="mock-meta">
            <Icon name="pin" size={17} />
            {meetup.place}, {meetup.site}
          </p>
          <h1>{meetup.title}</h1>
          <div className="mock-detail-facts">
            <span>
              <Icon name="calendar" size={17} />
              {formatMeetupDate(meetup.date)}
            </span>
            <span>
              <Icon name="clock" size={17} />
              {meetup.time}
            </span>
            <span>
              <Icon name="people" size={17} />
              {meetup.participants} of {meetup.capacity} joined
            </span>
            <span>{meetup.kind}</span>
          </div>
          <h2>About this {meetup.kind}</h2>
          <p className="mock-prose">{meetup.description}</p>
          <h2>Relevant Interests</h2>
          <span className="mock-interest">{meetup.interest}</span>
          <div className="mock-host">
            <Avatar name={meetup.host} />
            <div>
              <small>Your Host</small>
              <strong>{meetup.host}</strong>
            </div>
            <button
              className="mock-link-button"
              onClick={() =>
                navigate(
                  "member",
                  members.find((member) => member.name === meetup.host)?.id,
                )
              }
            >
              View profile <Icon name="arrow" size={16} />
            </button>
          </div>
          {joined && (
            <>
              <h2>Participants</h2>
              <div className="mock-participants">
                {members
                  .slice(0, Math.min(meetup.participants - 1, 3))
                  .map((member) => (
                    <span key={member.id}>
                      <Avatar name={member.name} color={member.color} />
                      {member.name}
                    </span>
                  ))}
                <span>
                  <Avatar name="Alex Morgan" />
                  You
                </span>
              </div>
            </>
          )}
        </section>
        <aside className="mock-join-panel">
          <h2>
            {meetup.cancelled
              ? "This Meetup is cancelled."
              : isHost
                ? "You're hosting."
                : joined
                  ? "You're going."
                  : waitlisted
                    ? "You're on the waitlist."
                    : full
                      ? "A full table."
                      : "There's room for you."}
          </h2>
          <p>
            {meetup.cancelled
              ? "This sample Meetup no longer accepts Participants."
              : isHost
                ? "Manage the time, Place and capacity using Host controls above."
                : joined
                  ? "Your place is confirmed. See you there."
                  : waitlisted
                    ? "We will let you know when a place opens."
                    : full
                      ? "Join the waitlist for the next available place."
                      : `${meetup.capacity - meetup.participants} places available. Join the conversation.`}
          </p>
          <div className="mock-join-date">
            <Icon name="calendar" size={25} />
            <div>
              <strong>{formatMeetupDate(meetup.date)}</strong>
              <span>
                {meetup.time} · {meetup.duration}
              </span>
            </div>
          </div>
          {!isHost && !meetup.cancelled && (
            <button
              className={`mock-button ${joined || waitlisted ? "secondary" : ""}`}
              onClick={joined || waitlisted ? onLeave : onJoin}
            >
              {joined
                ? `Leave ${meetup.kind}`
                : waitlisted
                  ? "Leave waitlist"
                  : full
                    ? "Join waitlist"
                    : `Join ${meetup.kind}`}
              <Icon name={joined || waitlisted ? "check" : "arrow"} size={18} />
            </button>
          )}
          <small>
            {meetup.audience === "Invite-only"
              ? "Invite-only Meetup"
              : meetup.audience === "My Site"
                ? `Open to Members at ${meetup.site}`
                : "Open to Members in Ministry A"}
          </small>
          <hr />
          <p className="mock-suggestion">
            <Icon name="link" size={17} />
            {meetup.reason}
          </p>
          <button
            className="mock-link-button"
            onClick={() =>
              notify("Sample Invite prepared. No Invite has been sent.")
            }
          >
            Invite a Member <Icon name="plus" size={15} />
          </button>
        </aside>
      </div>
    </>
  );
}
