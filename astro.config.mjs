// @ts-check
import { defineConfig } from "astro/config";

// Static site for riauba.org. No UI framework integrations: every page is a
// plain .astro component with zero client-side JavaScript by default.
export default defineConfig({
  site: "https://riauba.org",
  output: "static",
});
