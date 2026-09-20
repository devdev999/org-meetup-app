import type { ActivityRating, AttendanceHistoryEntry } from "./attendance";
import { meetupOrEvent } from "./meetups";
import type { ReportTable } from "./report-types";

export function ratingsTable(rows: ActivityRating[]): ReportTable {
  return { id: "ratings", title: "Ratings by Activity", basis: "Scores range from one to five.",
    columns: ["Activity", "Ratings", "Average"], rows: rows.map((row) => [row.activity.name, row.ratingCount, Math.round(row.averageRating * 100) / 100]) };
}

export function attendanceHistoryTable(rows: AttendanceHistoryEntry[]): ReportTable {
  return { id: "member-attendance", title: "Member Attendance history", basis: "All past occurrences. Times are UTC. Unknown Attendance causes no no-shows.",
    columns: ["Kind", "Activity", "Starts at", "Place", "Attendance"], rows: rows.map((row) => [
      meetupOrEvent(row), row.activity.name, row.startsAt.toISOString(),
      row.place.kind === "virtual" ? row.place.url : `${row.place.siteName}, ${row.place.spot}`, row.outcome,
    ]) };
}
