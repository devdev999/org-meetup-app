import { Temporal } from "@js-temporal/polyfill";

export function zonedTime(value: Date | string, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(typeof value === "string" ? value : value.toISOString()).toZonedDateTimeISO(timeZone);
}

export function localDate(value: Date | string, timeZone: string): string {
  return zonedTime(value, timeZone).toPlainDate().toString();
}

export function localDateTime(value: Date | string, timeZone: string, seconds = false): string {
  return zonedTime(value, timeZone).toPlainDateTime().toString({ smallestUnit: seconds ? "second" : "minute" });
}

export function formatTime(value: Date | string, timeZone: string): string {
  return `${localDateTime(value, timeZone).replace("T", " ")} ${timeZone}`;
}

export function parseLocalDateTime(value: string, timeZone: string): Date {
  return new Date(Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone, { disambiguation: "reject" }).epochMilliseconds);
}

export function calendarDayStart(day: string, timeZone: string, daysAfter = 0): Date {
  return new Date(Temporal.PlainDate.from(day).add({ days: daysAfter }).toZonedDateTime(timeZone).epochMilliseconds);
}

export function weekStart(value: Date, timeZone: string): string {
  const day = zonedTime(value, timeZone).toPlainDate();
  return day.subtract({ days: day.dayOfWeek - 1 }).toString();
}

export function nextMorning(value: Date, timeZone: string): Date {
  const local = zonedTime(value, timeZone);
  let morning = local.toPlainDate().toPlainDateTime("09:00").toZonedDateTime(timeZone);
  if (morning.epochMilliseconds <= value.getTime()) morning = morning.add({ days: 1 });
  return new Date(morning.epochMilliseconds);
}
