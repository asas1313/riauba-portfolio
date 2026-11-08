import { expect, test } from "@playwright/test";

// Spec 005, AC-3: theme toggle works, persists via localStorage, and there
// is no flash of the wrong theme on reload.
test.describe("theme toggle", () => {
  test("the toggle button is revealed once its script attaches", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.locator(".theme-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed");
  });

  test("clicking the toggle flips data-theme and the computed --color-bg", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const toggle = page.locator(".theme-toggle");
    await expect(toggle).toBeVisible();

    const before = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue(
        "--color-bg",
      ),
    }));

    await toggle.click();

    const after = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.documentElement).getPropertyValue(
        "--color-bg",
      ),
    }));

    expect(after.theme).not.toBe(before.theme);
    expect(after.bg.trim()).not.toBe(before.bg.trim());
    expect(["light", "dark"]).toContain(after.theme);
  });

  test("a reload with no further interaction keeps the previously-chosen theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.locator(".theme-toggle").click();
    const chosen = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(chosen).toBe("dark");

    await page.reload();
    const afterReload = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(afterReload).toBe("dark");
  });

  test("pre-seeding localStorage with dark applies data-theme before the Header/Footer paint (no flash)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "dark");
    });
    await page.goto("/");
    // Proxy for "no flash": the head script has already set data-theme by
    // the time DOMContentLoaded fires, before Header/Footer render.
    await page.waitForLoadState("domcontentloaded");
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(theme).toBe("dark");
    const colorScheme = await page.evaluate(
      () => document.documentElement.style.colorScheme,
    );
    expect(colorScheme).toBe("dark");
  });
});
