import { z } from "zod";
import type { AvailabilityBoard } from "./availability";
import type { AiToolDefinition } from "../ports";
import type { MemberProfile, MemberSearch } from "./member-profiles";
import type { EventSummary, MeetupSummary } from "./meetups";
import { InvalidInputError } from "./errors";
import type { Connection } from "./attendance";
import type { EventSuggestion, MeetupSuggestion } from "./suggestions";

export interface ScoutLink { label: string; href: string }
export interface ScoutToolResult { data: unknown; links: ScoutLink[] }
export interface ScoutTool { definition: AiToolDefinition; read: (input: unknown) => Promise<ScoutToolResult> }

const activitySchema = z.strictObject({ activity: z.string().trim().min(1).max(120).nullable() });
const interestSchema = z.strictObject({ interest: z.string().trim().min(1).max(120), stance: z.enum(["shares", "seeks"]).nullable() });
const periodSchema = z.strictObject({ from: z.iso.datetime({ offset: true }).nullable(), until: z.iso.datetime({ offset: true }).nullable() });
const connectionsSchema = z.strictObject({});

interface MemberScoutReads {
  availability: () => Promise<AvailabilityBoard>;
  searchMembers: (input: MemberSearch) => Promise<MemberProfile[]>;
  listMeetups: () => Promise<MeetupSummary[]>;
  listEvents: () => Promise<EventSummary[]>;
  connections: () => Promise<Connection[]>;
  meetupSuggestions: () => Promise<MeetupSuggestion[]>;
  eventSuggestions: () => Promise<EventSuggestion[]>;
}

export function memberScoutTools(reads: MemberScoutReads, now: Date): ScoutTool[] {
  return [{
    definition: { name: "available_now", description: "Members currently available, optionally for an Activity such as lunch. Physical Availability is at your Site; virtual Availability is in your Organisation.",
      parameters: z.toJSONSchema(activitySchema) },
    read: async (input) => {
      const { activity } = activitySchema.parse(input);
      const entries = (await reads.availability()).open.filter((entry) => !activity || entry.activity.name.toLowerCase() === activity.toLowerCase());
      const items = entries.slice(0, 20);
      return { data: { items, total: entries.length }, links: [
        { label: "Availability", href: "/availability" },
        ...items.map(({ member }) => ({ label: member.name, href: `/members/${member.memberId}` })),
      ] };
    },
  }, {
    definition: { name: "members_by_interest", description: "Find Members by Interest or Alias, optionally filtering Shares or Seeks on that same Interest.",
      parameters: z.toJSONSchema(interestSchema) },
    read: async (input) => {
      const { interest, stance } = interestSchema.parse(input);
      const entries = await reads.searchMembers({ interest, ...(stance ? { stance } : {}) });
      const items = entries.slice(0, 20);
      return { data: { items, total: entries.length }, links: [{ label: "Find Members", href: `/members?interest=${encodeURIComponent(interest)}` },
        ...items.map(({ memberId, name }) => ({ label: name, href: `/members/${memberId}` })),
      ] };
    },
  }, {
    definition: { name: "upcoming_meetups_and_events", description: "Upcoming Meetups and Events you can see. Normal Suggestions come first, preserving their order within each kind, with their reasons over the next fourteen days; remaining entries follow by time. Use ISO timestamps for an inclusive start and exclusive end, up to 31 days apart. Null from means now; null until means seven days after from.",
      parameters: z.toJSONSchema(periodSchema) },
    read: async (input) => {
      const period = periodSchema.parse(input);
      const from = period.from ? new Date(period.from) : now;
      const until = period.until ? new Date(period.until) : new Date(from.getTime() + 7 * 86_400_000);
      if (until <= from || until.getTime() - from.getTime() > 31 * 86_400_000) throw new InvalidInputError("invalid-scout", "Choose a period of up to 31 days.");
      const [meetups, events, meetupSuggestions, eventSuggestions] = await Promise.all([
        reads.listMeetups(), reads.listEvents(), reads.meetupSuggestions(), reads.eventSuggestions(),
      ]);
      const reasons = new Map([...meetupSuggestions.map(({ meetup, reasons }) => [meetup.id, reasons] as const),
        ...eventSuggestions.map(({ event, reasons }) => [event.id, reasons] as const)]);
      const ranks = new Map([...meetupSuggestions.map(({ meetup }, rank) => [meetup.id, rank] as const),
        ...eventSuggestions.map(({ event }, rank) => [event.id, rank] as const)]);
      const entries = [...meetups, ...events].filter((entry) => entry.startsAt >= from && entry.startsAt < until)
        .sort((a, b) => (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER)
          || a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
      const items = entries.slice(0, 20).map((entry) => ({ ...entry, suggestionReasons: reasons.get(entry.id) ?? [] }));
      return { data: { items, total: entries.length }, links: [{ label: "Meetups", href: "/meetups" }, { label: "Events", href: "/events" },
        ...items.map((entry) => ({ label: `${entry.kind === "meetup" ? "Meetup" : "Event"}: ${entry.activity.name}`,
          href: `/${entry.kind === "meetup" ? "meetups" : "events"}/${entry.id}` })),
      ] };
    },
  }, {
    definition: { name: "my_connections", description: "Members you actually met, with the Meetups and Events supporting each Connection. A former Member may remain in your history without an accessible profile.",
      parameters: z.toJSONSchema(connectionsSchema) },
    read: async (input) => {
      connectionsSchema.parse(input);
      const entries = await reads.connections();
      const items = entries.slice(0, 20).map((entry) => ({ ...entry, occurrences: entry.occurrences.slice(0, 5), totalOccurrences: entry.occurrences.length }));
      return { data: { items, total: entries.length }, links: [{ label: "Your Connections", href: "/connections" },
        ...items.filter(({ member }) => member.profileVisible).map(({ member }) => ({ label: member.name, href: `/members/${member.memberId}` })),
      ] };
    },
  }];
}
