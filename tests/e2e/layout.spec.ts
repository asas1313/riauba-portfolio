import { expect, test } from "@playwright/test";
import { readCv } from "./helpers/content.ts";

const cv = readCv();
const linkedIn = cv.basics.profiles.find(
  (profile) => profile.network === "LinkedIn",
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

    test("renders the footer with email, LinkedIn and copyright year", async ({
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
      await expect(footer).toContainText(String(new Date().getFullYear()));
      await expect(footer).toContainText(cv.basics.name);
    });
  });
}
