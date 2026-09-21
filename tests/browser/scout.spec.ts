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
    await expect(conversation).toContainText('<img src="x" onerror="alert(1)">');
    await expect(asker.getByLabel("Question", { exact: true })).toHaveValue(" ");
    await asker.getByRole("button", { name: "New conversation", exact: true }).click();
    await expect(conversation).toContainText("Ask your first question.");
  } finally {
    await context.close();
  }
});

test("an Organisation Admin asks Scout about duplicates, unshared Seeks and report figures", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Olivia Admin", "olivia@ministry-a.example");
  for (const [name, stance] of [["SQL", "shares"], ["Structured Query Language", "shares"], ["Scout pottery", "seeks"]]) {
    await page.goto("/interests");
    await page.getByLabel("Interest", { exact: true }).fill(name!);
    await page.getByRole("combobox", { name: "Stance", exact: true }).selectOption(stance!);
    await page.getByRole("button", { name: "Preview Interest", exact: true }).click();
    await page.getByRole("combobox", { name: "Confirm or choose another Interest" }).selectOption("original");
    await page.getByRole("button", { name: "Confirm Interest", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Interest saved.");
  }
  await page.goto("/admin/interests");
  await page.getByRole("button", { name: "Find duplicate Interests", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Duplicate check complete. Review any proposals below.");
  await page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Scout", exact: true }).click();
  await expect(page.getByText("As an Organisation Admin, you can also ask about duplicate Interests, Seeks with no Shares, and report figures.", { exact: true })).toBeVisible();
  const conversation = page.getByRole("region", { name: "Scout conversation", exact: true });
  await page.getByLabel("Question", { exact: true }).fill("Show the Interest merge queue.");
  await page.getByRole("button", { name: "Ask Scout", exact: true }).click();
  await expect(conversation).toContainText("Structured Query Language");
  await conversation.getByRole("link", { name: "Interest merge queue", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/interests#interest-merge-queue$/);
  await expect(page.getByRole("region", { name: "Merge proposals", exact: true })).toContainText("Structured Query Language");

  await page.goto("/scout");
  await page.getByLabel("Question", { exact: true }).fill("What do people Seek that nobody Shares?");
  await page.getByRole("button", { name: "Ask Scout", exact: true }).click();
  await expect(conversation).toContainText("Scout pottery: 1 Seeks and no Shares.");
  await conversation.getByRole("link", { name: "Interest list", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/interests#interest-catalog$/);
  await expect(page.getByText("Edit Scout pottery", { exact: true })).toBeVisible();

  await page.goto("/scout");
  await page.getByLabel("Question", { exact: true }).fill("Show headline figures from 2020-01-01 through 2099-12-31.");
  await page.getByRole("button", { name: "Ask Scout", exact: true }).click();
  await expect(conversation).toContainText("Reports from 2020-01-01 through 2099-12-31, UTC.");
  await expect(conversation).toContainText("Current Active Members, independent of the selected period.");
  const answer = await conversation.innerText();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await conversation.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports\?from=2020-01-01&to=2099-12-31$/);
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2020-01-01");
  await expect(page.getByLabel("Through", { exact: true })).toHaveValue("2099-12-31");
  const activeMembers = await page.getByRole("region", { name: "Telegram linkage", exact: true }).locator("tbody tr td").nth(1).innerText();
  expect(answer).toContain(`Active Members: ${activeMembers}`);
});
