import { expect, test } from "@playwright/test";

const MAX_TRANSFERRED_BYTES = 300 * 1024;
const THIRD_PARTY_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

test.describe("home page performance and no-JS budget", () => {
  test("ships zero <script> elements", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("script").count()).toBe(0);
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
    await page.goto("/", { waitUntil: "networkidle" });
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

    await page.goto("/", { waitUntil: "networkidle" });

    expect(fontUrls.length).toBeGreaterThan(0);
    for (const url of fontUrls) {
      expect(new URL(url).origin).toBe(new URL(page.url()).origin);
      for (const thirdPartyHost of THIRD_PARTY_FONT_HOSTS) {
        expect(url).not.toContain(thirdPartyHost);
      }
    }

    expect(totalBytes).toBeLessThan(MAX_TRANSFERRED_BYTES);
  });

  test("makes zero requests to any third-party origin at all (not just script/fetch/xhr)", async ({
    page,
  }) => {
    const requestedOrigins = new Set<string>();
    page.on("request", (request) => {
      requestedOrigins.add(new URL(request.url()).origin);
    });

    await page.goto("/", { waitUntil: "networkidle" });

    expect(requestedOrigins.size).toBeGreaterThan(0);
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requestedOrigins) {
      expect(origin).toBe(pageOrigin);
    }
  });
});
