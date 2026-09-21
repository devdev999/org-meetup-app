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

test("a Member asks Scout, continues the conversation and follows a profile link", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Maya Scout", "maya-scout@ministry-a.example");
  await page.goto("/interests");
  await page.getByLabel("Interest", { exact: true }).fill("Rust");
  await page.getByRole("button", { name: "Preview Interest", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Interest", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Interest saved.");
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const asker = await context.newPage();
    await signIn(asker, "Ana Scout", "ana-scout@ministry-a.example");
    await asker.goto("/");
    await asker.getByRole("link", { name: "Scout", exact: true }).click();
    await asker.getByLabel("Question", { exact: true }).fill("Who Shares Rust?");
    await asker.getByRole("button", { name: "Ask Scout", exact: true }).click();
    const conversation = asker.getByRole("region", { name: "Scout conversation", exact: true });
    await expect(conversation).toContainText("Maya Scout matches your Interest search.");
    await asker.getByLabel("Question", { exact: true }).fill("Where can I see their Interests?");
    await asker.getByRole("button", { name: "Ask Scout", exact: true }).click();
    await expect(conversation.getByRole("heading", { name: "Scout", exact: true })).toHaveCount(2);
    expect(await asker.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await conversation.getByRole("link", { name: "Maya Scout", exact: true }).last().click();
    await expect(asker.getByRole("heading", { name: "Maya Scout", exact: true })).toBeVisible();
    await expect(asker.getByText("Shares", { exact: true })).toBeVisible();
    await asker.goto("/scout");
    await asker.getByLabel("Question", { exact: true }).fill("Join a Meetup for me.");
    await asker.getByRole("button", { name: "Ask Scout", exact: true }).click();
    await expect(conversation).toContainText("Open the relevant screen to take that action yourself.");
    await asker.getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(conversation).toContainText("Ask your first question.");
    await asker.getByLabel("Question", { exact: true }).fill('<img src="x" onerror="alert(1)">');
    await asker.getByRole("button", { name: "Ask Scout", exact: true }).click();
    await expect(conversation).toContainText('<img src="x" onerror="alert(1)">');
    await expect(conversation.locator("img")).toHaveCount(0);
    await asker.getByLabel("Question", { exact: true }).fill(" ");
    await asker.getByRole("button", { name: "Ask Scout", exact: true }).click();
    await expect(asker.getByRole("main").getByRole("alert")).toContainText("Enter a question of up to 2,000 characters.");
    await asker.getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(conversation).toContainText("Ask your first question.");
  } finally {
    await context.close();
  }
});
