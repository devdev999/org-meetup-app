import Link from "next/link";
import { requireMemberPastWelcome } from "../web/session";
import { MeetupTime } from "./meetups/meetup-time";
import { OccurrenceCard, occurrencePath } from "./_components/occurrence-card";
import {
  activityPhoto,
  Avatar,
  EmptyState,
  Icon,
  PageHeading,
} from "./_components/ui";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    activity?: string | string[];
  }>;
}) {
  const { member } = await requireMemberPastWelcome();
  const [suggestions, events, meetups, joinedEvents, params] =
    await Promise.all([
      member.meetupSuggestions(),
      member.eventSuggestions(),
      member.listMeetups(),
      member.listEvents(),
      searchParams,
    ]);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const activity = typeof params.activity === "string" ? params.activity : "";
  const query = search.toLowerCase();
  const filtered = suggestions.filter(
    ({ meetup }) =>
      (!activity || meetup.activity.name === activity) &&
      `${meetup.activity.name} ${meetup.description} ${meetup.place.kind === "physical" ? meetup.place.spot : "Virtual"}`
        .toLowerCase()
        .includes(query),
  );
  const feature = suggestions[0]?.meetup;
  const agenda = [...meetups, ...joinedEvents]
    .filter(
      (meetup) =>
        meetup.status === "scheduled" &&
        (meetup.membership === "host" || meetup.membership === "participant"),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3);

  return (
    <main className="discovery-page">
      <PageHeading
        title="A little time, well spent."
        description="Meet someone new. Make time for what you enjoy."
      >
        <Link className="button" href="/meetups/new">
          <Icon name="plus" size={17} />
          Create a Meetup
        </Link>
      </PageHeading>
      <div className="discovery-feature">
        <article className="featured-meetup">
          <Link
            href={feature ? occurrencePath(feature) : "/meetups/new"}
            className="feature-photo"
            aria-label={
              feature
                ? `Explore ${feature.activity.name}`
                : "Create your first Meetup"
            }
          >
            <img
              src={activityPhoto(feature?.activity.name ?? "coffee")}
              alt="Illustrative Activity photograph"
              width="1400"
              height="933"
              fetchPriority="high"
            />
          </Link>
          <div className="feature-copy">
            {feature ? (
              <>
                <p className="muted feature-time">
                  <Icon name="clock" size={16} />
                  <MeetupTime value={feature.startsAt.toISOString()} />
                </p>
                <h2>{feature.activity.name}</h2>
                <p className="feature-description">
                  {feature.description ||
                    "Make a little time for people in your Organisation."}
                </p>
                <div className="feature-foot">
                  <span>
                    <Avatar name={feature.host.name} />
                    Hosted by {feature.host.name}
                  </span>
                  <Link
                    className="circle-link"
                    href={occurrencePath(feature)}
                    aria-label="Open featured Meetup"
                  >
                    <Icon name="arrow" />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2>Good company starts somewhere.</h2>
                <p>
                  Choose an Activity, pick a Place, and make the first Meetup.
                </p>
                <Link className="text-link" href="/meetups/new">
                  Start a Meetup <Icon name="arrow" size={18} />
                </Link>
              </>
            )}
          </div>
        </article>
        <aside className="agenda">
          <div className="section-heading">
            <h2>Your next plans</h2>
            <Icon name="calendar" />
          </div>
          {agenda.length ? (
            <ul>
              {agenda.map((meetup) => (
                <li key={meetup.id}>
                  <p className="muted">
                    <MeetupTime value={meetup.startsAt.toISOString()} />
                  </p>
                  <Link
                    href={occurrencePath(meetup)}
                    aria-label={`Your plan: ${meetup.activity.name}`}
                  >
                    {meetup.activity.name}
                  </Link>
                  <small>
                    {meetup.place.kind === "physical"
                      ? (meetup.place.siteName ?? "Site")
                      : "Virtual"}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Join a Meetup or Event and your plans will appear here.
            </p>
          )}
          <Link className="text-link" href="/meetups">
            See all Meetups <Icon name="arrow" size={17} />
          </Link>
          <div className="availability-note">
            <Icon name="coffee" size={28} />
            <h3>A little time to spare?</h3>
            <p>Share your Availability and find someone to spend it with.</p>
            <Link className="button secondary" href="/availability">
              Set Availability <Icon name="plus" size={17} />
            </Link>
          </div>
        </aside>
      </div>
      <section>
        <div className="section-heading">
          <h2>Suggested Meetups</h2>
          <span className="muted">
            {filtered.length}{" "}
            {filtered.length === 1 ? "Suggestion" : "Suggestions"}
          </span>
        </div>
        <p className="muted">
          Open Meetups in your scope over the next fourteen days.
        </p>
        <form className="browse-filters" action="/">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Search Meetups</span>
            <input
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Find an Activity or Place"
            />
          </label>
          <label>
            <span className="sr-only">Activity</span>
            <select name="activity" defaultValue={activity}>
              <option value="">All Activities</option>
              {[
                ...new Set(
                  suggestions.map(({ meetup }) => meetup.activity.name),
                ),
              ].map((activity) => (
                <option key={activity}>{activity}</option>
              ))}
            </select>
          </label>
          <button type="submit">Search</button>
        </form>
        {filtered.length ? (
          <ul className="occurrence-grid">
            {filtered.map(({ meetup, reasons }) => (
              <OccurrenceCard
                key={meetup.id}
                meetup={meetup}
                reasons={reasons}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={
              query || activity
                ? "No Meetups match these filters."
                : "No Meetups to suggest yet."
            }
          >
            <p>
              {query || activity
                ? "Try another Activity or clear your search."
                : "Declare your Interests to help find company, or create a Meetup of your own."}
            </p>
            <Link
              className="text-link"
              href={query || activity ? "/" : "/interests"}
            >
              {query || activity ? "Clear filters" : "Manage your Interests"}
              <Icon name="arrow" size={17} />
            </Link>
          </EmptyState>
        )}
      </section>
      <section>
        <div className="section-heading">
          <h2>Suggested Events</h2>
          <Link className="text-link" href="/events/new">
            Propose an Event <Icon name="arrow" size={17} />
          </Link>
        </div>
        <p className="muted">
          Open Events in your scope over the next fourteen days.
        </p>
        {events.length ? (
          <ul className="occurrence-grid">
            {events.map(({ event, reasons }) => (
              <OccurrenceCard key={event.id} meetup={event} reasons={reasons} />
            ))}
          </ul>
        ) : (
          <p className="muted">No Events to suggest yet.</p>
        )}
      </section>
      <div className="discovery-close">
        <div>
          <h2>An Interest in common</h2>
          <p className="muted">
            Find Members who Share what you enjoy or Seek what you know.
          </p>
        </div>
        <Link className="text-link" href="/members">
          Explore Members <Icon name="arrow" size={18} />
        </Link>
      </div>
      <p className="image-disclosure">
        Photographs illustrate Activities and do not depict actual Meetups or
        Sites.
      </p>
    </main>
  );
}
