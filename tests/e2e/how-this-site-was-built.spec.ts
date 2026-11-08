import { expect, test } from "@playwright/test";
import { readSpecIndex } from "./helpers/content.ts";

const specs = readSpecIndex();

test.describe("/how-this-site-was-built page (AC-6)", () => {
  test("contains non-empty explanatory prose about the delivery pipeline", async ({
    page,
  }) => {
    await page.goto("/how-this-site-was-built");
    const main = page.locator("main");
    const paragraphs = main.locator("p");
    await expect(paragraphs.first()).toBeVisible();
    expect((await paragraphs.allInnerTexts()).join(" ").length).toBeGreaterThan(
      200,
    );
  });

  test("lists every real spec from docs/specs/ with its own title and status", async ({
    page,
  }) => {
    await page.goto("/how-this-site-was-built");
    const main = page.locator("main");
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      await expect(main).toContainText(spec.title);
      await expect(main).toContainText(spec.status);
    }
  });

  test("links to the exact PR URL for every spec that has one, and renders no PR link for specs that don't", async ({
    page,
  }) => {
    await page.goto("/how-this-site-was-built");
    const main = page.locator("main");
    const specsWithPr = specs.filter((spec) => spec.pr);
    const specsWithoutPr = specs.filter((spec) => !spec.pr);

    // Sanity check on the fixture itself: this only proves something if
    // content/docs/specs actually has at least one spec of each kind.
    expect(specsWithPr.length).toBeGreaterThan(0);
    expect(specsWithoutPr.length).toBeGreaterThan(0);

    for (const spec of specsWithPr) {
      await expect(main.locator(`a[href="${spec.pr}"]`)).toBeVisible();
    }

    const allPrHrefs = await main
      .locator("table a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const expectedHrefs = new Set(specsWithPr.map((spec) => spec.pr));
    for (const href of allPrHrefs) {
      expect(expectedHrefs.has(href ?? undefined)).toBe(true);
    }
    expect(allPrHrefs).toHaveLength(specsWithPr.length);
  });
});
