// @ts-check
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import {
  createSatteriTodoParagraphPlugin,
  warnAboutTodoParagraphsInFiles,
} from "./src/lib/markdown-todo.ts";

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
//
// Bug fix (review 1, BLOCKER 1): the Sätteri `before` hook above only runs
// as part of Astro's content-layer render step, which Astro's glob loader
// skips entirely for a file whose on-disk digest hasn't changed since the
// last sync — so a second `astro build` in a row against an unchanged,
// warm content-layer cache never re-invokes it, and the warning silently
// stops firing (see src/lib/markdown-todo.ts's "Cache-independent warning"
// header comment for the full investigation and ADR-0003's Addendum). The
// stripping itself stays correct either way (a cache hit means the
// already-stripped `entry.rendered` from the first render is reused), but
// AC-5's warning must fire on *every* build, not just the first one
// against a cold cache. Fix: this integration also hooks `astro:build:
// start` — which Astro calls unconditionally, once per `astro build`,
// before any content-layer sync/caching happens — to scan
// `content/projects/*.md` directly off disk via
// `warnAboutTodoParagraphsInFiles`, independent of the content-layer cache
// entirely. To avoid warning twice for the same file on a cold-cache build
// (once from this scan, once from the Sätteri plugin), the Sätteri
// plugin's own `warn` is a no-op in production; this scan is now the sole
// source of the AC-5 warning.
function todoParagraphStrippingIntegration() {
  let projectsDir;
  return {
    name: "todo-paragraph-stripping",
    hooks: {
      "astro:config:setup": ({ command, config, updateConfig }) => {
        projectsDir = new URL("content/projects/", config.root);
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
                  // No-op: see this function's header comment above.
                  // `warnAboutTodoParagraphsInFiles` (astro:build:start,
                  // below) is the sole source of the AC-5 warning.
                  warn: () => {},
                }),
              ],
            }),
          },
        });
      },
      "astro:build:start": async ({ logger }) => {
        const entries = await readdir(projectsDir, { withFileTypes: true });
        const files = await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
            .map(async (entry) => {
              const fileUrl = new URL(entry.name, projectsDir);
              return {
                path: fileURLToPath(fileUrl),
                rawSource: await readFile(fileUrl, "utf-8"),
              };
            }),
        );
        warnAboutTodoParagraphsInFiles({
          files,
          warn: (message) => logger.warn(message),
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
