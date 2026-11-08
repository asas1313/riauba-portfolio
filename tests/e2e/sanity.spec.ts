import { expect, test } from "@playwright/test";

test("playwright wiring serves the home page", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
});
