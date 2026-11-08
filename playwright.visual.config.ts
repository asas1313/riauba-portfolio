import { defineConfig, devices } from "@playwright/test";

// Dedicated config for the visual-regression suite (spec 005, AC-8/AC-11;
// see ADR-0004). Kept separate from playwright.config.ts (functional e2e,
// tests/e2e/) and playwright.screenshots.config.ts (documentation
// screenshots, tests/screenshots/) -- three configs, three distinct
// purposes, no overlap.
//
// Must only ever be run inside the official, version-pinned Playwright
// Docker image (`make visual`/`make visual-update`, or the CI job in
// .github/workflows/ci.yml) -- never on a bare host, since font
// anti-aliasing/hinting differs across OSes and would produce spurious
// pixel diffs having nothing to do with an actual visual regression.
export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  reporter: "list",
  // Disable CSS animations/transitions so hover/focus transitions (e.g.
  // .project-link-button's opacity transition) never cause a flaky
  // mid-transition screenshot diff.
  use: {
    baseURL: "http://localhost:4321",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4321",
    reuseExistingServer: false,
  },
});
