import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, slug: string, name: string, email: string) {
  await page.goto(`/sign-in/${slug}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await page.waitForURL(/\/(welcome|profile)(?:\?|$)/);
  if (page.url().includes("/welcome")) await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("Platform Admin onboards Organisations, groups a Ministry and changes live settings with aggregate-only access", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "ministry-a", "Pat Platform", "pat@ministry-a.example");
  await page.getByRole("link", { name: "Open Platform Admin area", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();
  for (const [slug, name, reference] of [["browser-agency", "Browser Agency", ""], ["awaiting-agency", "Awaiting Agency", "browser-sso"]]) {
    await page.getByLabel("Organisation name", { exact: true }).fill(name!);
    await page.getByLabel("Sign-in identifier", { exact: true }).fill(slug!);
    await page.getByLabel("OIDC issuer", { exact: true }).fill(`${baseURL}/dev-idp`);
    await page.getByLabel("OIDC client ID", { exact: true }).fill("browser-client");
    await page.getByLabel("Credential reference, optional", { exact: true }).fill(reference!);
    await page.getByLabel("Admin name", { exact: true }).fill("New Agency Admin");
    await page.getByLabel("Admin email", { exact: true }).fill(`admin@${slug}.example`);
    await page.getByRole("button", { name: "Create Organisation", exact: true }).click();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card.getByText(reference ? "Sign-in awaiting OIDC credential" : "Ready for sign-in", { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const agencyContext = await browser.newContext({ baseURL });
  try {
    const agency = await agencyContext.newPage();
    await signIn(agency, "browser-agency", "New Agency Admin", "admin@browser-agency.example");
    await agency.goto("/admin/lists");
    await expect(agency.getByLabel("Activities: coffee", { exact: true })).toHaveValue("coffee");
    await expect(agency.getByLabel("Activities: learning session", { exact: true })).toHaveValue("learning session");
    expect((await agency.request.get("/platform/organisations")).status()).toBe(404);
    await page.getByRole("link", { name: "Ministries", exact: true }).click();
    await page.getByLabel("Ministry name", { exact: true }).fill("Browser Ministry");
    await page.getByRole("button", { name: "Create Ministry", exact: true }).click();
    await expect(page.getByRole("link", { name: "Browser Ministry", exact: true })).toBeVisible();
    const grouping = page.locator("section").filter({ has: page.getByRole("heading", { name: "Browser Agency", exact: true }) });
    await grouping.getByRole("combobox").selectOption({ label: "Browser Ministry" });
    await grouping.getByRole("button", { name: "Save grouping", exact: true }).click();
    await expect(grouping.getByRole("status")).toHaveText("Ministry grouping saved.");
    await expect(grouping.locator("option:checked")).toHaveText("Browser Ministry");
    await page.getByRole("link", { name: "Browser Ministry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aggregate reports", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Export .* as CSV$/ })).toHaveCount(12);
    const href = await page.getByRole("link", { name: "Export Telegram linkage as CSV", exact: true }).getAttribute("href");
    const csv = await page.request.get(href!);
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Browser Ministry");
    expect(await csv.text()).not.toContain("admin@browser-agency.example");
    expect((await page.request.get(href!.replace("table=telegram", "table=member-profile"))).status()).toBe(400);
    expect((await page.request.get("/admin/reports")).status()).toBe(404);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    const names = ["aiBaseUrl", "scoutModel", "extractionModel", "telegramBotUsername", "emailFrom", "timeZone"];
    const original = await Promise.all(names.map((name) => page.locator(`input[name="${name}"]`).inputValue()));
    try {
      await page.getByLabel("Scout model", { exact: true }).fill("browser-scout");
      await page.getByLabel("Interest extraction model", { exact: true }).fill("gpt-5.6-luna");
      await page.getByLabel("Time zone", { exact: true }).fill("Asia/Singapore");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Deployment settings saved.");
      await agency.goto("/meetups/new");
      await expect(agency.getByLabel("Start time in Asia/Singapore", { exact: true })).toBeVisible();
      const year = new Date().getUTCFullYear() + 1;
      await agency.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "coffee" });
      await agency.getByRole("combobox", { name: "Place", exact: true }).selectOption("virtual");
      await agency.getByLabel("Virtual Place URL", { exact: true }).fill("https://meet.example/calendar");
      await agency.getByLabel("Start time in Asia/Singapore", { exact: true }).fill(`${year}-01-02T00:30`);
      await agency.getByRole("button", { name: "Create Meetup", exact: true }).click();
      await expect(agency.locator("time")).toHaveAttribute("datetime", `${year}-01-01T16:30:00.000Z`);
      await expect(agency.locator("time")).toHaveText(`${year}-01-02 00:30 Asia/Singapore`);
      const inviteeContext = await browser.newContext({ baseURL });
      try {
        await signIn(await inviteeContext.newPage(), "browser-agency", "Calendar Member", "calendar@browser-agency.example");
      } finally { await inviteeContext.close(); }
      await agency.getByRole("link", { name: "Edit Meetup", exact: true }).click();
      await page.reload();
      await expect(page.getByLabel("Scout model", { exact: true })).toHaveValue("browser-scout");
      await expect(page.getByLabel("Interest extraction model", { exact: true })).toHaveValue("gpt-5.6-luna");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Deployment settings saved.");
      await agency.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(agency.getByRole("alert").filter({ hasText: "The deployment time zone changed." }))
        .toHaveText("The deployment time zone changed. Reload and review the times before saving.");
      await agency.getByRole("button", { name: "Invite Calendar Member", exact: true }).click();
      await expect(agency.getByRole("status")).toHaveText("Invite sent.");
      await expect(agency.getByLabel("Start time in Asia/Singapore", { exact: true })).toHaveValue(`${year}-01-02T00:30`);
      await agency.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(agency.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
      await expect(agency.getByRole("alert").filter({ hasText: "The deployment time zone changed." }))
        .toHaveText("The deployment time zone changed. Reload and review the times before saving.");
      await agency.reload();
      await expect(agency.getByLabel("Start time in America/New_York", { exact: true })).toHaveValue(`${year}-01-01T11:30`);
      await agency.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(agency.locator("time")).toHaveAttribute("datetime", `${year}-01-01T16:30:00.000Z`);
      for (const value of ["2026-03-08T02:30", "2026-11-01T01:30"]) {
        await agency.goto("/meetups/new");
        await agency.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "coffee" });
        await agency.getByRole("combobox", { name: "Place", exact: true }).selectOption("virtual");
        await agency.getByLabel("Virtual Place URL", { exact: true }).fill("https://meet.example/invalid-calendar");
        await agency.getByLabel("Start time in America/New_York", { exact: true }).fill(value);
        await agency.getByRole("button", { name: "Create Meetup", exact: true }).click();
        await expect(agency.getByRole("alert").filter({ hasText: "Choose a valid local time." }))
          .toHaveText("Choose a valid local time. Daylight-saving transitions can skip or repeat a time.");
        await expect(agency).toHaveURL(/\/meetups\/new$/);
      }
    } finally {
      await page.goto("/platform/settings");
      for (const [index, name] of names.entries()) await page.locator(`input[name="${name}"]`).fill(original[index]!);
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Deployment settings saved.");
    }
  } finally { await agencyContext.close(); }
});
