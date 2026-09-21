"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminScreens, useAdminDemo } from "./admin-screens";
import { Avatar, Icon, type IconName } from "./components";
import { Discovery, MeetupDetails } from "./discovery";
import {
  initialMeetups,
  screens,
  variantDescriptions,
  variantNames,
  variants,
  type Meetup,
  type Screen,
  type Variant,
} from "./data";
import { CreateMeetup, MemberScreens, useMemberDemo } from "./member-screens";

const navigation: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "discover", label: "Discover", icon: "home" },
  { screen: "meetups", label: "Meetups", icon: "calendar" },
  { screen: "events", label: "Events", icon: "grid" },
  { screen: "members", label: "Members", icon: "people" },
  { screen: "profile", label: "Your space", icon: "leaf" },
];

const secondaryNavigation: { screen: Screen; label: string; icon: IconName }[] =
  [
    { screen: "availability", label: "Availability", icon: "clock" },
    { screen: "connections", label: "Connections", icon: "link" },
    { screen: "scout", label: "Scout", icon: "chat" },
    { screen: "admin", label: "Administration", icon: "shield" },
  ];

const screenNames: Record<Screen, string> = {
  discover: "Discovery",
  meetups: "Meetups",
  events: "Events",
  detail: "Meetup details",
  create: "Create a Meetup",
  members: "Member directory",
  member: "Member profile",
  profile: "Your profile",
  interests: "Your Interests",
  availability: "Availability",
  connections: "Connections & Attendance",
  inbox: "Inbox",
  notifications: "Notification settings",
  scout: "Scout",
  admin: "Organisation Admin",
  platform: "Platform Admin",
};

function adjacentVariant(variant: Variant, offset: number): Variant {
  return (
    variants[
      (variants.indexOf(variant) + offset + variants.length) % variants.length
    ] ?? variants[0]
  );
}

