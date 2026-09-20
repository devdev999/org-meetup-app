import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string, email: string) {
  await page.goto("/sign-in/ministry-a");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await page.waitForURL(/\/(welcome|profile)(?:\?|$)/);
  if (page.url().includes("/welcome")) await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("reports filter and export every table while Platform Admin audit hides viewed Members", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Olivia Admin", "olivia@ministry-a.example");
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Through", { exact: true }).fill("2099-12-31");
  await page.getByRole("button", { name: "Update reports", exact: true }).click();
  await expect(page).toHaveURL(/from=2020-01-01.*to=2099-12-31/);
  await expect(page.getByText("Current Active Members and current Departments and Sites; confirmed Attendance in the selected period.", { exact: true })).toHaveCount(2);
  const exports = page.getByRole("link", { name: /^Export .* as CSV$/ });
  await expect(exports).toHaveCount(12);
  for (const link of await exports.all()) {
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain('"From","2020-01-01"');
  }
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export Participation by Department as CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("participation-departments-2020-01-01-2099-12-31.csv");
  await page.getByRole("combobox", { name: "Member", exact: true }).selectOption({ label: "Meetup Participant, meetup-attendance-participant@ministry-a.example" });
  const memberId = await page.getByRole("combobox", { name: "Member", exact: true }).inputValue();
  await page.getByRole("button", { name: "View Member report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Member report", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "meetup-attendance-participant@ministry-a.example", exact: true })).toBeVisible();
  for (const link of await page.getByRole("link", { name: /^Export .* as CSV$/ }).all()) {
    expect((await page.request.get((await link.getAttribute("href"))!)).status()).toBe(200);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/admin/audit");
  await expect(page.getByRole("cell", { name: "member-report-export", exact: true }).first()).toBeVisible();
  await expect(page.getByText(memberId, { exact: false }).first()).toBeVisible();

  const platformContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const platform = await platformContext.newPage();
    await signIn(platform, "Pat Platform", "pat@ministry-a.example");
    await platform.getByRole("link", { name: "Open Platform Admin area", exact: true }).click();
    await expect(platform.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
    await expect(platform.getByRole("cell").filter({ hasText: "Olivia Admin" }).first()).toBeVisible();
    expect(await platform.locator("body").innerText()).not.toContain(memberId);
    expect(await platform.locator("body").innerText()).not.toContain("meetup-attendance-participant@ministry-a.example");
    const csv = await platform.request.get("/platform/audit/export");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Olivia Admin");
    expect(await csv.text()).not.toContain(memberId);
    expect((await platform.request.get(`/admin/reports/export?memberId=${memberId}&table=member-profile&from=2020-01-01&to=2099-12-31`)).status()).toBe(404);
    expect(await platform.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await platformContext.close(); }
});
