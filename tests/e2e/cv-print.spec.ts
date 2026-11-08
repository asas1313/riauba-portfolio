import { expect, test } from "@playwright/test";

test.describe("/cv/print page", () => {
  test("has no page-level header/nav/footer landmarks (CvContent's own <header> inside <article> is not a page banner)", async ({
    page,
  }) => {
    await page.goto("/cv/print");
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(page.locator("nav")).toHaveCount(0);
  });

  test("declares an A4 @page size", async ({ page }) => {
    await page.goto("/cv/print");
    const hasA4PageRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (
            rule instanceof CSSPageRule &&
            rule.cssText.toUpperCase().includes("A4")
          ) {
            return true;
          }
        }
      }
      return false;
    });
    expect(hasA4PageRule).toBe(true);
  });

  test("has a noindex robots meta tag and a canonical link pointing at /cv", async ({
    page,
  }) => {
    await page.goto("/cv/print");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://riauba.org/cv",
    );
  });

  test("renders every profile/company link's visible text as its own href", async ({
    page,
  }) => {
    await page.goto("/cv/print");
    const links = page.locator("article a");
    const count = await links.count();
    let checked = 0;
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute("href");
      if (!href || href.startsWith("mailto:")) continue;
      const text = await link.textContent();
      expect(text?.trim()).toBe(href);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
