import { expect, test } from "vitest";
import { expandRecurrence } from "./recurrence-rule";

test("weekly recurrence preserves the weekday and time through the inclusive horizon", () => {
  const dates = expandRecurrence(
    { frequency: "weekly", startsAt: new Date("2026-01-29T10:00:00Z") },
    new Date("2026-01-29T10:00:00Z"),
    new Date("2026-02-12T10:00:00Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2026-02-05T10:00:00.000Z", "2026-02-12T10:00:00.000Z",
  ]);
});

test("fortnightly recurrence stays anchored when the current date skips past occurrences", () => {
  const dates = expandRecurrence(
    { frequency: "fortnightly", startsAt: new Date("2026-01-29T10:00:00Z") },
    new Date("2026-02-20T09:00:00Z"),
    new Date("2026-03-12T10:00:00Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2026-02-26T10:00:00.000Z", "2026-03-12T10:00:00.000Z",
  ]);
});

test("monthly recurrence preserves the numbered weekday rather than the day of the month", () => {
  const dates = expandRecurrence(
    { frequency: "monthly", startsAt: new Date("2026-01-08T10:15:30Z") },
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-04-30T23:59:59Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2026-01-08T10:15:30.000Z", "2026-02-12T10:15:30.000Z",
    "2026-03-12T10:15:30.000Z", "2026-04-09T10:15:30.000Z",
  ]);
});

test("a fifth-weekday recurrence skips months without that weekday", () => {
  const dates = expandRecurrence(
    { frequency: "monthly", startsAt: new Date("2026-01-29T10:00:00Z") },
    new Date("2026-01-29T10:00:00Z"),
    new Date("2026-05-01T00:00:00Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual(["2026-04-30T10:00:00.000Z"]);
});

test("the optional end date includes that day's occurrence and excludes later ones", () => {
  const dates = expandRecurrence(
    { frequency: "weekly", startsAt: new Date("2026-01-29T10:00:00Z"), endsOn: "2026-02-12" },
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-03-12T10:00:00Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2026-01-29T10:00:00.000Z", "2026-02-05T10:00:00.000Z", "2026-02-12T10:00:00.000Z",
  ]);
});

test("a fifth Thursday anchored on leap day keeps its time and respects the monthly end date", () => {
  const dates = expandRecurrence(
    { frequency: "monthly", startsAt: new Date("2024-02-29T10:00:00Z"), endsOn: "2024-05-30" },
    new Date("2024-01-01T00:00:00Z"),
    new Date("2024-12-31T23:59:59Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2024-02-29T10:00:00.000Z", "2024-05-30T10:00:00.000Z",
  ]);
});

test("monthly recurrence crosses the year without shifting its numbered weekday", () => {
  const dates = expandRecurrence(
    { frequency: "monthly", startsAt: new Date("2026-11-12T10:00:00Z") },
    new Date("2026-11-12T10:00:00Z"),
    new Date("2027-01-14T10:00:00Z"),
  );
  expect(dates.map((date) => date.toISOString())).toEqual([
    "2026-12-10T10:00:00.000Z", "2027-01-14T10:00:00.000Z",
  ]);
});

test.each(["weekly", "fortnightly", "monthly"] as const)("%s recurrence returns no dates outside the requested range", (frequency) => {
  const rule = { frequency, startsAt: new Date("2026-01-29T10:00:00Z"), endsOn: "2026-02-12" };
  expect(expandRecurrence(rule, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-29T09:59:59Z"))).toEqual([]);
  expect(expandRecurrence(rule, new Date("2026-02-12T23:59:59Z"), new Date("2026-12-31T00:00:00Z"))).toEqual([]);
});
