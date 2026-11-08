// @ts-check
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { createSatteriTodoParagraphPlugin } from "./src/lib/markdown-todo.ts";

// Static site for riauba.org. No UI framework integrations: every page is a
// plain .astro component with zero client-side JavaScript by default.
//
// Functional `defineConfig(({ command }) => ({ ... }))` form (rather than a
// plain object) so markdown.processor can gate TODO-paragraph stripping
// (spec 003, AC-5) on `command === "build"` — mirroring cv.publish.ts's
// `import.meta.env.PROD` check, using the config-time equivalent since
// `import.meta.env` isn't meaningful inside astro.config.mjs itself. See
// ADR-0003 and src/lib/markdown-todo.ts for why this goes through Sätteri's
// native plugin API (`markdown.processor: satteri({ mdastPlugins: [...] })`)
// rather than the classic `markdown.remarkPlugins` the ADR originally
// specified: Astro 7.4 (pinned by this repo) ships Sätteri, not the
// unified/remark pipeline, as its default Markdown processor, and
// `remarkPlugins` throws a config-validation error unless
// `@astrojs/markdown-remark` is installed separately (empirically verified
// — see ADR-0003's Addendum). `@astrojs/markdown-satteri` is Astro's own
// bundled default Markdown engine (already a mandatory part of installing
// `astro` itself, not a new third-party dependency); it is listed explicitly
// in package.json only because this config needs to import it directly,
// per Astro's own documented `markdown.processor` configuration pattern.
export default defineConfig(({ command }) => ({
  site: "https://riauba.org",
  output: "static",
  markdown: {
    processor: satteri({
      mdastPlugins: [
        createSatteriTodoParagraphPlugin({
          enabled: command === "build",
          warn: console.warn,
        }),
      ],
    }),
  },
}));
