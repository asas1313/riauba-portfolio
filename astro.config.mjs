// @ts-check
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { satteri } from "@astrojs/markdown-satteri";
import {
  createSatteriTodoParagraphPlugin,
  warnAboutTodoParagraphsInFiles,
} from "./src/lib/markdown-todo.ts";
import { resolveSiteUrl } from "./src/lib/site-url.ts";

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

// Spec 004, AC-1/task 1: `site` is no longer a static top-level value —
// it must be `SITE_URL`, read per the real Astro `command` (`build` requires
// it; `dev`/`preview`/`check`/`sync` fall back to a local default), which
// `defineConfig` itself cannot express (see this file's header comment on
// why a functional default export doesn't work). A second small inline
// integration, same `astro:config:setup({ command, updateConfig })` shape
// as `todoParagraphStrippingIntegration` above, calls `updateConfig` once
// `command` is known.
function siteUrlIntegration() {
  return {
    name: "site-url",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        updateConfig({ site: resolveSiteUrl(process.env, command) });
      },
    },
  };
}

// Spec 004, AC-7/task 2: writes an empty `dist/.noindex` sentinel file
// whenever the build ran with `NOINDEX=true` (staging: always; production:
// driven by `PROD_NOINDEX`). The build itself produces only static files —
// nothing serves them over HTTP at request time — so this sentinel is what
// lets infra/Caddyfile's `@noindex file .noindex` matcher (resolved
// relative to that site block's own `root`) add the
// `X-Robots-Tag: noindex, nofollow` header per the
// *currently deployed* release, without Caddy needing its own copy of the
// `NOINDEX` flag. `robots.txt.ts` reads the same `NOINDEX` flag directly,
// so the file and the header can never disagree within one release.
function noindexSentinelIntegration() {
  return {
    name: "noindex-sentinel",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        if (process.env.NOINDEX === "true") {
          await writeFile(new URL(".noindex", dir), "");
        }
      },
    },
  };
}

// Static site for riauba.org. No UI framework integrations beyond the three
// above: every page is a plain .astro component with zero client-side
// JavaScript by default.
export default defineConfig({
  output: "static",
  // Spec 004, task 6: every stylesheet stays an external, content-hashed
  // `_astro/*.css` file — Astro never inlines a `<style>` block's CSS into
  // the HTML, which would otherwise silently need its own `style-src`
  // hash/`unsafe-inline` allowance in infra/Caddyfile's CSP.
  build: {
    inlineStylesheets: "never",
  },
  integrations: [
    todoParagraphStrippingIntegration(),
    siteUrlIntegration(),
    noindexSentinelIntegration(),
  ],
});
