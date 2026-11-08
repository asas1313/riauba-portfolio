import { expect, test } from "@playwright/test";
import { readCv } from "./helpers/content.ts";

const cv = readCv();
const linkedIn = cv.basics.profiles.find(
  (profile) => profile.network === "LinkedIn",
);
const github = cv.basics.profiles.find(
  (profile) => profile.network === "GitHub",
);

const pages = [
  "/",
  "/404",
  "/cv",
  "/projects",
  "/projects/atsidek",
  "/projects/tag/java",
  "/how-this-site-was-built",
];

for (const path of pages) {
  test.describe(`shared layout on ${path}`, () => {
    test("renders the header nav with Home, Projects, CV, How this site was built", async ({
      page,
    }) => {
      await page.goto(path);
      const nav = page.locator("header nav");
      await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
        "href",
        "/",
      );
      await expect(nav.getByRole("link", { name: "Projects" })).toHaveAttribute(
        "href",
        "/projects",
      );
      await expect(
        nav.getByRole("link", { name: "CV", exact: true }),
      ).toHaveAttribute("href", "/cv");
      await expect(
        nav.getByRole("link", { name: "How this site was built" }),
      ).toHaveAttribute("href", "/how-this-site-was-built");
    });

    test("renders the footer with email, LinkedIn, GitHub and copyright year", async ({
      page,
    }) => {
      await page.goto(path);
      const footer = page.locator("footer");
      await expect(
        footer.locator(`a[href="mailto:${cv.basics.email}"]`),
      ).toBeVisible();
      if (linkedIn) {
        await expect(footer.locator(`a[href="${linkedIn.url}"]`)).toBeVisible();
      }
      if (github) {
        await expect(footer.locator(`a[href="${github.url}"]`)).toBeVisible();
      }
      await expect(footer).toContainText(String(new Date().getFullYear()));
      await expect(footer).toContainText(cv.basics.name);
    });

    test("has a skip-to-content link as the first focusable element, pointing at #main-content", async ({
      page,
    }) => {
      await page.goto(path);
      const skipLink = page.locator("a.skip-link");
      await expect(skipLink).toHaveAttribute("href", "#main-content");
      await expect(page.locator("#main-content")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
    });

    test("marks the nav item matching the current path with aria-current and .active", async ({
      page,
    }) => {
      await page.goto(path);
      const nav = page.locator("header nav");
      const current = nav.locator('a[aria-current="page"]');
      // Only pages that are themselves one of the 5 nav hrefs (not every
      // page in `pages` is -- e.g. /404) are expected to have a match.
      const navHrefs = ["/", "/projects", "/cv", "/how-this-site-was-built"];
      if (navHrefs.includes(path)) {
        await expect(current).toHaveCount(1);
        await expect(current).toHaveClass(/active/);
        await expect(current).toHaveAttribute("href", path);
      } else {
        await expect(current).toHaveCount(0);
      }
    });
  });
}
