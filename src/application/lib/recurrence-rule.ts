export interface RecurrenceRule {
  frequency: "weekly" | "fortnightly" | "monthly";
  startsAt: Date;
  endsOn?: string | null;
}

export function expandRecurrence(rule: RecurrenceRule, after: Date, through: Date): Date[] {
  const limit = rule.endsOn ? new Date(Math.min(through.getTime(), Date.parse(`${rule.endsOn}T23:59:59.999Z`))) : through;
  const dates: Date[] = [];
  if (rule.frequency === "monthly") {
    const firstMonth = Math.max(rule.startsAt.getUTCFullYear() * 12 + rule.startsAt.getUTCMonth(), after.getUTCFullYear() * 12 + after.getUTCMonth());
    const lastMonth = limit.getUTCFullYear() * 12 + limit.getUTCMonth();
    const ordinal = Math.floor((rule.startsAt.getUTCDate() - 1) / 7);
    for (let month = firstMonth; month <= lastMonth; month++) {
      const date = new Date(rule.startsAt);
      date.setUTCFullYear(Math.floor(month / 12), month % 12, 1);
      const offset = (rule.startsAt.getUTCDay() - date.getUTCDay() + 7) % 7;
      date.setUTCDate(1 + offset + ordinal * 7);
      if (date.getUTCMonth() === month % 12 && date >= rule.startsAt && date > after && date <= limit) dates.push(date);
    }
    return dates;
  }
  const interval = (rule.frequency === "fortnightly" ? 14 : 7) * 24 * 60 * 60 * 1000;
  const first = Math.max(0, Math.floor((after.getTime() - rule.startsAt.getTime()) / interval) + 1);
  for (let time = rule.startsAt.getTime() + first * interval; time <= limit.getTime(); time += interval) {
    dates.push(new Date(time));
  }
  return dates;
}
