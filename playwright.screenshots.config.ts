import { defineConfig, devices } from "@playwright/test";

// Dedicated config for tests/screenshots/screenshots.spec.ts, which writes
// documentation screenshots directly into tracked docs/user-guide/img/*.png.
// Kept separate from playwright.config.ts (whose `testDir` is `tests/e2e`,
// run by default via `make e2e`/CI) so capturing/overwriting those tracked
// PNGs is always an explicit, opt-in step: `npm run capture-screenshots`,
// never an implicit side effect of a routine e2e run.
//
// As with playwright.config.ts, this runs against the production build +
// preview server, not `astro dev` — run `npm run build` first.
export default defineConfig({
  testDir: "tests/screenshots",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
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
