import { calendarDayStart, zonedTime } from "../../calendar";

export interface RecurrenceRule {
  frequency: "weekly" | "fortnightly" | "monthly";
  startsAt: Date;
  endsOn?: string | null;
  timeZone?: string;
}

export function expandRecurrence(rule: RecurrenceRule, after: Date, through: Date): Date[] {
  const timeZone = rule.timeZone ?? "UTC";
  const end = rule.endsOn ? calendarDayStart(rule.endsOn, timeZone, 1).getTime() : Infinity;
  const limit = Math.min(through.getTime(), end - 1);
  const start = zonedTime(rule.startsAt, timeZone).toPlainDateTime();
  const afterLocal = zonedTime(after, timeZone).toPlainDateTime();
  const dates: Date[] = [];
  if (rule.frequency === "monthly") {
    const last = zonedTime(new Date(limit), timeZone);
    const firstMonth = Math.max(start.year * 12 + start.month - 1, afterLocal.year * 12 + afterLocal.month - 1);
    const lastMonth = last.year * 12 + last.month - 1;
    const ordinal = Math.floor((start.day - 1) / 7);
    for (let month = firstMonth; month <= lastMonth; month++) {
      const first = start.with({ year: Math.floor(month / 12), month: month % 12 + 1, day: 1 });
      const local = first.add({ days: (start.dayOfWeek - first.dayOfWeek + 7) % 7 + ordinal * 7 });
      const date = new Date(local.toZonedDateTime(timeZone).epochMilliseconds);
      if (local.month === first.month && date >= rule.startsAt && date > after && date.getTime() <= limit) dates.push(date);
    }
    return dates;
  }
  const interval = rule.frequency === "fortnightly" ? 14 : 7;
  const first = Math.max(0, Math.floor(start.toPlainDate().until(afterLocal.toPlainDate(), { largestUnit: "days" }).days / interval));
  for (let index = first; ; index++) {
    const date = new Date(start.add({ days: index * interval }).toZonedDateTime(timeZone).epochMilliseconds);
    if (date.getTime() > limit) break;
    if (date > after) dates.push(date);
  }
  return dates;
}
