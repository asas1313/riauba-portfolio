import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Captures reference screenshots of the key screens for the user guide
// (docs/user-guide/img/). These are documentation artefacts, not visual
// regression assertions: regenerate by re-running this spec whenever the
// home or 404 page's look changes. Each test still carries a light
// assertion so a broken page (e.g. a 500 instead of a render) fails CI
// instead of silently producing a screenshot of an error page.
const imgDir = fileURLToPath(
  new URL("../../docs/user-guide/img/", import.meta.url),
);

test.describe("documentation screenshots", () => {
  test("home page, light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}home-light.png`,
      fullPage: true,
    });
  });

  test("home page, dark scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}home-dark.png`,
      fullPage: true,
    });
  });

  test("404 page", async ({ page }) => {
    const response = await page.goto("/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}404-page.png`,
      fullPage: true,
    });
  });
});
