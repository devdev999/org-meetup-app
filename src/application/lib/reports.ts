import { calendarDayStart, weekStart } from "../../calendar";
import { deploymentTimeZone } from "./deployment-settings";
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, min, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { activities, attendanceMembers, attendanceRecords, availabilities, departments, gatheringMembers, gatheringRsvps, gatherings, interests, memberInterests, members, sites, telegramLinks } from "./schema";
import { ratings } from "./attendance";
import { ratingsTable } from "./attendance-reports";
import { meetupOrEvent } from "./meetups";
import type { Report, ReportPeriod, ReportTable } from "./report-types";

const participationBasis = "Current Active Members and current Departments and Sites; confirmed Attendance in the selected period.";

export function reportPeriod(input: ReportPeriod): ReportPeriod {
  const parsed = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse(input);
  if (!parsed.success || parsed.data.from > parsed.data.to) {
    throw new InvalidInputError("invalid-report", "Choose a valid start and end date.");
  }
  return parsed.data;
}

export function reportBounds(period: ReportPeriod, timeZone = "UTC") {
  return { start: calendarDayStart(period.from, timeZone), end: calendarDayStart(period.to, timeZone, 1) };
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator ? Math.round(numerator / denominator * 10_000) / 100 : null;
}

export function reportSelection(tableId: string | undefined, ids: string[]) {
  if (tableId !== undefined && !ids.includes(tableId)) throw new InvalidInputError("invalid-report", "Choose a table from this report.");
  return (id: string) => tableId === undefined || tableId === id;
}

export function organisationReport(db: Queryable, organisationId: string, input: ReportPeriod, now: Date, tableId?: string): Promise<Report> {
  return aggregateReport(db, [organisationId], input, now, tableId);
}

export async function aggregateReport(db: Queryable, organisationIds: string[], input: ReportPeriod, now: Date, tableId?: string): Promise<Report> {
  const period = reportPeriod(input);
  const timeZone = await deploymentTimeZone(db);
  const selected = reportSelection(tableId, ["participation-departments", "participation-sites", "waitlists", "weekly-occurrences", "rsvp-attendance", "ratings",
    "shared-interests", "sought-interests", "unmet-seeks", "availability", "telegram", "activation"]);
  const tables: ReportTable[] = [];
  if (selected("participation-departments") || selected("participation-sites")) tables.push(...await participationTables(db, organisationIds, period, timeZone));
  tables.push(...await occurrenceTables(db, organisationIds, period, timeZone, now, selected));
  tables.push(...await usageTables(db, organisationIds, period, timeZone, now, selected));
  if (selected("activation")) tables.push(await activationTable(db, organisationIds, period, timeZone));
  return { period, timeZone, tables: tables.filter((table) => selected(table.id)) };
}

async function participationTables(db: Queryable, organisationIds: string[], period: ReportPeriod, timeZone: string): Promise<ReportTable[]> {
  const { start, end } = reportBounds(period, timeZone);
  const population = await db.select({ id: members.id, department: departments.name, site: sites.name }).from(members)
    .leftJoin(departments, and(eq(departments.organisationId, members.organisationId), eq(departments.id, members.departmentId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, members.siteId)))
    .where(and(inArray(members.organisationId, organisationIds), eq(members.status, "active")));
  const attendance = await db.selectDistinct({ memberId: attendanceMembers.memberId }).from(attendanceMembers)
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, attendanceMembers.organisationId), eq(attendanceRecords.gatheringId, attendanceMembers.gatheringId)))
    .innerJoin(gatherings, and(eq(gatherings.organisationId, attendanceMembers.organisationId), eq(gatherings.id, attendanceMembers.gatheringId)))
    .where(and(inArray(attendanceMembers.organisationId, organisationIds), eq(attendanceMembers.attended, true), isNotNull(attendanceRecords.confirmedAt),
      inArray(gatherings.status, ["scheduled", "completed"]), gte(gatherings.startsAt, start), lt(gatherings.startsAt, end)));
  const attended = new Set(attendance.map((row) => row.memberId));
  return (["department", "site"] as const).map((dimension) => {
    const groups = Map.groupBy(population, (member) => member[dimension]);
    return {
      id: `participation-${dimension}s`, title: `Participation by ${dimension === "department" ? "Department" : "Site"}`,
      basis: participationBasis, columns: [dimension === "department" ? "Department" : "Site", "Attended", "Active Members", "Participation %"],
      rows: [...groups].sort(([a], [b]) => {
        if (a === b) return 0;
        return a === null ? 1 : b === null ? -1 : a.localeCompare(b);
      }).map(([name, people]) => {
        const count = people.filter((person) => attended.has(person.id)).length;
        return [name, count, people.length, percentage(count, people.length)];
      }),
    };
  });
}

