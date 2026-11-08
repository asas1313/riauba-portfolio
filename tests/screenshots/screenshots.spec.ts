import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Captures reference screenshots of the key screens for the user guide
// (docs/user-guide/img/). These are documentation artefacts, not visual
// regression assertions: regenerate by re-running this spec (via
// `npm run capture-screenshots`, after `npm run build`) whenever the home or
// 404 page's look changes. Each test still carries a light assertion so a
// broken page (e.g. a 500 instead of a render) fails loudly instead of
// silently producing a screenshot of an error page.
//
// Deliberately lives outside tests/e2e (playwright.config.ts's `testDir`),
// so this spec is NOT part of the default `make e2e`/CI run — it writes
// directly into tracked PNGs under docs/user-guide/img/, which must only
// happen as an explicit, opt-in step, never as an implicit side effect of
// every e2e run. Run it with its own config: see
// playwright.screenshots.config.ts and the `capture-screenshots` npm script.
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

  test("cv page, light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/cv");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}cv-light.png`,
      fullPage: true,
    });
  });

  test("cv page, dark scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/cv");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}cv-dark.png`,
      fullPage: true,
    });
  });

  test("cv/print page", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/cv/print");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}cv-print.png`,
      fullPage: true,
    });
  });

  test("projects catalogue page, light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}projects-light.png`,
      fullPage: true,
    });
  });

  test("projects catalogue page, dark scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}projects-dark.png`,
      fullPage: true,
    });
  });

  test("project detail page (atsidek), light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/projects/atsidek");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}project-detail-light.png`,
      fullPage: true,
    });
  });

  test("project tag filter page (java), light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/projects/tag/java");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}project-tag-light.png`,
      fullPage: true,
    });
  });

  test("how this site was built page, light scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/how-this-site-was-built");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${imgDir}how-this-site-was-built-light.png`,
      fullPage: true,
    });
  });
});
