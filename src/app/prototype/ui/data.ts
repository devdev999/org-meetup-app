export const variants = ["atrium", "fieldwork", "studio"] as const;
export type Variant = (typeof variants)[number];

export const screens = [
  "discover",
  "meetups",
  "events",
  "detail",
  "create",
  "members",
  "member",
  "profile",
  "interests",
  "availability",
  "connections",
  "inbox",
  "notifications",
  "scout",
  "admin",
  "platform",
] as const;
export type Screen = (typeof screens)[number];
export type Navigate = (screen: Screen, id?: string) => void;
export type Notify = (message: string) => void;

export const variantNames: Record<Variant, string> = {
  atrium: "Atrium",
  fieldwork: "Fieldwork",
  studio: "Studio",
};
export const variantDescriptions: Record<Variant, string> = {
  atrium: "Warm stone · photography · open layouts",
  fieldwork: "Forest green · daily schedule · compact rail",
  studio: "Soft violet · bold typography · directory",
};

export type Meetup = {
  id: string;
  title: string;
  activity: string;
  kind: "Meetup" | "Event";
  date: string;
  time: string;
  duration: string;
  place: string;
  site: string;
  host: string;
  participants: number;
  capacity: number;
  photo: string;
  interest: string;
  reason: string;
  description: string;
  audience?: string;
  url?: string;
  cancelled?: boolean;
};

export const initialMeetups = [
  {
    id: "coffee",
    title: "A coffee, a conversation",
    activity: "Coffee",
    kind: "Meetup",
    date: "2026-09-22",
    time: "10:30",
    duration: "45 minutes",
    place: "The courtyard café",
    site: "Central Site",
    host: "Priya Nair",
    participants: 4,
    capacity: 6,
    photo: "coffee",
    interest: "Coffee",
    reason: "You both Share an Interest in coffee.",
    description:
      "Take a break with a few new faces from across the Organisation. Bring your usual order and whatever is on your mind. We will be at the long table beside the courtyard. There is no agenda, just time to get to know each other.",
  },
  {
    id: "walk",
    title: "The lunchtime long way round",
    activity: "Walk",
    kind: "Meetup",
    date: "2026-09-22",
    time: "12:15",
    duration: "45 minutes",
    place: "Garden entrance",
    site: "Central Site",
    host: "Daniel Tan",
    participants: 5,
    capacity: 10,
    photo: "walk",
    interest: "Walking",
    reason: "Overlaps your lunch Availability.",
    description:
      "A gentle walk along the garden path and back before the afternoon. Meet at the garden entrance. Comfortable shoes and a bottle of water are all you need.",
  },
  {
    id: "games",
    title: "One more round?",
    activity: "Game",
    kind: "Meetup",
    date: "2026-09-23",
    time: "17:30",
    duration: "90 minutes",
    place: "Common room, level 2",
    site: "Central Site",
    host: "Amir Rahman",
    participants: 6,
    capacity: 6,
    photo: "games",
    interest: "Board games",
    reason: "Meet Members from another Department.",
    description:
      "An after-work board game Meetup. We will start with a short game, explain the rules together, then see what everyone feels like playing. First-time players are welcome.",
  },
  {
    id: "learning",
    title: "Make your data tell a story",
    activity: "Learning session",
    kind: "Event",
    date: "2026-09-24",
    time: "14:00",
    duration: "60 minutes",
    place: "Learning room",
    site: "North Site",
    host: "Sofia Lim",
    participants: 12,
    capacity: 20,
    photo: "workshop",
    interest: "Data visualisation",
    reason: "You Seek data visualisation.",
    description:
      "Bring a small dataset or use the sample provided. Sofia will walk through choosing a chart, removing distractions and explaining what the numbers mean. This Event is open to the Organisation.",
  },
] satisfies [Meetup, ...Meetup[]];

export function formatMeetupDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
  },
) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", options);
}

export const members = [
  {
    id: "priya",
    name: "Priya Nair",
    department: "Policy",
    site: "Central Site",
    shares: "Coffee",
    seeks: "Photography",
    bio: "Always happy to try a new coffee place. Currently learning to see the city through a camera.",
    color: "sand",
  },
  {
    id: "daniel",
    name: "Daniel Tan",
    department: "Operations",
    site: "Central Site",
    shares: "Walking",
    seeks: "Public speaking",
    bio: "Usually outdoors at lunchtime. I like finding a new path and meeting someone along the way.",
    color: "sage",
  },
  {
    id: "sofia",
    name: "Sofia Lim",
    department: "Digital services",
    site: "North Site",
    shares: "Data visualisation",
    seeks: "Board games",
    bio: "I help people make sense of data. Happy to trade a chart lesson for a new board game.",
    color: "lilac",
  },
  {
    id: "amir",
    name: "Amir Rahman",
    department: "Finance",
    site: "Central Site",
    shares: "Board games",
    seeks: "Coffee",
    bio: "There is always room for one more player. I bring the games and explain the rules.",
    color: "peach",
  },
  {
    id: "mei",
    name: "Mei Chen",
    department: "People",
    site: "North Site",
    shares: "Photography",
    seeks: "Walking",
    bio: "Taking the scenic route with a camera. Looking for people to explore with.",
    color: "sage",
  },
  {
    id: "alex",
    name: "Alex Morgan",
    department: "Digital services",
    site: "Central Site",
    shares: "Coffee",
    seeks: "Data visualisation",
    bio: "Here for a good conversation and a chance to learn something from another Department.",
    color: "sand",
  },
] satisfies [unknown, ...unknown[]];
