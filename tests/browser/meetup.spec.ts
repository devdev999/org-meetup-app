import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string, email: string, department: string) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Ministry A" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Department").fill(department);
  await page.getByLabel("Site").fill("Harbour House");
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function declareSql(page: Page, stance: "shares" | "seeks") {
  await page.getByRole("link", { name: "Your Interests", exact: true }).click();
  await page.getByLabel("Interest", { exact: true }).fill("SQL");
  await page.getByRole("combobox", { name: "Stance", exact: true }).selectOption(stance);
  await page.getByRole("button", { name: "Preview Interest" }).click();
  await expect(page.getByRole("heading", { name: "Your Interest will be listed as SQL" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Interest" }).click();
  await expect(page.getByText("Interest saved.", { exact: true })).toBeVisible();
}

test("Members sign in, declare Interests, create a Meetup and join from Suggestions", async ({ page, browser, baseURL }) => {
  await signIn(page, "Ana Host", "ana@ministry-a.example", "Finance");
  await declareSql(page, "seeks");
  await page.goto("/meetups/new");
  await page.getByRole("combobox", { name: "Add a relevant Interest", exact: true }).selectOption({ label: "SQL" });
  await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "coffee" });
  await page.getByLabel("Start time in UTC").fill(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await page.getByLabel("Spot at the Site").fill("Ground floor cafe");
  await page.getByLabel("Description, optional").fill("Practice Python over coffee.");
  await expect(page.getByRole("button", { name: "Remove New Skill: Python", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove SQL", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove New Skill: Python", exact: true }).click();
  await page.getByRole("button", { name: "Create Meetup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manage Meetup" })).toBeVisible();
  const meetupUrl = page.url();
  await expect(page.getByRole("heading", { name: "Relevant Interests" }).locator("..").getByRole("listitem")).toHaveText(["SQL"]);

  const second = await browser.newContext({ baseURL });
  try {
    const bo = await second.newPage();
    await signIn(bo, "Bo Member", "bo@ministry-a.example", "Legal");
    await declareSql(bo, "shares");
    await bo.goto("/");
    await expect(bo.getByText("Relevant Interests: SQL.", { exact: false })).toBeVisible();
    await bo.getByRole("link", { name: "coffee", exact: true }).click();
    await expect(bo).toHaveURL(meetupUrl);
    await bo.getByRole("button", { name: "Join Meetup", exact: true }).click();
    await expect(bo.getByText("You joined this Meetup.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Participants", exact: true }).locator("..").getByRole("listitem")).toHaveText(["Ana Host, Host", "Bo Member"]);
    await bo.goto("/");
    await expect(bo.getByText("No Meetups to suggest yet.", { exact: true })).toBeVisible();
  } finally {
    await second.close();
  }
  await page.goto("/interests");
  await expect(page.getByRole("combobox", { name: "Stance for SQL" })).toHaveValue("seeks");
  await expect(page.getByText("Python", { exact: true })).toHaveCount(0);
});
