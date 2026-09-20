import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Ministry A" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await page.waitForURL(/\/(welcome|profile)(?:\?|$)/);
  if (page.url().includes("/welcome")) await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function createMeetup(page: Page) {
  await page.goto("/meetups/new");
  await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "coffee" });
  await page.getByRole("combobox", { name: "Place", exact: true }).selectOption("virtual");
  await page.getByLabel("Virtual Place URL").fill("https://meet.example/moderation");
  await page.getByRole("button", { name: "Create Meetup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manage Meetup", exact: true })).toBeVisible();
  return page.url();
}

test("Members Flag privately and an Organisation Admin resolves, cancels, suspends and reinstates", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Morgan Host", "morgan@ministry-a.example");
  const meetupUrl = await createMeetup(page);
  const reporterContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const reporter = await reporterContext.newPage();
    await signIn(reporter, "Riley Reporter", "riley@ministry-a.example");
    await reporter.goto("/members");
    await reporter.getByRole("link", { name: "Morgan Host", exact: true }).click();
    await reporter.getByText("Flag this Member", { exact: true }).click();
    await reporter.getByLabel("Reason for this Flag").fill("Repeated unwanted contact.");
    await reporter.getByRole("button", { name: "Send Flag", exact: true }).click();
    await expect(reporter.getByRole("status")).toHaveText("Flag sent to your Organisation Admin.");
    await reporter.goto(meetupUrl);
    await reporter.getByRole("button", { name: "Join Meetup", exact: true }).click();
    await reporter.getByText("Flag this Meetup", { exact: true }).click();
    await reporter.getByLabel("Reason for this Flag").fill("Unsafe Meetup arrangements.");
    await reporter.getByRole("button", { name: "Send Flag", exact: true }).click();
    await expect(reporter.getByText("Flag sent to your Organisation Admin.", { exact: true })).toBeVisible();
    expect((await reporter.goto("/admin/moderation"))!.status()).toBe(404);
    await page.reload();
    await expect(page.getByText("Unsafe Meetup arrangements.", { exact: true })).toHaveCount(0);

    const admin = await adminContext.newPage();
    await signIn(admin, "Olivia Admin", "olivia@ministry-a.example");
    await admin.goto("/admin/moderation");
    const flag = admin.getByRole("article").filter({ hasText: "Repeated unwanted contact." });
    await expect(flag).toContainText("Riley Reporter");
    await flag.getByLabel("Resolution note").fill("Discussed expectations with the Member.");
    await flag.getByRole("button", { name: "Resolve Flag", exact: true }).click();
    await expect(flag).toHaveCount(0);
    await admin.getByRole("link", { name: "Resolved Flags", exact: true }).click();
    await expect(admin.getByText("Discussed expectations with the Member.", { exact: true })).toBeVisible();
    await admin.getByRole("link", { name: "Open Flags", exact: true }).click();
    const occurrence = admin.getByRole("article").filter({ has: admin.getByRole("heading", { name: "coffee · Meetup", exact: true }) }).filter({ hasText: "Morgan Host" });
    await occurrence.getByRole("button", { name: "Cancel Meetup", exact: true }).click();
    await expect(occurrence).toHaveCount(0);
    await reporter.goto(meetupUrl);
    await expect(reporter.getByText("This Meetup has been cancelled.", { exact: true })).toBeVisible();
    const nextMeetupUrl = await createMeetup(page);
    await admin.reload();
    const member = admin.getByRole("article").filter({ has: admin.getByRole("heading", { name: "Morgan Host", exact: true }) });
    await member.getByRole("button", { name: "Suspend Member", exact: true }).click();
    await expect(member.getByText("Status: suspended", { exact: true })).toBeVisible();
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in/);
    await reporter.goto(nextMeetupUrl);
    await expect(reporter.getByText("This Meetup has been cancelled.", { exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Reinstate Member", exact: true }).click();
    await expect(member.getByText("Status: active", { exact: true })).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Morgan Host", exact: true })).toBeVisible();
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await reporterContext.close();
    await adminContext.close();
  }
});