async function activationTable(db: Queryable, organisationIds: string[], period: ReportPeriod, timeZone: string): Promise<ReportTable> {
  const { start, end } = reportBounds(period, timeZone);
  const cohort = await db.select({ id: members.id, provisionedAt: members.createdAt,
    hasDeclaredInterest: members.hasDeclaredInterest, firstInterestAt: members.firstInterestDeclaredAt }).from(members)
    .where(and(inArray(members.organisationId, organisationIds), gte(members.createdAt, start), lt(members.createdAt, end)));
  const attendance = await db.select({ memberId: attendanceMembers.memberId, startsAt: min(gatherings.startsAt) }).from(attendanceMembers)
    .innerJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, attendanceMembers.organisationId), eq(attendanceRecords.gatheringId, attendanceMembers.gatheringId)))
    .innerJoin(gatherings, and(eq(gatherings.organisationId, attendanceMembers.organisationId), eq(gatherings.id, attendanceMembers.gatheringId)))
    .innerJoin(members, and(eq(members.organisationId, attendanceMembers.organisationId), eq(members.id, attendanceMembers.memberId)))
    .where(and(inArray(attendanceMembers.organisationId, organisationIds), eq(attendanceMembers.attended, true), isNotNull(attendanceRecords.confirmedAt),
      inArray(gatherings.status, ["scheduled", "completed"]), gte(members.createdAt, start), lt(members.createdAt, end)))
    .groupBy(attendanceMembers.memberId);
  const byMember = new Map(attendance.map((row) => [row.memberId, row.startsAt]));
  const activated = cohort.filter((member) => {
    const initial = member.provisionedAt.getTime();
    const through = initial + 30 * 86_400_000;
    const firstAttendance = byMember.get(member.id)?.getTime();
    const firstInterest = member.firstInterestAt?.getTime();
    return firstInterest !== undefined && firstInterest >= initial && firstInterest <= through
      && firstAttendance !== undefined && firstAttendance >= initial && firstAttendance <= through;
  }).length;
  const unknown = cohort.filter((member) => member.hasDeclaredInterest && member.firstInterestAt === null).length;
  return { id: "activation", title: "New-joiner activation", basis: "Members initially provisioned in the selected period, including inactive Members. Both first Interest and first confirmed Attendance must fall within thirty days of initial provisioning, using occurrence start time. Reactivation does not restart the window. Legacy unknown first Interest dates are not counted as activated.",
    columns: ["Provisioned Members", "Activated within thirty days", "Unknown first Interest date", "Activation %"],
    rows: [[cohort.length, activated, unknown, percentage(activated, cohort.length)]] };
}

