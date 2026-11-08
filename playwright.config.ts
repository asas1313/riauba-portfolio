import { defineConfig, devices } from "@playwright/test";

// Runs against the *production* build (astro build + astro preview), never
// astro dev: dev injects an HMR client that would both fail the no-client-JS
// check and skew the page-weight budget. The build itself is a precondition
// supplied by `make e2e`'s Makefile dependency (`e2e: build`), not by this
// webServer — it only starts the cheap preview server, avoiding a second
// build on every `make e2e` invocation.
export default defineConfig({
  testDir: "tests/e2e",
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
