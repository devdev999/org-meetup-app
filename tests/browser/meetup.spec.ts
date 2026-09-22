import { expect, test, type Page } from "@playwright/test";

async function signIn(
  page: Page,
  name: string,
  email: string,
  department: string,
) {
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
  await page
    .getByRole("combobox", { name: "Stance", exact: true })
    .selectOption(stance);
  await page.getByRole("button", { name: "Preview Interest" }).click();
  await expect(
    page.getByRole("heading", { name: "Your Interest will be listed as SQL" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Interest" }).click();
  await expect(
    page.getByText("Interest saved.", { exact: true }),
  ).toBeVisible();
}

test("Members create a recurring Meetup, join its series, answer RSVP and stop future occurrences", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Evie Host", "evie@ministry-a.example", "Finance");
  await page.goto("/meetups/new");
  await page
    .getByRole("combobox", { name: "Activity", exact: true })
    .selectOption({ label: "walk" });
  await page
    .getByRole("combobox", { name: "Repeats", exact: true })
    .selectOption("weekly");
  await page
    .getByLabel("Start time in UTC")
    .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await page
    .getByLabel("Series end date in UTC, optional")
    .fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel("Spot at the Site").fill("Main entrance");
  await page.getByLabel("Capacity, including the Host").fill("2");
  await page
    .getByRole("button", { name: "Create Meetup", exact: true })
    .click();
  await expect(
    page.getByText("Choose a future start time.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Repeats", exact: true }),
  ).toHaveValue("weekly");
  await expect(page.getByLabel("Spot at the Site")).toHaveValue(
    "Main entrance",
  );
  await page
    .getByLabel("Start time in UTC")
    .fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page
    .getByRole("button", { name: "Create Meetup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recurring Meetup", exact: true }),
  ).toBeVisible();
  const meetupUrl = page.url();
  const second = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const finn = await second.newPage();
    await signIn(finn, "Finn Member", "finn@ministry-a.example", "Legal");
    await finn.goto(meetupUrl);
    await finn
      .getByRole("button", { name: "Join series", exact: true })
      .click();
    await expect(
      finn.getByText("You are a standing Participant.", { exact: true }),
    ).toBeVisible();
    await finn.getByRole("button", { name: "Not going", exact: true }).click();
    await expect(
      finn.getByText("Your RSVP: Not going.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByRole("heading", { name: "RSVP answers", exact: true })
        .locator(".."),
    ).toContainText("1 not going");
    await expect(
      page.getByText("1 of 2 places filled", { exact: false }),
    ).toBeVisible();
    await finn.getByRole("button", { name: "Going", exact: true }).click();
    await expect(
      finn.getByText("Your RSVP: Going.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("2 of 2 places filled", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Stop series", exact: true })
      .click();
    await expect(
      page.getByText("This Meetup has been cancelled.", { exact: true }),
    ).toBeVisible();
    await finn.reload();
    await expect(
      finn.getByText("This Meetup has been cancelled.", { exact: true }),
    ).toBeVisible();
    await expect(
      finn.getByRole("button", { name: "Going", exact: true }),
    ).toHaveCount(0);
  } finally {
    await second.close();
  }
});

