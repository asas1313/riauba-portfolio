import { expect, test } from "@playwright/test";
import { readCv, readWorkReverseChronological } from "./helpers/content.ts";

const cv = readCv();
const work = readWorkReverseChronological();

test.describe("/cv page", () => {
  test("shows the summary", async ({ page }) => {
    await page.goto("/cv");
    await expect(
      page.getByText(cv.basics.summary.trim().slice(0, 40)),
    ).toBeVisible();
  });

  test("shows every work entry in reverse-chronological order", async ({
    page,
  }) => {
    await page.goto("/cv");
    const entries = page.locator("[data-testid='cv-work-entry']");
    await expect(entries).toHaveCount(work.length);
    for (let i = 0; i < work.length; i++) {
      await expect(entries.nth(i)).toContainText(work[i].name);
    }
  });

  test("shows skills, education and languages sections", async ({ page }) => {
    await page.goto("/cv");
    await expect(page.getByRole("heading", { name: "Skills" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Education" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Languages" }),
    ).toBeVisible();
    const skillsSection = page.locator("section.cv-skills");
    for (const skill of cv.skills as { name: string }[]) {
      await expect(skillsSection.getByText(skill.name)).toBeVisible();
    }
  });

  test("hides the certificates section since real content/cv.yaml's certificates is empty", async ({
    page,
  }) => {
    await page.goto("/cv");
    await expect(
      page.getByRole("heading", { name: "Certificates" }),
    ).toHaveCount(0);
  });

  test("Header nav has a Download CV (PDF) link to /andrius-riauba-cv.pdf", async ({
    page,
  }) => {
    await page.goto("/cv");
    const navLink = page
      .locator("header nav")
      .getByRole("link", { name: "Download CV (PDF)" });
    await expect(navLink).toHaveAttribute("href", "/andrius-riauba-cv.pdf");
  });

  test("has a visually distinct download button near the top of the page, pointing at the same PDF", async ({
    page,
  }) => {
    await page.goto("/cv");
    const button = page.locator("[data-testid='cv-download-button']");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/andrius-riauba-cv.pdf");
    await expect(button).toContainText("Download CV (PDF)");
  });

  test("includes a schema.org Person JSON-LD block built from cv.yaml", async ({
    page,
  }) => {
    await page.goto("/cv");
    const raw = await page
      .locator('script[type="application/ld+json"]')
      .innerHTML();
    const jsonLd = JSON.parse(raw);
    expect(jsonLd["@type"]).toBe("Person");
    expect(jsonLd.name).toBe(cv.basics.name);
    expect(jsonLd.email).toBe(cv.basics.email);
  });
});