async function usageTables(db: Queryable, organisationIds: string[], period: ReportPeriod, timeZone: string, now: Date, selected: (id: string) => boolean): Promise<ReportTable[]> {
  const { start, end } = reportBounds(period, timeZone);
  const tables: ReportTable[] = [];
  if (selected("shared-interests") || selected("sought-interests") || selected("unmet-seeks")) {
    const demand = await db.select({ name: interests.name, kind: interests.kind,
      shares: sql<number>`count(*) filter (where ${memberInterests.stance} = 'shares')::integer`,
      seeks: sql<number>`count(*) filter (where ${memberInterests.stance} = 'seeks')::integer` }).from(memberInterests)
      .innerJoin(interests, and(eq(interests.organisationId, memberInterests.organisationId), eq(interests.id, memberInterests.interestId)))
      .innerJoin(members, and(eq(members.organisationId, memberInterests.organisationId), eq(members.id, memberInterests.memberId)))
      .where(and(inArray(memberInterests.organisationId, organisationIds), eq(members.status, "active"))).groupBy(interests.name, interests.kind);
    const interestTable = (id: string, title: string, stance: "shares" | "seeks", unmet = false): ReportTable => ({
      id, title, basis: "Current Interests of current Active Members, independent of the selected period.",
      columns: ["Interest", "Kind", stance === "shares" ? "Shares" : "Seeks"],
      rows: demand.filter((row) => row[stance] > 0 && (!unmet || row.shares === 0))
        .sort((a, b) => b[stance] - a[stance] || a.name.localeCompare(b.name))
        .map((row) => [row.name, row.kind === "skill" ? "Skill" : "Hobby", row[stance]]),
    });
    tables.push(
      interestTable("shared-interests", "Most Shared Interests", "shares"),
      interestTable("sought-interests", "Most Sought Interests", "seeks"),
      interestTable("unmet-seeks", "Seeks with no Shares", "seeks", true),
    );
  }
  if (selected("availability")) {
    const [posts] = await db.select({ count: sql<number>`count(*)::integer`, members: sql<number>`count(distinct ${availabilities.memberId})::integer` }).from(availabilities)
      .where(and(inArray(availabilities.organisationId, organisationIds), gte(availabilities.createdAt, start), lt(availabilities.createdAt, end)));
    const other = alias(availabilities, "other_availability");
    const overlapStart = sql`greatest(${availabilities.startsAt}, ${availabilities.createdAt}, ${other.startsAt}, ${other.createdAt})`;
    const overlapEnd = sql`least(${availabilities.endsAt}, ${availabilities.expiredAt}, ${other.endsAt}, ${other.expiredAt})`;
    const [overlaps] = await db.select({ count: sql<number>`count(*)::integer` })
      .from(availabilities).innerJoin(other, and(eq(other.organisationId, availabilities.organisationId), lt(availabilities.memberId, other.memberId),
        eq(availabilities.activityId, other.activityId), sql`${availabilities.siteId} is not distinct from ${other.siteId}`))
      .where(and(inArray(availabilities.organisationId, organisationIds),
        ...[availabilities, other].map((post) => and(lt(post.startsAt, end), gt(post.endsAt, start), lt(post.createdAt, end),
          or(isNull(post.expiredAt), gt(post.expiredAt, start)))),
        gte(overlapStart, sql`${start.toISOString()}::timestamptz`), lt(overlapStart, sql`${end.toISOString()}::timestamptz`),
        lt(overlapStart, overlapEnd), lte(overlapStart, sql`${now.toISOString()}::timestamptz`)));
    tables.push({ id: "availability", title: "Availability usage", basis: "Posts created in the selected period, including expired posts. Overlaps count pairs of posts by different Members with matching Activity and Place, using posted windows and recorded expiry. Each pair counts when its overlap starts in the selected period.",
      columns: ["Posts", "Members posting", "Overlaps"], rows: [[posts!.count, posts!.members, overlaps!.count]] });
  }
  if (selected("telegram")) {
    const [linkage] = await db.select({ active: sql<number>`count(*)::integer`, linked: sql<number>`count(${telegramLinks.memberId})::integer` }).from(members)
      .leftJoin(telegramLinks, and(eq(telegramLinks.organisationId, members.organisationId), eq(telegramLinks.memberId, members.id)))
      .where(and(inArray(members.organisationId, organisationIds), eq(members.status, "active")));
    tables.push({ id: "telegram", title: "Telegram linkage", basis: "Current Active Members, independent of the selected period.",
      columns: ["Linked Members", "Active Members", "Linkage %"], rows: [[linkage!.linked, linkage!.active, percentage(linkage!.linked, linkage!.active)]] });
  }
  return tables;
}