test("Members sign in, declare Interests, create a Meetup and join from Suggestions", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, "Ana Host", "ana@ministry-a.example", "Finance");
  await declareSql(page, "seeks");
  await page.goto("/meetups/new");
  await page
    .getByRole("combobox", { name: "Add a relevant Interest", exact: true })
    .selectOption({ label: "SQL" });
  await page
    .getByRole("combobox", { name: "Activity", exact: true })
    .selectOption({ label: "coffee" });
  await page
    .getByLabel("Start time in UTC")
    .fill(
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    );
  await page.getByLabel("Spot at the Site").fill("Ground floor cafe");
  await page
    .getByLabel("Description, optional")
    .fill("Practice Python over coffee.");
  await expect(
    page.getByRole("button", { name: "Remove New Skill: Python", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove SQL", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Meetup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Manage Meetup" }),
  ).toBeVisible();
  const meetupUrl = page.url();
  await expect(
    page
      .getByRole("heading", { name: "Relevant Interests" })
      .locator("..")
      .getByRole("listitem"),
  ).toHaveText(["Python", "SQL"]);

  const second = await browser.newContext({ baseURL });
  try {
    const bo = await second.newPage();
    await signIn(bo, "Bo Member", "bo@ministry-a.example", "Legal");
    await declareSql(bo, "shares");
    await bo.goto("/");
    await bo
      .getByRole("searchbox", { name: "Search Meetups" })
      .fill("no-such-place");
    await bo.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      bo.getByRole("heading", { name: "No Meetups match these filters." }),
    ).toBeVisible();
    await bo.getByRole("link", { name: "Clear filters", exact: true }).click();
    await bo
      .getByRole("searchbox", { name: "Search Meetups" })
      .fill("Ground floor cafe");
    await bo.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      bo
        .getByRole("listitem")
        .filter({ has: bo.getByRole("link", { name: "coffee", exact: true }) })
        .getByText("Relevant Interests: SQL.", { exact: false }),
    ).toBeVisible();
    await bo.getByRole("link", { name: "coffee", exact: true }).click();
    await expect(bo).toHaveURL(meetupUrl);
    await bo.getByRole("button", { name: "Join Meetup", exact: true }).click();
    await expect(
      bo.getByText("You joined this Meetup.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByRole("heading", { name: "Participants", exact: true })
        .locator("..")
        .getByRole("listitem"),
    ).toHaveText(["Ana Host, Host", "Bo Member"]);
    await bo.goto("/");
    await expect(
      bo.getByText("No Meetups to suggest yet.", { exact: true }),
    ).toBeVisible();
    await bo.goto(meetupUrl);
    await bo.getByRole("button", { name: "Leave Meetup", exact: true }).click();
    await expect(
      bo.getByRole("button", { name: "Join Meetup", exact: true }),
    ).toBeVisible();
    await page.goto(`${meetupUrl}/edit`);
    await page
      .getByRole("button", { name: "Remove Python", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page
        .getByRole("heading", { name: "Relevant Interests" })
        .locator("..")
        .getByRole("listitem"),
    ).toHaveText(["SQL"]);
    await page.goto(`${meetupUrl}/edit`);
    await page
      .getByRole("button", { name: "Invite Bo Member", exact: true })
      .click();
    await expect(page.getByText("Invite sent.", { exact: true })).toBeVisible();
    await bo.reload();
    await expect(
      bo.getByText("Your Invite is pending.", { exact: true }),
    ).toBeVisible();
    await bo
      .getByRole("button", { name: "Decline Invite", exact: true })
      .click();
    await expect(
      bo.getByText("Your Invite is declined.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Invite Bo Member", exact: true })
      .click();
    await expect(page.getByText("Invite sent.", { exact: true })).toBeVisible();
    await bo.reload();
    await expect(
      bo.getByText("Your Invite is pending.", { exact: true }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
  await page.goto("/interests");
  await expect(
    page.getByRole("combobox", { name: "Stance for SQL" }),
  ).toHaveValue("seeks");
  await expect(
    page.getByRole("combobox", { name: "Stance for Python" }),
  ).toHaveCount(0);
});

test("Availability only creates a Meetup and Invite after the prefilled form is confirmed", async ({
  page,
  browser,
  baseURL,
}) => {
  await signIn(page, "Cy Member", "cy@ministry-a.example", "Finance");
  const second = await browser.newContext({ baseURL });
  try {
    const di = await second.newPage();
    await signIn(di, "Di Member", "di@ministry-a.example", "Legal");
    const midnight = new Date();
    midnight.setUTCHours(24, 0, 0, 0);
    const untilMidnight = midnight.getTime() - Date.now();
    if (untilMidnight < 60_000) {
      test.setTimeout(120_000);
      await new Promise((resolve) => setTimeout(resolve, untilMidnight + 100));
      midnight.setUTCHours(24, 0, 0, 0);
    }
    const overlapStart = `${new Date().toISOString().slice(0, 10)}T00:00`;
    for (const actor of [page, di]) {
      await actor.goto("/availability");
      await actor
        .getByRole("combobox", { name: "Activity", exact: true })
        .selectOption({ label: "walk" });
      await actor.getByLabel("Available from, UTC").fill(overlapStart);
      await actor
        .getByRole("combobox", { name: "Place setting", exact: true })
        .selectOption("virtual");
      await actor.getByLabel("Available until, UTC").fill(overlapStart);
      await actor
        .getByRole("button", { name: "Post Availability", exact: true })
        .click();
      await expect(
        actor.getByText("Choose a window today in UTC that has not ended.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        actor
          .getByRole("combobox", { name: "Activity", exact: true })
          .locator("option:checked"),
      ).toHaveText("walk");
      await expect(
        actor.getByRole("combobox", { name: "Place setting", exact: true }),
      ).toHaveValue("virtual");
      await actor
        .getByRole("combobox", { name: "Place setting", exact: true })
        .selectOption("physical");
      await actor
        .getByLabel("Available until, UTC")
        .fill(midnight.toISOString().slice(0, 16));
      await actor
        .getByRole("button", { name: "Post Availability", exact: true })
        .click();
      await expect(
        actor.getByText("Availability posted for walk,", { exact: false }),
      ).toBeVisible();
    }
    await page.reload();
    await page
      .getByRole("link", { name: "Plan a Meetup with Di Member" })
      .click();
    await expect(
      page
        .getByRole("combobox", { name: "Activity", exact: true })
        .locator("option:checked"),
    ).toHaveText("walk");
    await expect(page.getByLabel("Spot at the Site")).toHaveValue("");
    await expect(
      page
        .getByRole("combobox", { name: "Site", exact: true })
        .locator("option:checked"),
    ).toHaveText("Harbour House");
    await expect(
      page.getByRole("combobox", { name: "Audience", exact: true }),
    ).toHaveValue("default");
    await expect(page.getByLabel("Start time in UTC")).toHaveValue(
      overlapStart,
    );
    const prefilledUrl = page.url();
    await page.getByRole("link", { name: "Back to Meetups" }).click();
    await expect(
      page.getByRole("link", { name: "walk", exact: true }),
    ).toHaveCount(0);
    await di.goto("/inbox");
    await expect(
      di.getByRole("link", { name: "View Meetup", exact: true }),
    ).toHaveCount(0);
    await expect(
      di.getByRole("link", { name: "View Availability", exact: true }),
    ).toHaveCount(1);
    await page.goto(prefilledUrl);
    await page
      .getByRole("button", { name: "Create Meetup", exact: true })
      .click();
    await expect(page).toHaveURL(prefilledUrl);
    await page.getByLabel("Spot at the Site").fill("Harbour House entrance");
    await page.getByLabel("Duration in minutes").fill("20");
    await page.getByLabel("Capacity, including the Host").fill("3");
    await page
      .getByRole("button", { name: "Create Meetup", exact: true })
      .click();
    await expect(
      page.getByText("Choose a future start time.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Spot at the Site")).toHaveValue(
      "Harbour House entrance",
    );
    await expect(page.getByLabel("Duration in minutes")).toHaveValue("20");
    await expect(page.getByLabel("Capacity, including the Host")).toHaveValue(
      "3",
    );
    await page
      .getByLabel("Start time in UTC")
      .fill(new Date(Date.now() + 30_000).toISOString().slice(0, 19));
    await page
      .getByRole("button", { name: "Create Meetup", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Manage Meetup" }),
    ).toBeVisible();
    const meetupUrl = page.url();
    await di.goto(meetupUrl);
    await expect(
      di.getByText("Your Invite is pending.", { exact: true }),
    ).toBeVisible();
    await expect(
      di.getByText("Harbour House, Harbour House entrance", { exact: true }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});
