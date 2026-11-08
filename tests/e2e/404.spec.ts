import { expect, test } from "@playwright/test";

test.describe("404 page", () => {
  test("serves an HTTP 404 status for an unknown path, with the shared layout", async ({
    page,
  }) => {
    const response = await page.goto("/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.locator("header nav")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });

  test("renders a friendly message and a link back home", async ({ page }) => {
    await page.goto("/does-not-exist");
    await expect(
      page.getByRole("link", { name: /home|back/i }).first(),
    ).toHaveAttribute("href", "/");
  });

  test("serves an HTTP 404 (not 200) for a deeply nested unknown path", async ({
    page,
  }) => {
    const response = await page.goto("/foo/bar/baz/does-not-exist");
    expect(response?.status()).toBe(404);
    expect(response?.ok()).toBe(false);
  });

  test("serves the 404 page as HTML, not a bare status with no body", async ({
    page,
  }) => {
    const response = await page.goto("/does-not-exist");
    expect(response?.headers()["content-type"]).toContain("text/html");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
