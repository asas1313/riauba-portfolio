import { expect, test } from "@playwright/test";
import {
  readCv,
  readFeaturedProjectsSorted,
  readProjects,
} from "./helpers/content.ts";

const cv = readCv();
const featuredProjects = readFeaturedProjectsSorted();

test.describe("home page", () => {
  test("shows basics.name, basics.label, basics.summary and the remote line", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: cv.basics.name }),
    ).toBeVisible();
    await expect(page.getByText(cv.basics.label)).toBeVisible();
    await expect(
      page.getByText(cv.basics.summary.trim().slice(0, 40)),
    ).toBeVisible();
    await expect(page.getByText(cv.basics.remote)).toBeVisible();
  });

  test("links to every non-TODO profile", async ({ page }) => {
    await page.goto("/");
    const main = page.locator("main");
    for (const profile of cv.basics.profiles) {
      if (profile.network === "TODO" || profile.url === "TODO") continue;
      await expect(main.locator(`a[href="${profile.url}"]`)).toBeVisible();
    }
  });

  test("shows a Download CV (PDF) link in the header nav, pointing at /andrius-riauba-cv.pdf (AC-5)", async ({
    page,
  }) => {
    await page.goto("/");
    const navLink = page
      .locator("header nav")
      .getByRole("link", { name: "Download CV (PDF)" });
    await expect(navLink).toHaveAttribute("href", "/andrius-riauba-cv.pdf");
  });

  test("hides profiles marked TODO", async ({ page }) => {
    // content/cv.yaml has no TODO-marked profiles right now, so this can't
    // exercise the stripping path end-to-end against real content (that is
    // covered directly by the `stripTodoFields`/`getPublishableCv` unit
    // tests in tests/unit/cv.publish.test.ts, including the prod-build
    // warning). What this test *can* assert, regardless of real content:
    // the rendered production page never contains a literal "TODO"
    // placeholder as a profile link's href or visible label.
    await page.goto("/");
    const main = page.locator("main");
    await expect(main.locator('a[href="TODO"]')).toHaveCount(0);
    await expect(main.getByRole("link", { name: "TODO" })).toHaveCount(0);
    for (const profile of cv.basics.profiles) {
      expect(profile.network).not.toBe("TODO");
      expect(profile.url).not.toBe("TODO");
    }
  });

  test("shows only featured projects, ordered by `order`, linking to /projects/<slug>", async ({
    page,
  }) => {
    await page.goto("/");
    const links = page.locator("[data-testid='project-link']");
    await expect(links).toHaveCount(featuredProjects.length);
    for (let i = 0; i < featuredProjects.length; i++) {
      await expect(links.nth(i)).toHaveAttribute(
        "href",
        `/projects/${featuredProjects[i].id}`,
      );
      await expect(links.nth(i)).toContainText(featuredProjects[i].title);
    }
  });

  test("never links to a non-featured project (empty-state exclusion, AC-4)", async ({
    page,
  }) => {
    await page.goto("/");
    const allProjects = readProjects();
    const nonFeatured = allProjects.filter((project) => !project.featured);
    // Sanity check on the fixture itself: this only proves something if
    // content/projects actually contains at least one non-featured project.
    expect(nonFeatured.length).toBeGreaterThan(0);
    for (const project of nonFeatured) {
      await expect(
        page.locator(
          `[data-testid='project-link'][href="/projects/${project.id}"]`,
        ),
      ).toHaveCount(0);
    }
  });
});
