import { expect, test } from "@playwright/test";

// Spec 005, AC-4: responsive at 360/768/1280px, no horizontal scroll, nav
// usable on mobile. No mobile-menu toggle: the nav simply wraps onto its
// own line below the site name via flex-wrap (decision 7) -- no JS, no
// hidden/revealed state to test.
const widths = [360, 768, 1280];
const navLabels = ["Home", "Projects", "CV", "How this site was built"];

for (const width of widths) {
  test.describe(`responsive layout at ${width}px`, () => {
    test("has no horizontal scroll on the home page", async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test("every nav link is visible and independently clickable", async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const nav = page.locator("header nav");
      for (const label of navLabels) {
        const link = nav.getByRole("link", { name: label, exact: true });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    });
  });
}

test.describe("nav layout shape at the extremes", () => {
  test("at 1280px the nav sits on one line, inline with the site name", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const siteName = page.locator(".site-name");
    const firstNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Home", exact: true });
    const nameBox = await siteName.boundingBox();
    const navBox = await firstNavLink.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // Same row: vertical centers are close together, well within one
    // typical line-height of each other.
    const nameCenterY = nameBox!.y + nameBox!.height / 2;
    const navCenterY = navBox!.y + navBox!.height / 2;
    expect(Math.abs(nameCenterY - navCenterY)).toBeLessThan(20);
  });

  test("at 360px the nav wraps onto its own line below the site name", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const siteName = page.locator(".site-name");
    const firstNavLink = page
      .locator("header nav")
      .getByRole("link", { name: "Home", exact: true });
    const nameBox = await siteName.boundingBox();
    const navBox = await firstNavLink.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    // Nav sits below the site name, not on the same row.
    expect(navBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height / 2);
  });
});
