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

  // QA pass (spec 005 verification): the original suite only asserted that
  // `aria-pressed` is *present*, never that its value actually tracks the
  // active theme (Header.astro's script sets it to "true"/"false" on every
  // click) -- a real accessibility contract for the toggle button that was
  // previously unverified.
  test("aria-pressed reflects the active theme after each toggle click", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const toggle = page.locator(".theme-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    const themeAfterFirstClick = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      themeAfterFirstClick === "dark" ? "true" : "false",
    );

    await toggle.click();
    const themeAfterSecondClick = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(themeAfterSecondClick).not.toBe(themeAfterFirstClick);
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      themeAfterSecondClick === "dark" ? "true" : "false",
    );
  });

  // QA pass (spec 005 verification): the plan's decisions require the CSS
  // `color-scheme` property to be set alongside `data-theme` in *both*
  // inline scripts -- the head-init script was already covered by the
  // "pre-seeding" test below, but the Header toggle script's own
  // `style.colorScheme` update (so native form controls/scrollbars follow
  // a user-driven theme change too, not just the stored-preference case)
  // was never asserted.
  test("clicking the toggle also updates the CSS color-scheme property", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.locator(".theme-toggle").click();

    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    const colorScheme = await page.evaluate(
      () => document.documentElement.style.colorScheme,
    );
    expect(colorScheme).toBe(theme);
  });

  // QA pass (spec 005 verification): both inline scripts wrap localStorage
  // access in try/catch specifically for private-browsing/storage-disabled
  // contexts (plan, "Further fixes" section) -- but nothing previously
  // exercised that path. Simulate storage throwing on every access and
  // confirm the toggle still flips the theme for the session without an
  // unhandled page error.
  test("still toggles the theme for the session when localStorage throws (private browsing)", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.addInitScript(() => {
      const throwingStorage = {
        getItem(): string | null {
          throw new DOMException("Storage disabled", "SecurityError");
        },
        setItem(): void {
          throw new DOMException("Storage disabled", "SecurityError");
        },
        removeItem(): void {
          throw new DOMException("Storage disabled", "SecurityError");
        },
      };
      Object.defineProperty(window, "localStorage", {
        value: throwingStorage,
        configurable: true,
      });
    });

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const toggle = page.locator(".theme-toggle");
    await expect(toggle).toBeVisible();

    const before = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    await toggle.click();
    const after = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );

    expect(after).not.toBe(before);
    expect(["light", "dark"]).toContain(after);
    expect(pageErrors).toEqual([]);
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
