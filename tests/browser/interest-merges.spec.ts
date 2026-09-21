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

async function declare(page: Page, name: string, stance: "shares" | "seeks") {
  await page.goto("/interests");
  await page.getByLabel("Interest", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Stance", exact: true }).selectOption(stance);
  await page.getByRole("button", { name: "Preview Interest", exact: true }).click();
  await page.getByRole("combobox", { name: "Confirm or choose another Interest" }).selectOption("original");
  await page.getByRole("button", { name: "Confirm Interest", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Interest saved.");
}

test("Organisation Admins merge, split and edit Interests while preserving a Member's later Stance and removal", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Mina Interests", "mina-interests@ministry-a.example");
  await declare(page, "Rust", "shares");
  await declare(page, "rustlang", "seeks");
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const admin = await adminContext.newPage();
    await signIn(admin, "Olivia Admin", "olivia@ministry-a.example");
    await admin.goto("/admin");
    await admin.getByRole("link", { name: "Interests", exact: true }).click();
    await admin.getByRole("button", { name: "Find duplicate Interests", exact: true }).click();
    await expect(admin.getByRole("status")).toHaveText("Duplicate check complete. Review any proposals below.");
    const queue = admin.getByRole("region", { name: "Merge proposals", exact: true });
    await queue.getByRole("combobox", { name: "Surviving Interest", exact: true }).selectOption({ label: "rustlang" });
    await queue.getByRole("button", { name: "Approve merge", exact: true }).click();
    await expect(queue).toContainText("No merge proposals to review.");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Stance for rustlang", exact: true })).toHaveValue("seeks");
    await expect(page.getByRole("combobox", { name: "Stance for Rust", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Save Stance", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    const history = admin.getByRole("region", { name: "Merge history", exact: true });
    await history.getByRole("button", { name: "Split merge", exact: true }).click();
    await expect(history.getByRole("button", { name: "Split merge", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Stance for rustlang", exact: true })).toHaveValue("seeks");
    await expect(page.getByRole("combobox", { name: "Stance for Rust", exact: true })).toHaveCount(0);
    await admin.getByText("Edit rustlang", { exact: true }).click();
    const editor = admin.locator("details").filter({ has: admin.getByText("Edit rustlang", { exact: true }) });
    await editor.getByLabel("Interest name", { exact: true }).fill("Browser code puzzles");
    await editor.getByRole("combobox", { name: "Kind", exact: true }).selectOption("hobby");
    await editor.getByRole("button", { name: "Save Interest", exact: true }).click();
    await expect(admin.getByText("Edit Browser code puzzles", { exact: true })).toBeVisible();
    await page.reload();
    const hobbies = page.getByRole("heading", { name: "Hobbies", exact: true }).locator("..");
    await expect(hobbies).toContainText("Browser code puzzles");
    await page.getByRole("button", { name: "Remove Browser code puzzles", exact: true }).click();
    await expect(hobbies).toContainText("None declared.");
    for (const screen of [page, admin]) expect(await screen.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await page.goto("/admin/interests"))?.status()).toBe(404);
  } finally {
    await adminContext.close();
  }
});
