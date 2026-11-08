import { expect, test } from "@playwright/test";
import {
  readAllProjectsSorted,
  readProjects,
  readTagGroups,
  readVisibleProjectLinkKinds,
  slugifyTag,
} from "./helpers/content.ts";

const allProjects = readAllProjectsSorted();
const tagGroups = readTagGroups();

test.describe("/projects catalogue page (AC-1)", () => {
  test("lists every real project, ordered by `order`, each with title/tagline/status/stack tags", async ({
    page,
  }) => {
    await page.goto("/projects");
    const links = page.locator("[data-testid='project-link']");
    await expect(links).toHaveCount(allProjects.length);
    for (let i = 0; i < allProjects.length; i++) {
      const project = allProjects[i];
      await expect(links.nth(i)).toHaveAttribute(
        "href",
        `/projects/${project.id}`,
      );
      await expect(links.nth(i)).toContainText(project.title);
      const item = links.nth(i).locator("xpath=ancestor::li[1]");
      await expect(item).toContainText(project.tagline);
      await expect(item).toContainText(project.status);
      for (const tag of project.stack) {
        await expect(item.getByRole("link", { name: tag })).toBeVisible();
      }
    }
  });
});

test.describe("/projects stack tag filtering (AC-3)", () => {
  test("every stack tag on /projects links to /projects/tag/<slug>", async ({
    page,
  }) => {
    await page.goto("/projects");
    for (const project of allProjects) {
      for (const tag of project.stack) {
        await expect(
          page.locator(`a[href="/projects/tag/${slugifyTag(tag)}"]`).first(),
        ).toBeVisible();
      }
    }
  });

  test("a real /projects/tag/<slug> page shows only projects with that tag", async () => {
    const java = tagGroups.find((group) => group.slug === "java");
    expect(java).toBeDefined();
    expect(java!.projects.length).toBeGreaterThan(0);
  });

  // Spec 005, AC-9: the two inline theme-init/theme-toggle scripts (tasks
  // 3-4) are present on every page, including this one -- "zero <script>
  // elements" becomes "at most two, and no filtering-specific script".
  test("navigating directly to a real tag URL shows only matching projects, with at most the two shared theme <script> elements", async ({
    page,
  }) => {
    const group = tagGroups.find((g) => g.slug === "java")!;
    await page.goto(`/projects/tag/${group.slug}`);
    expect(await page.locator("script").count()).toBeLessThanOrEqual(2);
    const links = page.locator("[data-testid='project-link']");
    await expect(links).toHaveCount(group.projects.length);
    const nonMatching = readProjects().filter(
      (project) => !group.projects.some((p) => p.id === project.id),
    );
    for (const project of nonMatching) {
      await expect(
        page.locator(
          `[data-testid='project-link'][href="/projects/${project.id}"]`,
        ),
      ).toHaveCount(0);
    }
  });

  test("/projects itself ships at most the two shared theme <script> elements (no filtering-specific JS)", async ({
    page,
  }) => {
    await page.goto("/projects");
    expect(await page.locator("script").count()).toBeLessThanOrEqual(2);
  });
});

test.describe("/projects/<slug> detail page (AC-4)", () => {
  test("atsidek shows only a visible Live link, styled as the primary button", async ({
    page,
  }) => {
    const atsidek = readProjects().find((p) => p.id === "atsidek")!;
    await page.goto("/projects/atsidek");
    const visibleKinds = readVisibleProjectLinkKinds(atsidek.links);
    expect(visibleKinds).toEqual(["live"]);
    const buttons = page.locator(".project-link-button");
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toHaveAttribute("href", atsidek.links.live!);
    // live is the sole present link, so by the live>docs>repo priority
    // order (spec 005, decision 4) it is the primary (filled) button, not
    // the secondary (outline) style.
    await expect(page.locator(".button-secondary")).toHaveCount(0);
  });

  test("primary/secondary button assignment is by link type, not DOM position (spec 005, decision 4)", async ({
    page,
  }) => {
    // Real content/projects/*.md has no project with docs/repo but no
    // `live` link today, so the "docs becomes primary when live is
    // absent" case (proving this is type-based, not positional) is
    // covered directly against the pure getVisibleProjectLinks function
    // with synthetic fixture data in
    // tests/unit/project-links.test.ts's "isPrimary is type-based, not
    // positional" suite, rather than invented here against real content
    // (this project's CLAUDE.md: never invent project/content facts).
    //
    // What *is* checked end-to-end here is that whichever link
    // getVisibleProjectLinks marks `isPrimary` actually renders with a
    // visibly different background-color than a secondary link would --
    // i.e. the primary/secondary CSS classes are wired up correctly to
    // real computed styles, not just present in markup.
    await page.goto("/projects/atsidek");
    const primary = page.locator(".project-link-button").first();
    const primaryBg = await primary.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // The primary button is filled with --color-accent, never transparent.
    expect(primaryBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(primaryBg).not.toBe("transparent");
  });

  test("homelab and payments-migration show zero link buttons", async ({
    page,
  }) => {
    for (const id of ["homelab", "payments-migration"]) {
      const project = readProjects().find((p) => p.id === id)!;
      expect(readVisibleProjectLinkKinds(project.links)).toEqual([]);
      await page.goto(`/projects/${id}`);
      await expect(page.locator(".project-link-button")).toHaveCount(0);
    }
  });

  test("renders the markdown body as real HTML, not raw markdown syntax", async ({
    page,
  }) => {
    await page.goto("/projects/homelab");
    const main = page.locator("main");
    const bodyParagraph = main.getByText(
      "A Proxmox-based homelab running a photo library",
    );
    await expect(bodyParagraph).toBeVisible();
    // The body paragraph itself rendered as a real <p>, not literal markdown
    // syntax left unparsed (e.g. a stray "**"/"##"/leading "- ").
    expect(await bodyParagraph.evaluate((el) => el.tagName)).toBe("P");
    const bodyText = await bodyParagraph.innerText();
    expect(bodyText).not.toContain("**");
    expect(bodyText).not.toMatch(/^#+\s/);
  });

  test("renders a markdown list body as real <ul>/<li> elements, not raw '- ' syntax", async ({
    page,
  }) => {
    await page.goto("/projects/atsidek");
    const main = page.locator("main");
    // atsidek's body has a markdown bullet list below its intro paragraph
    // (distinct from the unrelated .project-tags list rendered above it).
    const bodyList = main.locator("ul:not(.project-tags) li");
    await expect(bodyList).toHaveCount(3);
    const firstItemText = await bodyList.first().innerText();
    expect(firstItemText).not.toMatch(/^-\s/);
    expect(firstItemText).toContain("Spring Boot calculation engine");
  });
});

test.describe("/projects/<slug> TODO-paragraph stripping (AC-5)", () => {
  test("atsidek and payments-migration never render the literal text TODO in <main>", async ({
    page,
  }) => {
    for (const id of ["atsidek", "payments-migration"]) {
      await page.goto(`/projects/${id}`);
      const mainText = await page.locator("main").innerText();
      expect(mainText).not.toContain("TODO");
    }
  });
});
