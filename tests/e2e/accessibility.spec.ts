import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const paths = [
  "/",
  "/404",
  "/cv",
  "/cv/print",
  "/projects",
  "/projects/atsidek",
  "/projects/tag/java",
  "/how-this-site-was-built",
];
const colorSchemes = ["light", "dark"] as const;

for (const path of paths) {
  for (const colorScheme of colorSchemes) {
    test(`${path} has zero axe violations in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

const themedTokens = [
  "--color-accent",
  "--color-bg-elevated",
  "--color-focus-ring",
];

for (const token of themedTokens) {
  test(`the themed ${token} custom property differs between light and dark`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const light = await page.evaluate(
      (name) =>
        getComputedStyle(document.documentElement)
          .getPropertyValue(name)
          .trim(),
      token,
    );

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const dark = await page.evaluate(
      (name) =>
        getComputedStyle(document.documentElement)
          .getPropertyValue(name)
          .trim(),
      token,
    );

    expect(light).not.toBe("");
    expect(dark).not.toBe("");
    expect(light).not.toBe(dark);
  });
}

test("light theme's accent colour stays exactly #1d4ed8 (spec 005, decision 3)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );
  expect(accent).toBe("#1d4ed8");
});

test("dark theme's accent colour is a distinct value, never a literal reuse of #1d4ed8 (spec 005, decision 3)", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );
  expect(accent).not.toBe("#1d4ed8");
});
