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

  test("hides profiles marked TODO", async ({ page }) => {
    await page.goto("/");
    const todoProfiles = cv.basics.profiles.filter(
      (profile) => profile.network === "TODO" || profile.url === "TODO",
    );
    for (const profile of todoProfiles) {
      if (profile.url !== "TODO") {
        await expect(page.locator(`a[href="${profile.url}"]`)).toHaveCount(0);
      }
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
