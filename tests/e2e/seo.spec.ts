import { expect, test } from "@playwright/test";

async function readSeoTags(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    title: document.title,
    description:
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? null,
    ogTitle:
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content") ?? null,
    ogDescription:
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content") ?? null,
    ogType:
      document
        .querySelector('meta[property="og:type"]')
        ?.getAttribute("content") ?? null,
    ogUrl:
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content") ?? null,
    canonical:
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
      null,
  }));
}

test.describe("SEO metadata", () => {
  test("home page has complete, non-empty SEO tags with a matching canonical URL", async ({
    page,
  }) => {
    await page.goto("/");
    const seo = await readSeoTags(page);
    expect(seo.title).not.toBe("");
    expect(seo.description).toBeTruthy();
    expect(seo.ogTitle).toBeTruthy();
    expect(seo.ogDescription).toBeTruthy();
    expect(seo.ogType).toBe("website");
    expect(seo.ogUrl).toBeTruthy();
    expect(seo.canonical).toBe("https://riauba.org/");
  });

  test("404 page has complete SEO tags with a matching canonical URL", async ({
    page,
  }) => {
    await page.goto("/does-not-exist");
    const seo = await readSeoTags(page);
    expect(seo.title).not.toBe("");
    expect(seo.description).toBeTruthy();
    expect(seo.canonical).toBe("https://riauba.org/404");
  });

  test("home and 404 pages have different titles", async ({ page }) => {
    await page.goto("/");
    const homeTitle = (await readSeoTags(page)).title;
    await page.goto("/does-not-exist");
    const notFoundTitle = (await readSeoTags(page)).title;
    expect(homeTitle).not.toBe(notFoundTitle);
  });
});
