// @ts-check
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import { createSatteriTodoParagraphPlugin } from "./src/lib/markdown-todo.ts";

// Deviation from ADR-0003's "functional `defineConfig(({ command }) => ({
// ... }))`" wording: Astro's own `defineConfig` (node_modules/astro/dist/
// config/index.js) is a plain identity function — `defineConfig(config) {
// return config; }` — unlike Vite's `defineConfig`, it does not support a
// functional/callback config shape at all (empirically confirmed: a
// function passed as the default export is never invoked). The documented,
// supported way to read the current command (`dev`/`build`/`preview`/
// `sync`) and mutate config in response is an integration's
// `astro:config:setup` hook, which is given both `command` and
// `updateConfig` — so TODO-paragraph stripping (spec 003, AC-5) is wired up
// by a small inline integration instead. See ADR-0003's Addendum and
// src/lib/markdown-todo.ts for why this targets Sätteri's native plugin API
// (`markdown.processor: satteri({ mdastPlugins: [...] })`) rather than the
// classic `markdown.remarkPlugins` the ADR originally specified.
function todoParagraphStrippingIntegration() {
  return {
    name: "todo-paragraph-stripping",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        updateConfig({
          markdown: {
            processor: satteri({
              mdastPlugins: [
                createSatteriTodoParagraphPlugin({
                  // TODOs render as-is in `astro dev`; are stripped in
                  // `astro build` — mirroring cv.publish.ts's
                  // `import.meta.env.PROD` gating, using the config-time
                  // equivalent since `import.meta.env` isn't meaningful
                  // inside astro.config.mjs itself.
                  enabled: command === "build",
                  warn: console.warn,
                }),
              ],
            }),
          },
        });
      },
    },
  };
}

// Static site for riauba.org. No UI framework integrations beyond the one
// above: every page is a plain .astro component with zero client-side
// JavaScript by default.
export default defineConfig({
  site: "https://riauba.org",
  output: "static",
  integrations: [todoParagraphStrippingIntegration()],
});
