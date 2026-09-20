import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { Actor } from "./actor";
import { readAttendanceHistory, readConnections } from "./attendance";
import type { Queryable } from "./departments-and-sites";
import { AccessDeniedError } from "./errors";
import { isUuid } from "./input";
import { memberInterestsFor } from "./interests";
import { reportBounds, reportPeriod } from "./reports";
import type { Report, ReportPeriod } from "./report-types";
import { activities, availabilities, departments, flags, gatheringMembers, gatherings, members, sites } from "./schema";

export async function memberReport(db: Queryable, actor: Actor, memberId: string, input: ReportPeriod, now: Date): Promise<Report> {
  if (!isUuid(memberId)) throw new AccessDeniedError();
  const period = reportPeriod(input);
  const range = reportBounds(period);
  const [row] = await db.select({ member: members, department: departments.name, site: sites.name }).from(members)
    .leftJoin(departments, and(eq(departments.organisationId, members.organisationId), eq(departments.id, members.departmentId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, members.siteId)))
    .where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId)));
  if (!row) throw new AccessDeniedError();
  const person = { ...actor, memberId };
  const history = await readAttendanceHistory(db, person, now, range);
  const occurrences = await db.select({ id: gatherings.id, kind: gatherings.kind, hostMemberId: gatherings.hostMemberId, membership: gatheringMembers.status }).from(gatherings)
    .leftJoin(gatheringMembers, and(eq(gatheringMembers.organisationId, gatherings.organisationId), eq(gatheringMembers.gatheringId, gatherings.id), eq(gatheringMembers.memberId, memberId)))
    .where(and(eq(gatherings.organisationId, actor.organisationId), inArray(gatherings.status, ["scheduled", "completed"]),
      gte(gatherings.startsAt, range.start), lt(gatherings.startsAt, range.end),
      or(eq(gatherings.hostMemberId, memberId), eq(gatheringMembers.status, "participant"))));
  const connections = await readConnections(db, person, range);
  const interests = await memberInterestsFor(db, actor.organisationId, [memberId]);
  const posts = await db.select({ activity: activities.name, start: availabilities.startsAt, end: availabilities.endsAt, site: sites.name }).from(availabilities)
    .innerJoin(activities, and(eq(activities.organisationId, availabilities.organisationId), eq(activities.id, availabilities.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, availabilities.organisationId), eq(sites.id, availabilities.siteId)))
    .where(and(eq(availabilities.organisationId, actor.organisationId), eq(availabilities.memberId, memberId), gte(availabilities.createdAt, range.start), lt(availabilities.createdAt, range.end)))
    .orderBy(availabilities.startsAt, availabilities.id);
  const [flagCounts] = await db.select({
    raised: sql<number>`count(*) filter (where ${flags.reporterMemberId} = ${memberId})::integer`,
    received: sql<number>`count(*) filter (where ${flags.targetMemberId} = ${memberId})::integer`,
  }).from(flags).where(and(eq(flags.organisationId, actor.organisationId), gte(flags.createdAt, range.start), lt(flags.createdAt, range.end)));
  return { period, tables: [
    { id: "member-profile", title: "Member", basis: "Current Member details. Initial provisioning and first Interest dates survive reactivation.",
      columns: ["Name", "Email", "Status", "Department", "Site", "Initially provisioned", "First Interest declared", "Last activity"],
      rows: [[row.member.name, row.member.email, row.member.status, row.department, row.site, row.member.createdAt.toISOString(),
        row.member.firstInterestDeclaredAt?.toISOString() ?? (row.member.hasDeclaredInterest ? "Unknown" : "Not declared"), row.member.lastActivityAt?.toISOString() ?? null]] },
    { id: "member-counts", title: "Participation counts", basis: "Non-cancelled occurrences starting in the selected period. Joined includes the Host when they hold a Participant place. Attended and no-show counts require confirmed Attendance.",
      columns: ["Kind", "Hosted", "Joined", "Attended", "No-shows"], rows: (["meetup", "event"] as const).map((kind) => [
        kind === "meetup" ? "Meetup" : "Event", occurrences.filter((entry) => entry.kind === kind && entry.hostMemberId === memberId).length,
        occurrences.filter((entry) => entry.kind === kind && entry.membership === "participant").length,
        history.filter((entry) => entry.kind === kind && entry.outcome === "attended").length,
        history.filter((entry) => entry.kind === kind && entry.outcome === "no-show").length,
      ]) },
    { id: "member-connections", title: "Connections", basis: "Distinct Members met through confirmed Attendance at occurrences starting in the selected period.",
      columns: ["Member", "Occurrences together"], rows: connections.map((connection) => [connection.member.name, connection.occurrences.length]) },
    { id: "member-availability", title: "Availability posts", basis: "Posts created in the selected period, including expired posts. Times are UTC.",
      columns: ["Activity", "Starts at", "Ends at", "Place"], rows: posts.map((post) => [post.activity, post.start.toISOString(), post.end.toISOString(), post.site ?? "Virtual"]) },
    { id: "member-interests", title: "Interests and Stances", basis: "Current declarations, independent of the selected period.",
      columns: ["Interest", "Kind", "Stance"], rows: interests.map((interest) => [interest.name, interest.kind === "skill" ? "Skill" : "Hobby", interest.stance === "shares" ? "Shares" : "Seeks"]) },
    { id: "member-flags", title: "Flags", basis: "Flags raised in the selected period. Received counts Flags directly about this Member.",
      columns: ["Raised", "Received"], rows: [[flagCounts!.raised, flagCounts!.received]] },
  ] };
}
