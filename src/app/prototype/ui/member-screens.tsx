import { useState } from "react";
import {
  Avatar,
  DataTable,
  EmptyState,
  Icon,
  PageHeading,
  SectionHeading,
  Status,
} from "./components";
import {
  members,
  type Meetup,
  type Navigate,
  type Notify,
  type Screen,
} from "./data";

export function useMemberDemo() {
  const [profile, setProfile] = useState({
    name: "Alex Morgan",
    department: "Digital services",
    site: "Central Site",
    bio: members[5].bio,
  });
  const [interests, setInterests] = useState([
    { name: "Coffee", stance: "Shares" },
    { name: "Walking", stance: "Shares" },
    { name: "Data visualisation", stance: "Seeks" },
  ]);
  const [availability, setAvailability] = useState([
    { activity: "Lunch", time: "12:00 to 13:00", place: "Central Site" },
  ]);
  const [readNotices, setReadNotices] = useState(false);
  const [channels, setChannels] = useState({ telegram: true, email: false });
  const [conversation, setConversation] = useState<
    { question: string; answer: string }[]
  >([]);
  return {
    profile,
    setProfile,
    interests,
    setInterests,
    availability,
    setAvailability,
    readNotices,
    setReadNotices,
    channels,
    setChannels,
    conversation,
    setConversation,
  };
}

type MemberDemo = ReturnType<typeof useMemberDemo>;