export function UiPrototype() {
  const router = useRouter();
  const params = useSearchParams();
  const variant: Variant =
    variants.find((value) => value === params.get("variant")) ?? "atrium";
  const screen: Screen =
    screens.find((value) => value === params.get("screen")) ?? "discover";
  const id = params.get("id");
  const [meetups, setMeetups] = useState<Meetup[]>(initialMeetups);
  const [joined, setJoined] = useState(["learning"]);
  const [waitlisted, setWaitlisted] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const memberDemo = useMemberDemo();
  const adminDemo = useAdminDemo();
  const mainRef = useRef<HTMLElement>(null);
  const selectedMeetup =
    meetups.find((meetup) => meetup.id === id) ??
    meetups[0] ??
    initialMeetups[0];
  const personalScreens = [
    "profile",
    "interests",
    "availability",
    "connections",
    "notifications",
  ];
  const isAdministration = screen === "admin" || screen === "platform";

  function navigate(nextScreen: Screen, nextId?: string) {
    const next = new URLSearchParams(params);
    next.set("variant", variant);
    next.set("screen", nextScreen);
    if (nextId) next.set("id", nextId);
    else next.delete("id");
    router.push(`/prototype/ui?${next.toString()}`, { scroll: false });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function selectVariant(nextVariant: Variant) {
    const next = new URLSearchParams(params);
    next.set("variant", nextVariant);
    router.replace(`/prototype/ui?${next.toString()}`, { scroll: false });
  }

  function cycleVariant(offset: number) {
    selectVariant(adjacentVariant(variant, offset));
  }

  useEffect(() => {
    setComparisonExpanded(window.matchMedia("(min-width: 701px)").matches);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest(
            "input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='slider'], .mock-table-scroll",
          ))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = new URLSearchParams(window.location.search);
        next.set(
          "variant",
          adjacentVariant(variant, event.key === "ArrowRight" ? 1 : -1),
        );
        router.replace(`/prototype/ui?${next.toString()}`, { scroll: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, router]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [screen, id]);

  function joinMeetup() {
    if (selectedMeetup.participants >= selectedMeetup.capacity) {
      setWaitlisted([...waitlisted, selectedMeetup.id]);
      setMessage("You joined the sample waitlist. No real RSVP was sent.");
    } else {
      setJoined([...joined, selectedMeetup.id]);
      setMeetups(
        meetups.map((meetup) =>
          meetup.id === selectedMeetup.id
            ? { ...meetup, participants: meetup.participants + 1 }
            : meetup,
        ),
      );
      setMessage("You're going. Your sample place is confirmed.");
    }
  }

  function leaveMeetup() {
    if (joined.includes(selectedMeetup.id))
      setMeetups(
        meetups.map((meetup) =>
          meetup.id === selectedMeetup.id
            ? { ...meetup, participants: meetup.participants - 1 }
            : meetup,
        ),
      );
    setJoined(joined.filter((meetupId) => meetupId !== selectedMeetup.id));
    setWaitlisted(
      waitlisted.filter((meetupId) => meetupId !== selectedMeetup.id),
    );
    setMessage("You left this sample Meetup.");
  }

  function createMeetup(meetup: Meetup) {
    if (meetup.kind === "Event") {
      adminDemo.setProposals([
        ...adminDemo.proposals,
        {
          id: meetup.id,
          title: meetup.title,
          host: "Alex Morgan",
          status: "Pending",
        },
      ]);
      navigate("events");
      setMessage(
        "Sample proposal submitted. View it under Administration, Events.",
      );
    } else {
      setMeetups([...meetups, meetup]);
      setJoined([...joined, meetup.id]);
      navigate("detail", meetup.id);
      setMessage("Your sample Meetup is ready.");
    }
  }

  const navItems = (compact: boolean) => (
    <>
      {navigation.map((item) => (
        <button
          key={item.screen}
          className="mock-nav-item"
          aria-current={
            screen === item.screen ||
            (item.screen === "profile" && personalScreens.includes(screen))
              ? "page"
              : undefined
          }
          onClick={() => navigate(item.screen)}
          title={compact ? item.label : undefined}
        >
          {(variant !== "atrium" || compact) && (
            <Icon name={item.icon} size={21} />
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </>
  );

  return (
    <div className={`ui-prototype ${variant}`}>
      <a className="mock-skip" href="#prototype-main">
        Skip to content
      </a>
      <div className="mock-app">
        {variant !== "atrium" && (
          <aside className="mock-rail">
            <button
              className="mock-brand"
              onClick={() => navigate("discover")}
              aria-label="Organisation Meetups home"
            >
              <span className="mock-brand-mark">
                <i />
                <i />
                <i />
              </span>
              <span>
                Organisation
                <br />
                <strong>Meetups</strong>
              </span>
            </button>
            {variant === "studio" && (
              <p className="mock-rail-organisation">
                Ministry A <Icon name="shield" size={15} />
              </p>
            )}
            <nav aria-label="Member navigation">
              {navItems(variant === "fieldwork")}
            </nav>
            <nav className="mock-rail-secondary" aria-label="More navigation">
              {secondaryNavigation.map((item) => (
                <button
                  className="mock-nav-item"
                  key={item.screen}
                  title={item.label}
                  aria-current={screen === item.screen ? "page" : undefined}
                  onClick={() => navigate(item.screen)}
                >
                  <Icon name={item.icon} size={21} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <button
              className="mock-rail-profile"
              onClick={() => navigate("profile")}
              aria-label="Your profile"
            >
              <Avatar name={memberDemo.profile.name} />
              <span>
                {memberDemo.profile.name}
                <small>View your profile</small>
              </span>
            </button>
          </aside>
        )}
        <div className="mock-app-body">
          <header className="mock-topbar">
            {variant === "atrium" ? (
              <>
                <button
                  className="mock-brand"
                  onClick={() => navigate("discover")}
                >
                  <span className="mock-brand-mark">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    Organisation
                    <br />
                    <strong>Meetups</strong>
                  </span>
                </button>
                <nav aria-label="Member navigation">{navItems(false)}</nav>
              </>
            ) : (
              <div className="mock-breadcrumb">
                Ministry A <span>/</span> {screenNames[screen]}
              </div>
            )}
            <div className="mock-header-actions">
              {variant === "atrium" && (
                <button
                  className={`mock-icon-button ${isAdministration ? "selected" : ""}`}
                  onClick={() => navigate("admin")}
                  aria-label="Administration"
                >
                  <Icon name="shield" />
                </button>
              )}
              <button
                className="mock-icon-button mock-inbox-button"
                onClick={() => navigate("inbox")}
                aria-label="Inbox"
              >
                <Icon name="bell" />
                {!memberDemo.readNotices && <span />}
              </button>
              <button
                className="mock-avatar-button"
                onClick={() => navigate("profile")}
                aria-label="Your profile"
              >
                <Avatar name={memberDemo.profile.name} />
              </button>
            </div>
          </header>
          {variant === "atrium" && (
            <div className="mock-context-bar">
              <span>
                Ministry A{" "}
                <span className="mock-muted">
                  / {isAdministration ? "Administration" : "Your Organisation"}
                </span>
              </span>
              <nav aria-label="More navigation">
                {secondaryNavigation
                  .filter((item) => item.screen !== "admin")
                  .map((item) => (
                    <button
                      key={item.screen}
                      className="mock-link-button"
                      onClick={() => navigate(item.screen)}
                    >
                      {item.label}
                      {item.screen === "scout" && (
                        <Icon name="chat" size={15} />
                      )}
                    </button>
                  ))}
              </nav>
            </div>
          )}
          <main
            id="prototype-main"
            className="mock-main"
            tabIndex={-1}
            ref={mainRef}
          >
            {personalScreens.includes(screen) && (
              <nav className="mock-personal-nav" aria-label="Your space">
                {(
                  [
                    "profile",
                    "interests",
                    "availability",
                    "connections",
                    "notifications",
                  ] as const
                ).map((item) => (
                  <button
                    key={item}
                    aria-current={screen === item ? "page" : undefined}
                    onClick={() => navigate(item)}
                  >
                    {screenNames[item]}
                  </button>
                ))}
              </nav>
            )}
            {(screen === "discover" ||
              screen === "meetups" ||
              screen === "events") && (
              <Discovery
                variant={variant}
                meetups={meetups}
                kind={
                  screen === "meetups"
                    ? "Meetup"
                    : screen === "events"
                      ? "Event"
                      : undefined
                }
                navigate={navigate}
                joined={joined}
              />
            )}
            {screen === "detail" && (
              <MeetupDetails
                meetup={selectedMeetup}
                joined={joined.includes(selectedMeetup.id)}
                waitlisted={waitlisted.includes(selectedMeetup.id)}
                navigate={navigate}
                onJoin={joinMeetup}
                onLeave={leaveMeetup}
                onUpdate={(updated) =>
                  setMeetups(
                    meetups.map((meetup) =>
                      meetup.id === updated.id ? updated : meetup,
                    ),
                  )
                }
                notify={setMessage}
              />
            )}
            {screen === "create" && (
              <CreateMeetup
                event={id === "event"}
                onCreate={createMeetup}
                navigate={navigate}
              />
            )}
            {isAdministration ? (
              <AdminScreens
                platform={screen === "platform"}
                tab={id}
                navigate={navigate}
                notify={setMessage}
                demo={adminDemo}
              />
            ) : (
              <MemberScreens
                screen={screen}
                id={id}
                navigate={navigate}
                notify={setMessage}
                demo={memberDemo}
              />
            )}
          </main>
          <footer className="mock-footer">
            <span>Organisation Meetups</span>
            <span>A little time for each other.</span>
            <button
              className="mock-link-button"
              onClick={() => navigate("admin")}
            >
              Administration <Icon name="arrow" size={15} />
            </button>
          </footer>
        </div>
      </div>
      <div className="mock-toast" role="status" aria-live="polite">
        {message && (
          <>
            <Icon name="check" size={18} />
            <span>{message}</span>
            <button
              className="mock-icon-button"
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              <Icon name="close" size={16} />
            </button>
          </>
        )}
      </div>
      <aside
        className={`mock-comparison ${comparisonExpanded ? "" : "is-collapsed"}`}
        aria-label="Design comparison"
      >
        <div className="mock-comparison-top">
          <span hidden={!comparisonExpanded}>
            Design preview <span className="mock-demo-dot" /> Fictional data
          </span>
          <div>
            <button
              hidden={!comparisonExpanded}
              onClick={() => window.location.reload()}
            >
              Reset demo
            </button>
            <button
              className="mock-comparison-toggle"
              aria-expanded={comparisonExpanded}
              aria-controls="mock-comparison-panel"
              onClick={() => setComparisonExpanded(!comparisonExpanded)}
            >
              {comparisonExpanded ? (
                <>
                  Collapse <Icon name="close" size={12} />
                </>
              ) : (
                <>
                  <Icon name="grid" size={17} />
                  Compare styles
                  <span className={`mock-swatch ${variant}`} />
                </>
              )}
            </button>
          </div>
        </div>
        <div id="mock-comparison-panel" hidden={!comparisonExpanded}>
          <div className="mock-comparison-controls">
            <button
              className="mock-switch-arrow"
              aria-label="Previous style"
              onClick={() => cycleVariant(-1)}
            >
              <Icon name="back" size={17} />
            </button>
            <div className="mock-variant-options">
              {variants.map((name) => (
                <button
                  aria-pressed={variant === name}
                  key={name}
                  onClick={() => selectVariant(name)}
                >
                  <span className={`mock-swatch ${name}`} />
                  {variantNames[name]}
                </button>
              ))}
            </div>
            <button
              className="mock-switch-arrow"
              aria-label="Next style"
              onClick={() => cycleVariant(1)}
            >
              <Icon name="arrow" size={17} />
            </button>
            <label>
              <span className="mock-sr-only">Preview screen</span>
              <select
                value={screen}
                onChange={(event) => {
                  const selected = screens.find(
                    (item) => item === event.target.value,
                  );
                  if (selected) navigate(selected);
                }}
              >
                {screens.map((name) => (
                  <option value={name} key={name}>
                    {screenNames[name]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>{variantDescriptions[variant]}</p>
        </div>
      </aside>
    </div>
  );
}
