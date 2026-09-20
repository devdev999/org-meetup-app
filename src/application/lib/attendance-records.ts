import { and, desc, eq } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { attendanceMembers, attendanceRecords, notices } from "./schema";

export const ATTENDANCE_WINDOW_DAYS = 7;

export function attendanceWindow(gathering: { startsAt: Date; durationMinutes: number }) {
  const endsAt = new Date(gathering.startsAt.getTime() + gathering.durationMinutes * 60_000);
  return { endsAt, closesAt: new Date(endsAt.getTime() + ATTENDANCE_WINDOW_DAYS * 86_400_000) };
}

export async function retainHostForAttendance(db: Queryable, organisationId: string, gatheringId: string, memberId: string): Promise<void> {
  await db.insert(attendanceRecords).values({ organisationId, gatheringId }).onConflictDoNothing();
  await db.insert(attendanceMembers).values({ organisationId, gatheringId, memberId, attended: false }).onConflictDoNothing();
}

export async function attendancePromptState(db: Queryable, organisationId: string, gatheringId: string) {
  const [record] = await db.select({ confirmedAt: attendanceRecords.confirmedAt }).from(attendanceRecords)
    .where(and(eq(attendanceRecords.organisationId, organisationId), eq(attendanceRecords.gatheringId, gatheringId)));
  const [latest] = await db.select({ id: notices.id }).from(notices)
    .where(and(eq(notices.organisationId, organisationId), eq(notices.gatheringId, gatheringId), eq(notices.kind, "attendance-prompt")))
    .orderBy(desc(notices.position)).limit(1);
  return { confirmedAt: record?.confirmedAt ?? null, latestNoticeId: latest?.id };
}
