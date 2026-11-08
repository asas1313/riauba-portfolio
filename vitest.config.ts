import { getViteConfig } from "astro/config";

// Uses Astro's own Vite config (not plain Vitest `defineConfig`) so that
// virtual modules such as `astro:content` resolve correctly when unit tests
// import src/content.config.ts.
export default getViteConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
