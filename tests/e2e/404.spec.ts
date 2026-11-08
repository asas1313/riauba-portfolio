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
});
