import { expect, test, type Page } from "@playwright/test";
import type { seedAttendance } from "./attendance-fixture";

const fixtures: Awaited<ReturnType<typeof seedAttendance>> = JSON.parse(process.env.ATTENDANCE_FIXTURES ?? "[]");
if (fixtures.length !== 2) throw new Error("Run Attendance browser tests through pnpm test:browser to seed both kinds.");

async function signIn(page: Page, person: { name: string; email: string }) {
  await page.goto("/sign-in/ministry-a");
  await page.getByLabel("Email", { exact: true }).fill(person.email);
  await page.getByLabel("Name", { exact: true }).fill(person.name);
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await expect(page.getByRole("heading", { name: person.name, exact: true })).toBeVisible();
}

for (const fixture of fixtures) test(`${fixture.kind} Attendance, Connections, ratings and amendments stay private in the browser`, async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, fixture.host);
  const path = `/${fixture.kind === "event" ? "events" : "meetups"}/${fixture.id}`;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: fixture.host.name, exact: true }).check();
  await page.getByRole("checkbox", { name: fixture.participant.name, exact: true }).check();
  await page.getByRole("button", { name: "Confirm Attendance", exact: true }).click();
  await expect(page.getByText("Your Attendance: Came.", { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const participant = await context.newPage();
    await signIn(participant, fixture.participant);
    await participant.goto("/connections");
    await expect(participant.getByRole("heading", { name: fixture.host.name, exact: true })).toBeVisible();
    await participant.getByRole("link", { name: "coffee", exact: true }).click();
    await expect(participant.getByRole("checkbox")).toHaveCount(0);
    await participant.getByRole("button", { name: "Rate 4 of 5", exact: true }).click();
    await expect(participant.getByText("Your rating was recorded.", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: fixture.participant.name, exact: true }).uncheck();
    const amendment = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save amended Attendance", exact: true }).click();
    expect((await amendment).ok()).toBe(true);
    await expect(page.getByRole("checkbox", { name: fixture.participant.name, exact: true })).not.toBeChecked();
    await participant.goto("/attendance");
    await expect(participant.getByText("Your Attendance: No-show.", { exact: true })).toBeVisible();
    await participant.goto("/connections");
    await expect(participant.getByText("No Connections recorded yet.", { exact: true })).toBeVisible();
    await signIn(participant, { name: "Olivia Admin", email: "olivia@ministry-a.example" });
    await participant.goto("/admin/attendance");
    await participant.getByRole("combobox", { name: "Member", exact: true }).selectOption({ label: fixture.participant.name });
    await participant.getByRole("button", { name: "View Attendance", exact: true }).click();
    await expect(participant.getByText("Attendance: No-show.", { exact: true })).toBeVisible();
    await expect(participant.getByRole("cell", { name: "4.00", exact: true })).toBeVisible();
  } finally { await context.close(); }
});
