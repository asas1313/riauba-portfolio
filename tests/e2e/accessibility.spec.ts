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

test("the themed accent colour custom property differs between light and dark", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const light = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const dark = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );

  expect(light).not.toBe("");
  expect(dark).not.toBe("");
  expect(light).not.toBe(dark);
});
