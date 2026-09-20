import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Ministry A" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Department").fill("Finance");
  await page.getByLabel("Site").fill("Harbour House");
  await page.getByRole("button", { name: "Sign in as this person" }).click();
  await page.waitForURL(/\/(welcome|profile)(?:\?|$)/);
  if (page.url().includes("/welcome")) await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("Members propose an Event with editable Interests and an admin publishes its recurring occurrences", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Paige Proposer", "paige@ministry-a.example");
  await page.goto("/events/new");
  await expect(page.getByRole("heading", { name: "Propose an Event", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "learning session" });
  await page.getByLabel("Start time in UTC").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page.getByLabel("Spot at the Site").fill("Main room");
  await expect(page.getByLabel("Capacity, including the Host, optional")).toHaveValue("");
  await page.getByRole("combobox", { name: "Repeats", exact: true }).selectOption("weekly");
  await page.getByRole("combobox", { name: "Add a relevant Interest", exact: true }).selectOption({ label: "SQL" });
  await page.getByLabel("Description, optional").fill("Practice Rust in a lunchtime talk.");
  await expect(page.getByRole("button", { name: "Remove Rust", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove SQL", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit Event proposal", exact: true }).click();
  await expect(page.getByText("State: proposed", { exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const admin = await adminContext.newPage();
    await signIn(admin, "Olivia Admin", "olivia@ministry-a.example");
    await admin.goto("/admin/events");
    const proposal = admin.getByRole("article").filter({ hasText: "Paige Proposer" });
    await proposal.getByRole("button", { name: "Approve Event", exact: true }).click();
    await expect(admin.getByText("Event approved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("State: approved", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View Event", exact: true }).click();
    await expect(page.getByText("Organisation Event", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recurring Event", exact: true })).toBeVisible();
    await expect(page.getByText("1 Participant. No capacity limit.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Relevant Interests", exact: true }).locator("..")).toContainText("Rust");
    await admin.goto(page.url());
    await admin.getByRole("button", { name: "Join series", exact: true }).click();
    await admin.getByRole("button", { name: "Not going", exact: true }).click();
    await expect(admin.getByText("Your RSVP: Not going.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "RSVP answers", exact: true }).locator("..")).toContainText("1 not going");
  } finally {
    await adminContext.close();
  }
});

test("admins reject with a note, create an Event during extraction failure, invite a Member and reassign its Host", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Dan Proposer", "dan@ministry-a.example");
  await page.goto("/events/new");
  await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "coffee" });
  await page.getByLabel("Spot at the Site").fill("Review room");
  await page.getByRole("button", { name: "Submit Event proposal", exact: true }).click();
  await expect(page.getByText("State: proposed", { exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const admin = await adminContext.newPage();
    await signIn(admin, "Olivia Admin", "olivia@ministry-a.example");
    await admin.goto("/admin/events");
    const proposal = admin.getByRole("article").filter({ hasText: "Dan Proposer" });
    await proposal.getByLabel("Note, required for rejection").fill("Please choose a later date.");
    await proposal.getByRole("button", { name: "Reject Event", exact: true }).click();
    await expect(admin.getByText("Event rejected. The proposer can read your note.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("State: rejected", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin note: Please choose a later date.", { exact: true })).toBeVisible();
    await admin.route("**/api/event-interests", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
    await admin.goto("/admin/events/new");
    await admin.getByRole("combobox", { name: "Add a relevant Interest", exact: true }).selectOption({ label: "SQL" });
    await admin.getByRole("combobox", { name: "Activity", exact: true }).selectOption({ label: "walk" });
    await admin.getByLabel("Spot at the Site").fill("Main entrance");
    await admin.getByLabel("Capacity, including the Host, optional").fill("2");
    await expect(admin.getByText("Automatic Interests are unavailable. Choose manually or create without them.", { exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Remove SQL", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Create Event", exact: true }).click();
    await expect(admin.getByRole("heading", { name: "Manage Event", exact: true })).toBeVisible();
    const eventUrl = admin.url();
    await admin.getByRole("link", { name: "Edit Event", exact: true }).click();
    await admin.getByLabel("Spot at the Site").fill("Side entrance");
    await admin.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(admin.getByText("Harbour House, Side entrance", { exact: true })).toBeVisible();
    await admin.getByRole("link", { name: "Invite a Member", exact: true }).click();
    await admin.getByLabel("Member name", { exact: true }).fill("Dan Proposer");
    await admin.getByRole("button", { name: "Search Members", exact: true }).click();
    await admin.getByRole("combobox", { name: "Member to invite", exact: true }).selectOption({ label: "Dan Proposer, Finance, Harbour House" });
    await admin.getByRole("button", { name: "Send Invite", exact: true }).click();
    await expect(admin.getByText("Invite sent.", { exact: true })).toBeVisible();
    await page.goto("/inbox");
    await page.getByRole("link", { name: "View Event", exact: true }).click();
    await expect(page).toHaveURL(eventUrl);
    await page.getByRole("button", { name: "Accept Invite", exact: true }).click();
    await expect(page.getByText("You joined this Event.", { exact: true })).toBeVisible();
    await admin.goto("/admin/events");
    const published = admin.getByRole("article").filter({ has: admin.getByRole("heading", { name: "walk", exact: true }) });
    await published.getByRole("button", { name: "Reassign Event Host", exact: true }).click();
    await published.getByRole("combobox", { name: "New Event Host", exact: true }).selectOption({ label: "Dan Proposer" });
    await published.getByRole("button", { name: "Reassign Event Host", exact: true }).click();
    await expect(published.getByText("Event Host reassigned.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Manage Event", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await adminContext.close();
  }
});
