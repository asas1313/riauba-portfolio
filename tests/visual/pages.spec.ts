import { expect, test } from "@playwright/test";

// Spec 005, AC-8/AC-11: committed screenshot baselines for the key page set,
// in both themes, at the main viewport -- plus / and /cv at 360px in light
// theme only (narrow-width layout, already covered in both themes at the
// other breakpoints by the main baseline set below). Must only ever be run
// (generated or compared) inside the pinned Playwright Docker image -- see
// ADR-0004 and the Makefile's `visual`/`visual-update` targets.
const pages = [
  "/",
  "/cv",
  "/projects",
  "/projects/atsidek",
  "/projects/tag/java",
  "/how-this-site-was-built",
  "/404",
];
const colorSchemes = ["light", "dark"] as const;

/** `/projects/tag/java` -> `projects_tag_java`; `/` -> `home`. */
function slugify(path: string): string {
  const trimmed = path.replace(/^\/|\/$/g, "");
  return trimmed === "" ? "home" : trimmed.replace(/\//g, "_");
}

for (const path of pages) {
  for (const colorScheme of colorSchemes) {
    test(`${path} (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(
        `${slugify(path)}-${colorScheme}.png`,
        { fullPage: true },
      );
    });
  }
}

const narrowPages = ["/", "/cv"];

for (const path of narrowPages) {
  test(`${path} at 360px (light)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${slugify(path)}-360-light.png`, {
      fullPage: true,
    });
  });
}
