import { expect, test } from "@playwright/test";

const MAX_TRANSFERRED_BYTES = 300 * 1024;
const MAX_FONT_BYTES = 150 * 1024;
const THIRD_PARTY_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Covers every distinct page *shape* the site ships (amendment 9 for spec
// 003): the home page, plus one real /projects catalogue page, one real
// /projects/<slug> detail page, one real /projects/tag/<slug> filter page,
// and /how-this-site-was-built — all zero-JS static pages reusing the same
// fonts/CSS already counted against the home page's budget.
const paths = [
  "/",
  "/projects",
  "/projects/atsidek",
  "/projects/tag/java",
  "/how-this-site-was-built",
];

for (const path of paths) {
  test.describe(`${path} performance and no-JS budget`, () => {
    // Spec 005, AC-9's one known, intentional break: the two inline
    // theme-init/theme-toggle scripts (tasks 3-4) are the only
    // client-side JavaScript shipped anywhere on the site. "Zero
    // <script> elements" becomes "at most two inline <script> elements,
    // zero externally-sourced <script src> elements".
    test("ships at most two inline <script> elements and zero external <script src> elements", async ({
      page,
    }) => {
      await page.goto(path);
      const scripts = page.locator("script");
      const count = await scripts.count();
      expect(count).toBeLessThanOrEqual(2);
      const srcs = await scripts.evaluateAll((elements) =>
        elements
          .map((el) => el.getAttribute("src"))
          .filter((src): src is string => src !== null),
      );
      expect(srcs).toEqual([]);
    });

    test("triggers zero script- or fetch-initiated network requests", async ({
      page,
    }) => {
      const scriptOrFetchRequests: string[] = [];
      page.on("request", (request) => {
        const type = request.resourceType();
        if (type === "script" || type === "fetch" || type === "xhr") {
          scriptOrFetchRequests.push(request.url());
        }
      });
      await page.goto(path, { waitUntil: "networkidle" });
      expect(scriptOrFetchRequests).toEqual([]);
    });

    test("keeps total transferred weight under 300 KB and self-hosts every font", async ({
      page,
    }) => {
      let totalBytes = 0;
      const fontUrls: string[] = [];

      page.on("response", async (response) => {
        const url = response.url();
        if (response.request().resourceType() === "font") {
          fontUrls.push(url);
        }
        try {
          const body = await response.body();
          totalBytes += body.length;
        } catch {
          // Ignore responses whose body is unavailable (e.g. redirects).
        }
      });

      await page.goto(path, { waitUntil: "networkidle" });

      expect(fontUrls.length).toBeGreaterThan(0);
      for (const url of fontUrls) {
        expect(new URL(url).origin).toBe(new URL(page.url()).origin);
        for (const thirdPartyHost of THIRD_PARTY_FONT_HOSTS) {
          expect(url).not.toContain(thirdPartyHost);
        }
      }

      expect(totalBytes).toBeLessThan(MAX_TRANSFERRED_BYTES);
    });

    // Spec 005, AC-5/task 10: a *separate*, stricter budget for font bytes
    // alone (on top of the existing <300 KB total-weight budget above).
    test("keeps total font bytes under 150 KB", async ({ page }) => {
      let fontBytes = 0;

      page.on("response", async (response) => {
        if (response.request().resourceType() !== "font") return;
        try {
          const body = await response.body();
          fontBytes += body.length;
        } catch {
          // Ignore responses whose body is unavailable (e.g. redirects).
        }
      });

      await page.goto(path, { waitUntil: "networkidle" });

      expect(fontBytes).toBeLessThan(MAX_FONT_BYTES);
    });

    // Spec 005, AC-5/task 10: every <link rel=preload as=font> actually
    // gets requested -- no dead/unused preloads. (The inverse direction --
    // "every requested font is preloaded" -- is deliberately NOT
    // asserted: Inter 600 and the mono font are requested-but-not-
    // preloaded on purpose.)
    test("every <link rel=preload as=font> is actually requested (no dead preloads)", async ({
      page,
    }) => {
      const requestedUrls: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "font") {
          requestedUrls.push(request.url());
        }
      });

      await page.goto(path, { waitUntil: "networkidle" });

      const preloadHrefs = await page
        .locator('link[rel="preload"][as="font"]')
        .evaluateAll((links) =>
          links.map((link) => (link as HTMLLinkElement).href),
        );
      expect(preloadHrefs.length).toBeGreaterThan(0);
      for (const href of preloadHrefs) {
        expect(requestedUrls).toContain(href);
      }
    });

    test("makes zero requests to any third-party origin at all (not just script/fetch/xhr)", async ({
      page,
    }) => {
      const requestedOrigins = new Set<string>();
      page.on("request", (request) => {
        requestedOrigins.add(new URL(request.url()).origin);
      });

      await page.goto(path, { waitUntil: "networkidle" });

      expect(requestedOrigins.size).toBeGreaterThan(0);
      const pageOrigin = new URL(page.url()).origin;
      for (const origin of requestedOrigins) {
        expect(origin).toBe(pageOrigin);
      }
    });
  });
}