async function occurrenceTables(db: Queryable, organisationIds: string[], period: ReportPeriod, timeZone: string, now: Date, selected: (id: string) => boolean): Promise<ReportTable[]> {
  const { start, end } = reportBounds(period, timeZone);
  const occurrences = selected("waitlists") || selected("weekly-occurrences") || selected("rsvp-attendance")
    ? await db.select({ gathering: gatherings, activity: activities.name, confirmedAt: attendanceRecords.confirmedAt }).from(gatherings)
    .innerJoin(activities, and(eq(activities.organisationId, gatherings.organisationId), eq(activities.id, gatherings.activityId)))
    .leftJoin(attendanceRecords, and(eq(attendanceRecords.organisationId, gatherings.organisationId), eq(attendanceRecords.gatheringId, gatherings.id)))
    .where(and(inArray(gatherings.organisationId, organisationIds), inArray(gatherings.status, ["scheduled", "completed"]), gte(gatherings.startsAt, start), lt(gatherings.startsAt, end)))
    .orderBy(gatherings.startsAt, gatherings.kind, activities.name) : [];
  const ids = selected("rsvp-attendance") ? occurrences.map(({ gathering }) => gathering.id) : [];
  const memberships = ids.length ? await db.select().from(gatheringMembers).where(and(inArray(gatheringMembers.organisationId, organisationIds), inArray(gatheringMembers.gatheringId, ids))) : [];
  const answers = ids.length ? await db.select().from(gatheringRsvps).where(and(inArray(gatheringRsvps.organisationId, organisationIds), inArray(gatheringRsvps.gatheringId, ids))) : [];
  const attended = ids.length ? await db.select().from(attendanceMembers).where(and(inArray(attendanceMembers.organisationId, organisationIds), inArray(attendanceMembers.gatheringId, ids), eq(attendanceMembers.attended, true))) : [];
  const activityRatings = selected("ratings") ? await ratings(db, organisationIds, { start, end }) : [];
  const membershipsByOccurrence = Map.groupBy(memberships, (row) => row.gatheringId);
  const answersByOccurrence = Map.groupBy(answers, (row) => row.gatheringId);
  const attendedByOccurrence = Map.groupBy(attended, (row) => row.gatheringId);
  const weekly = new Map<string, { week: string; kind: string; activity: string; count: number }>();
  for (const { gathering, activity } of selected("weekly-occurrences") ? occurrences : []) {
    const week = weekStart(gathering.startsAt, timeZone);
    const kind = meetupOrEvent(gathering);
    const key = JSON.stringify([week, kind, activity]);
    const row = weekly.get(key) ?? { week, kind, activity, count: 0 };
    row.count++;
    weekly.set(key, row);
  }
  const attendanceRows = (["meetup", "event"] as const).map((kind) => {
    let going = 0, notGoing = 0, unanswered = 0, confirmedGoing = 0, present = 0, noShows = 0;
    for (const { gathering, confirmedAt } of selected("rsvp-attendance") ? occurrences : []) {
      if (gathering.kind !== kind || gathering.startsAt.getTime() + gathering.durationMinutes * 60_000 > now.getTime()) continue;
      const seated = (membershipsByOccurrence.get(gathering.id) ?? []).filter((row) => row.status === "participant");
      const replies = new Map((answersByOccurrence.get(gathering.id) ?? []).map((row) => [row.memberId, row.answer]));
      const expected = seated.filter((row) => !gathering.recurrenceId || replies.get(row.memberId) === "going");
      going += expected.length;
      notGoing += [...replies.values()].filter((answer) => answer === "not-going").length;
      unanswered += gathering.recurrenceId ? seated.filter((row) => !replies.get(row.memberId)).length : 0;
      if (!confirmedAt) continue;
      const came = new Set((attendedByOccurrence.get(gathering.id) ?? []).map((row) => row.memberId));
      confirmedGoing += expected.length;
      present += came.size;
      noShows += expected.filter((row) => !came.has(row.memberId)).length;
    }
    return [meetupOrEvent({ kind }), going, notGoing, unanswered, confirmedGoing, present, noShows, percentage(noShows, confirmedGoing)];
  });
  return [
    { id: "waitlists", title: "Waitlist frequency", basis: "Occurrences starting in the selected period that ever had a waitlist, including later promotions and removals. Frequency uses occurrences with known history; older unknown history is shown separately.",
      columns: ["Kind", "Occurrences", "Known history", "Had a waitlist", "Unknown history", "Frequency %"],
      rows: (["meetup", "event"] as const).map((kind) => {
        const selected = occurrences.filter(({ gathering }) => gathering.kind === kind);
        const known = selected.filter(({ gathering }) => gathering.hadWaitlist !== null).length;
        const waited = selected.filter(({ gathering }) => gathering.hadWaitlist === true).length;
        return [meetupOrEvent({ kind }), selected.length, known, waited, selected.length - known, percentage(waited, known)];
      }) },
    { id: "weekly-occurrences", title: "Meetups and Events per week", basis: `Scheduled or completed occurrences by start date. Weeks start Monday in ${timeZone}.`,
      columns: ["Week starting", "Kind", "Activity", "Occurrences"],
      rows: [...weekly.values()].sort((a, b) => a.week.localeCompare(b.week) || a.kind.localeCompare(b.kind) || a.activity.localeCompare(b.activity))
        .map((row) => [row.week, row.kind, row.activity, row.count]) },
    { id: "rsvp-attendance", title: "RSVP and Attendance", basis: "Ended occurrences in the selected period. Going and unanswered counts include seated Participants only. No-show % uses Going Participants with confirmed Attendance; unknown Attendance causes no no-shows.",
      columns: ["Kind", "Going", "Not going", "Unanswered", "Going with confirmed Attendance", "Attended", "No-shows", "No-show %"], rows: attendanceRows },
    { ...ratingsTable(activityRatings), basis: "Ratings for occurrences starting in the selected period. Scores range from one to five." },
  ];
}
