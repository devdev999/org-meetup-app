import { expect, test } from "vitest";
import { calendarDayStart, localDateTime, nextMorning, parseLocalDateTime } from "./calendar";

test("local date input and display agree on the exact instant", () => {
  const instant = parseLocalDateTime("2026-09-21T00:30", "Asia/Singapore");
  expect(instant.toISOString()).toBe("2026-09-20T16:30:00.000Z");
  expect(localDateTime(instant, "Asia/Singapore")).toBe("2026-09-21T00:30");
});

test.each(["2026-03-08T02:30", "2026-11-01T01:30"])("date input rejects a skipped or repeated New York time, %s", (value) => {
  expect(() => parseLocalDateTime(value, "America/New_York")).toThrow(RangeError);
});

test("report days and the morning digest use calendar arithmetic across daylight saving", () => {
  const zone = "America/New_York";
  expect(calendarDayStart("2026-03-08", zone, 1).getTime() - calendarDayStart("2026-03-08", zone).getTime()).toBe(23 * 3_600_000);
  expect(calendarDayStart("2026-11-01", zone, 1).getTime() - calendarDayStart("2026-11-01", zone).getTime()).toBe(25 * 3_600_000);
  expect(nextMorning(new Date("2026-03-07T14:00:00Z"), zone).toISOString()).toBe("2026-03-08T13:00:00.000Z");
});