export function MemberScreens({
  screen,
  id,
  navigate,
  notify,
  demo,
}: {
  screen: Screen;
  id: string | null;
  navigate: Navigate;
  notify: Notify;
  demo: MemberDemo;
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [draftQuestion, setDraftQuestion] = useState("");

  if (screen === "members") {
    const filtered = members.filter(
      (member) =>
        `${member.name} ${member.shares} ${member.seeks}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (department === "All Departments" || member.department === department),
    );
    return (
      <>
        <PageHeading
          title="People worth knowing."
          description="A shared Interest is a good place to start."
        />
        <div className="mock-filters">
          <label className="mock-search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search Members or Interests"
              aria-label="Search Members"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option>All Departments</option>
            {[...new Set(members.map((member) => member.department))].map(
              (name) => (
                <option key={name}>{name}</option>
              ),
            )}
          </select>
        </div>
        <div className="mock-member-grid">
          {filtered.map((member) => (
            <article key={member.id}>
              <div className="mock-member-top">
                <Avatar name={member.name} color={member.color} large />
                <span>{member.site}</span>
              </div>
              <h2>
                <button
                  className="mock-text-button"
                  onClick={() => navigate("member", member.id)}
                >
                  {member.name}
                </button>
              </h2>
              <p className="mock-muted">{member.department}</p>
              <p>{member.bio}</p>
              <div className="mock-stances">
                <span>
                  <small>Shares</small>
                  {member.shares}
                </span>
                <span>
                  <small>Seeks</small>
                  {member.seeks}
                </span>
              </div>
              <button
                className="mock-link-button"
                onClick={() => navigate("member", member.id)}
              >
                View Member <Icon name="arrow" size={17} />
              </button>
            </article>
          ))}
        </div>
        {filtered.length === 0 && (
          <EmptyState title="No Members found">
            <p>Try another Interest or Department.</p>
            <button
              className="mock-button secondary"
              onClick={() => {
                setQuery("");
                setDepartment("All Departments");
              }}
            >
              Clear filters
            </button>
          </EmptyState>
        )}
      </>
    );
  }

  if (screen === "member") {
    const member = members.find((entry) => entry.id === id) ?? members[0];
    return (
      <>
        <button
          className="mock-link-button mock-back"
          onClick={() => navigate("members")}
        >
          <Icon name="back" size={17} />
          All Members
        </button>
        <div className="mock-profile-banner">
          <Avatar name={member.name} color={member.color} large />
          <div>
            <h1>{member.name}</h1>
            <p>
              {member.department} · {member.site}
            </p>
          </div>
        </div>
        <div className="mock-two-column">
          <section>
            <h2>About {member.name.split(" ")[0]}</h2>
            <p className="mock-prose">{member.bio}</p>
            <h2>Interests</h2>
            <div className="mock-stance-large">
              <div>
                <span>Shares</span>
                <h3>{member.shares}</h3>
              </div>
              <div>
                <span>Seeks</span>
                <h3>{member.seeks}</h3>
              </div>
            </div>
          </section>
          <aside className="mock-side-panel">
            <h2>Start with a Meetup.</h2>
            <p>Make time for an Interest you have in common.</p>
            <button className="mock-button" onClick={() => navigate("create")}>
              Create a Meetup <Icon name="plus" size={17} />
            </button>
            <button
              className="mock-link-button"
              onClick={() =>
                notify("Sample Flag recorded for Organisation Admin review.")
              }
            >
              Flag this Member
            </button>
          </aside>
        </div>
      </>
    );
  }

  if (screen === "profile")
    return (
      <>
        <PageHeading
          title="Your space"
          description="A little about you, and what brings you here."
        />
        <div className="mock-profile-layout">
          <aside className="mock-profile-summary">
            <Avatar name={demo.profile.name} large />
            <h2>{demo.profile.name}</h2>
            <p>{demo.profile.department}</p>
            <p className="mock-meta">
              <Icon name="pin" size={16} />
              {demo.profile.site}
            </p>
            <hr />
            <button
              className="mock-link-button"
              onClick={() => navigate("interests")}
            >
              Your Interests <Icon name="arrow" size={16} />
            </button>
            <button
              className="mock-link-button"
              onClick={() => navigate("connections")}
            >
              Your Connections <Icon name="arrow" size={16} />
            </button>
            <button
              className="mock-link-button"
              onClick={() => navigate("notifications")}
            >
              Notification settings <Icon name="arrow" size={16} />
            </button>
          </aside>
          <form
            className="mock-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              demo.setProfile({
                name: String(values.get("name")),
                department: String(values.get("department")),
                site: String(values.get("site")),
                bio: String(values.get("bio")),
              });
              notify("Your sample profile has been saved.");
            }}
          >
            <h2>Profile details</h2>
            <label>
              Your name
              <input name="name" defaultValue={demo.profile.name} required />
            </label>
            <div className="mock-form-row">
              <label>
                Department
                <select
                  name="department"
                  defaultValue={demo.profile.department}
                >
                  <option>Digital services</option>
                  <option>Policy</option>
                  <option>Operations</option>
                  <option>Finance</option>
                </select>
              </label>
              <label>
                Site
                <select name="site" defaultValue={demo.profile.site}>
                  <option>Central Site</option>
                  <option>North Site</option>
                </select>
              </label>
            </div>
            <label>
              About you
              <textarea name="bio" rows={4} defaultValue={demo.profile.bio} />
            </label>
            <p className="mock-muted">
              Members in your Organisation can see your profile and Interests.
            </p>
            <button className="mock-button" type="submit">
              Save profile <Icon name="check" size={17} />
            </button>
          </form>
        </div>
      </>
    );

  if (screen === "interests")
    return (
      <>
        <PageHeading
          title="What are you into?"
          description="Share what you enjoy. Seek something you would like to learn."
        />
        <div className="mock-two-column">
          <section>
            <SectionHeading title="Your Interests">
              <span>{demo.interests.length} Interests</span>
            </SectionHeading>
            <div className="mock-interest-rows">
              {demo.interests.map((interest) => (
                <div key={interest.name}>
                  <strong>{interest.name}</strong>
                  <select
                    aria-label={`Stance for ${interest.name}`}
                    value={interest.stance}
                    onChange={(event) =>
                      demo.setInterests(
                        demo.interests.map((item) =>
                          item.name === interest.name
                            ? { ...item, stance: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option>Shares</option>
                    <option>Seeks</option>
                  </select>
                  <button
                    className="mock-icon-button"
                    aria-label={`Remove ${interest.name}`}
                    onClick={() =>
                      demo.setInterests(
                        demo.interests.filter(
                          (item) => item.name !== interest.name,
                        ),
                      )
                    }
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              ))}
            </div>
            {demo.interests.length === 0 && (
              <p>Add an Interest to find your first Suggestion.</p>
            )}
          </section>
          <form
            className="mock-form mock-side-panel"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const name = String(values.get("interest")).trim();
              if (!name) return;
              if (
                demo.interests.some(
                  (item) => item.name.toLowerCase() === name.toLowerCase(),
                )
              ) {
                notify("You already have that Interest.");
                return;
              }
              demo.setInterests([
                ...demo.interests,
                { name, stance: String(values.get("stance")) },
              ]);
              event.currentTarget.reset();
              notify("Interest added to your sample profile.");
            }}
          >
            <h2>Add an Interest</h2>
            <label>
              Interest
              <input
                name="interest"
                placeholder="Try photography, SQL, climbing..."
                required
              />
            </label>
            <label>
              Your Stance
              <select name="stance">
                <option>Shares</option>
                <option>Seeks</option>
              </select>
            </label>
            <button className="mock-button">
              Add Interest <Icon name="plus" size={17} />
            </button>
            <small>
              Shares means you enjoy it or can help others. Seeks means you
              would like to learn.
            </small>
          </form>
        </div>
      </>
    );

  if (screen === "availability")
    return (
      <>
        <PageHeading
          title="A little room in your day."
          description="Let Members know when you are free for an Activity."
        />
        <div className="mock-two-column">
          <section>
            <SectionHeading title="Your Availability today" />
            {demo.availability.map((entry, index) => (
              <div
                className="mock-availability-row"
                key={`${entry.activity}-${index}`}
              >
                <Icon name="clock" size={24} />
                <div>
                  <h3>{entry.activity}</h3>
                  <p>
                    {entry.time} · {entry.place}
                  </p>
                </div>
                <button
                  className="mock-icon-button"
                  aria-label={`Remove ${entry.activity} Availability`}
                  onClick={() =>
                    demo.setAvailability(
                      demo.availability.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
            {demo.availability.length === 0 && (
              <p>No Availability yet. Add a time that works for you.</p>
            )}
            <h2>Free around lunchtime</h2>
            {members.slice(0, 3).map((member) => (
              <div className="mock-person-row" key={member.id}>
                <Avatar name={member.name} color={member.color} />
                <div>
                  <strong>{member.name}</strong>
                  <p>{member.shares} · 12:00 to 13:00</p>
                </div>
                <button
                  className="mock-link-button"
                  onClick={() => navigate("member", member.id)}
                >
                  View <Icon name="arrow" size={16} />
                </button>
              </div>
            ))}
          </section>
          <form
            className="mock-form mock-side-panel"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const start = String(values.get("start"));
              const end = String(values.get("end"));
              if (end <= start) {
                notify("Choose an end time after the start time.");
                return;
              }
              demo.setAvailability([
                ...demo.availability,
                {
                  activity: String(values.get("activity")),
                  time: `${start} to ${end}`,
                  place: String(values.get("place")),
                },
              ]);
              notify("Your sample Availability is visible.");
            }}
          >
            <h2>Set Availability</h2>
            <label>
              Activity
              <select name="activity">
                <option>Coffee</option>
                <option>Lunch</option>
                <option>Walk</option>
                <option>Learning session</option>
              </select>
            </label>
            <div className="mock-form-row">
              <label>
                From
                <input type="time" name="start" defaultValue="12:00" required />
              </label>
              <label>
                Until
                <input type="time" name="end" defaultValue="13:00" required />
              </label>
            </div>
            <label>
              Place
              <select name="place">
                <option>Central Site</option>
                <option>North Site</option>
                <option>Virtual</option>
              </select>
            </label>
            <button className="mock-button">
              Share Availability <Icon name="arrow" size={17} />
            </button>
          </form>
        </div>
      </>
    );

  if (screen === "connections")
    return (
      <>
        <PageHeading
          title="Familiar faces."
          description="Your Connections come from Meetups and Events you attended."
        />
        <DataTable
          caption="Your Connections and Attendance"
          columns={["Member", "Met through", "Date", "Attendance"]}
          rows={members.slice(0, 3).map((member, index) => [
            <button
              key="person"
              className="mock-table-person"
              onClick={() => navigate("member", member.id)}
            >
              <Avatar name={member.name} color={member.color} />
              <span>
                {member.name}
                <small>{member.department}</small>
              </span>
            </button>,
            [
              "Coffee in the courtyard",
              "A lunchtime walk",
              "Making sense of data",
            ][index],
            ["18 Sep 2026", "15 Sep 2026", "10 Sep 2026"][index],
            <Status key="status">Attended</Status>,
          ])}
        />
      </>
    );

  if (screen === "inbox")
    return (
      <>
        <PageHeading
          title="Your inbox"
          description="Invites, updates and the things you need to know."
        >
          <button
            className="mock-button secondary"
            onClick={() => {
              demo.setReadNotices(true);
              notify("All sample notices marked as read.");
            }}
          >
            Mark all as read <Icon name="check" size={17} />
          </button>
        </PageHeading>
        <div className="mock-inbox">
          {[
            {
              title: "Priya invited you for coffee",
              text: "A coffee, a conversation · Today at 10:30",
              icon: "coffee" as const,
              id: "coffee",
              time: "15 minutes ago",
            },
            {
              title: "Your Event is coming up",
              text: "Make your data tell a story · Thursday at 14:00",
              icon: "calendar" as const,
              id: "learning",
              time: "1 hour ago",
            },
            {
              title: "You and Daniel are free for lunch",
              text: "Your Availability overlaps today, 12:00 to 13:00.",
              icon: "clock" as const,
              id: "walk",
              time: "2 hours ago",
            },
          ].map((notice) => (
            <article
              className={demo.readNotices ? "read" : "unread"}
              key={notice.id}
            >
              <span className="mock-notice-icon">
                <Icon name={notice.icon} size={24} />
              </span>
              <div>
                <h2>{notice.title}</h2>
                <p>{notice.text}</p>
                <small>{notice.time}</small>
              </div>
              <button
                className="mock-button secondary"
                onClick={() => navigate("detail", notice.id)}
              >
                View <Icon name="arrow" size={16} />
              </button>
            </article>
          ))}
        </div>
        <button
          className="mock-link-button"
          onClick={() => navigate("notifications")}
        >
          Manage notifications <Icon name="settings" size={17} />
        </button>
      </>
    );

  if (screen === "notifications")
    return (
      <>
        <PageHeading
          title="Stay in the loop."
          description="Choose where Meetup notices reach you."
        />
        <form
          className="mock-form mock-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            notify("Sample notification preferences saved.");
          }}
        >
          <h2>Delivery channels</h2>
          <label className="mock-toggle-row">
            <span>
              <strong>Telegram</strong>
              <small>Immediate notices for your enabled updates.</small>
            </span>
            <input
              type="checkbox"
              checked={demo.channels.telegram}
              onChange={(event) =>
                demo.setChannels({
                  ...demo.channels,
                  telegram: event.target.checked,
                })
              }
            />
          </label>
          <label className="mock-toggle-row">
            <span>
              <strong>Email</strong>
              <small>
                Urgent updates immediately. Other updates in a daily digest.
              </small>
            </span>
            <input
              type="checkbox"
              checked={demo.channels.email}
              onChange={(event) =>
                demo.setChannels({
                  ...demo.channels,
                  email: event.target.checked,
                })
              }
            />
          </label>
          <h2>Notice preferences</h2>
          {[
            "Invites",
            "Meetup changes and cancellations",
            "Availability overlaps",
            "RSVP prompts",
            "Attendance prompts",
          ].map((label) => (
            <label className="mock-toggle-row" key={label}>
              {label}
              <input type="checkbox" defaultChecked />
            </label>
          ))}
          <p className="mock-muted">
            Every notice is always available in your inbox.
          </p>
          <button className="mock-button">
            Save preferences <Icon name="check" size={17} />
          </button>
        </form>
      </>
    );

  if (screen === "scout") {
    const ask = (question: string) => {
      if (!question.trim()) return;
      const answer = /coffee/i.test(question)
        ? "Priya Shares coffee and is hosting A coffee, a conversation today at 10:30 in the courtyard café. There are two places left in this sample Meetup."
        : /data|learn/i.test(question)
          ? "Sofia Shares data visualisation. Her Event, Make your data tell a story, is on Thursday at 14:00 at North Site."
          : "There are Meetups for coffee, walking and board games this week. The lunchtime walk overlaps your sample Availability. You can view its details below.";
      demo.setConversation([...demo.conversation, { question, answer }]);
      setDraftQuestion("");
    };
    return (
      <div className="mock-scout">
        <PageHeading
          title="Ask Scout."
          description="Find a Meetup, explore Interests, or see who is free."
        />
        <div className="mock-scout-intro">
          <Icon name="chat" size={36} />
          <h2>Who will you meet next?</h2>
          <p>
            Scout can find information you can already see. It cannot join a
            Meetup or send an Invite for you.
          </p>
          <div>
            {["Who is free for coffee?", "Where can I learn about data?"].map(
              (question) => (
                <button
                  key={question}
                  className="mock-button secondary"
                  onClick={() => ask(question)}
                >
                  {question}
                  <Icon name="arrow" size={16} />
                </button>
              ),
            )}
          </div>
        </div>
        <div className="mock-conversation" aria-live="polite">
          {demo.conversation.map((entry, index) => (
            <div key={index}>
              <p className="mock-question">{entry.question}</p>
              <p>{entry.answer}</p>
              <button
                className="mock-link-button"
                onClick={() => navigate("meetups")}
              >
                Explore Meetups <Icon name="arrow" size={16} />
              </button>
            </div>
          ))}
        </div>
        <form
          className="mock-scout-form"
          onSubmit={(event) => {
            event.preventDefault();
            ask(draftQuestion);
          }}
        >
          <input
            aria-label="Ask Scout"
            placeholder="Ask about your Organisation..."
            value={draftQuestion}
            onChange={(event) => setDraftQuestion(event.target.value)}
            required
          />
          <button className="mock-button" aria-label="Send question">
            <Icon name="arrow" />
          </button>
        </form>
        <small className="mock-muted">
          Design preview. Scout replies are scripted sample answers.
        </small>
      </div>
    );
  }
  return null;
}

export function CreateMeetup({
  event: isEvent,
  onCreate,
  navigate,
}: {
  event: boolean;
  onCreate: (meetup: Meetup) => void;
  navigate: Navigate;
}) {
  const [virtual, setVirtual] = useState(false);
  return (
    <>
      <PageHeading
        title={isEvent ? "Bring an Event to life." : "Make a little time."}
        description={
          isEvent
            ? "Propose an Event for your Organisation Admin to review."
            : "An Activity, a Place, and a few people. Start there."
        }
      />
      <div className="mock-create-layout">
        <form
          className="mock-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const date = String(values.get("date"));
            onCreate({
              id: `sample-${Date.now()}`,
              title: String(values.get("title")),
              activity: String(values.get("activity")),
              kind: isEvent ? "Event" : "Meetup",
              date,
              time: String(values.get("time")),
              duration: `${values.get("duration")} minutes`,
              place: virtual ? "Virtual" : String(values.get("place")),
              site: virtual ? "Online" : String(values.get("site")),
              host: "Alex Morgan",
              participants: 1,
              capacity: Number(values.get("capacity")),
              photo: "coffee",
              interest: String(values.get("activity")),
              reason: "Hosted by you.",
              audience: String(values.get("audience")),
              url: virtual ? String(values.get("url")) : undefined,
              description: String(values.get("description")),
            });
          }}
        >
          <h2>The essentials</h2>
          <label>
            {isEvent ? "Event" : "Meetup"} name
            <input
              name="title"
              placeholder="What would you like to do?"
              required
              maxLength={100}
            />
          </label>
          <label>
            Activity
            <select name="activity">
              <option>Coffee</option>
              <option>Lunch</option>
              <option>Walk</option>
              <option>Game</option>
              <option>Learning session</option>
            </select>
          </label>
          <div className="mock-form-row">
            <label>
              Date
              <input
                type="date"
                name="date"
                defaultValue="2026-09-25"
                required
              />
            </label>
            <label>
              Start time
              <input type="time" name="time" defaultValue="12:00" required />
            </label>
          </div>
          <div className="mock-form-row">
            <label>
              Duration
              <select name="duration">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">90 minutes</option>
              </select>
            </label>
            <label>
              Capacity, including you
              <input
                type="number"
                name="capacity"
                defaultValue={6}
                min={isEvent ? 1 : 2}
                max={isEvent ? undefined : 30}
                required
              />
            </label>
          </div>
          <h2>A Place to meet</h2>
          <label className="mock-checkbox">
            <input
              type="checkbox"
              checked={virtual}
              onChange={(event) => setVirtual(event.target.checked)}
            />
            Meet virtually
          </label>
          {virtual ? (
            <label>
              Virtual Place URL
              <input name="url" type="url" placeholder="https://" required />
            </label>
          ) : (
            <div className="mock-form-row">
              <label>
                Site
                <select name="site">
                  <option>Central Site</option>
                  <option>North Site</option>
                </select>
              </label>
              <label>
                Place
                <input
                  name="place"
                  placeholder="e.g. The courtyard café"
                  required
                />
              </label>
            </div>
          )}
          <label>
            Audience
            <select name="audience">
              <option>My Site</option>
              <option>My Organisation</option>
              <option>Invite-only</option>
            </select>
          </label>
          <label>
            About this {isEvent ? "Event" : "Meetup"}
            <textarea
              name="description"
              rows={4}
              placeholder="Let people know what to expect."
              required
            />
          </label>
          <div className="mock-form-actions">
            <button className="mock-button">
              {isEvent ? "Submit proposal" : "Create Meetup"}
              <Icon name="arrow" size={17} />
            </button>
            <button
              type="button"
              className="mock-button secondary"
              onClick={() => navigate(isEvent ? "events" : "meetups")}
            >
              Cancel
            </button>
          </div>
        </form>
        <aside>
          <img
            src="/prototype-ui/coffee.webp"
            alt="Coffee shared with a few new faces"
            width="700"
            height="467"
          />
          <h2>
            Small plans.
            <br />
            New Connections.
          </h2>
          <p>
            You do not need a big occasion. Make time for something you enjoy,
            and invite others along.
          </p>
          <p className="mock-muted">
            This is a design preview. Your sample{" "}
            {isEvent
              ? "proposal stays in this browser"
              : "Meetup is visible only in this browser"}
            .
          </p>
        </aside>
      </div>
    </>
  );
}
