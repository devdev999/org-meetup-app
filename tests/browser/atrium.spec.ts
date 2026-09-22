import { expect, test } from "@playwright/test";

test("Atrium serves its assets and withholds member navigation before sign-in", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Organisation Admin", exact: true }),
  ).toHaveCount(0);
  for (const asset of [
    "coffee.webp",
    "walk.webp",
    "games.webp",
    "workshop.webp",
    "manrope.ttf",
  ]) {
    const response = await page.request.get(`/atrium/${asset}`);
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(1000);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Ministry A", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
