import { parse as parseYaml } from "yaml";
import { parseCv } from "./cv.schema.ts";
import type { Profile } from "./cv.schema.ts";
// Imported as a raw string via Vite's `?raw` suffix, not read with node:fs
// at runtime: Vite resolves `?raw` imports against this module's *source*
// location at transform time and inlines the file's contents as a string
// literal in the output. This is deliberately not
// `new URL("../../content/cv.yaml", import.meta.url)` + `readFileSync`:
// that pattern is Vite's asset-URL convention (rewritten to point at the
// final location *within dist/*, since it assumes the asset should ship to
// the browser), which breaks here because `astro build` bundles this module
// into a temporary `dist/.prerender/chunks/...` location for prerendering —
// a relative-from-module-location fs path computed from that chunk's
// position no longer points at the real content/cv.yaml. The `?raw` import
// has no such problem: it is resolved once, during the build's module graph
// analysis, against the real source file, independent of both
// process.cwd() and where the importing module ends up being bundled. See
// ADR-0001.
import rawCvYaml from "../../content/cv.yaml?raw";

function loadCv() {
  const data = parseYaml(rawCvYaml);
  return parseCv(data);
}

/** Parsed once at module load / build time. */
export const cv = loadCv();

/**
 * Returns true when `value` is the placeholder string "TODO", ignoring
 * surrounding whitespace and casing (so content typos like "todo" or
 * " TODO" are still treated as placeholders rather than being silently
 * published).
 */
function isTodoPlaceholder(value: string): boolean {
  return value.trim().toUpperCase() === "TODO";
}

/**
 * Hides any profile entry whose network or url is the placeholder string
 * "TODO" (AC-2), matched case- and whitespace-insensitively. The fuller
 * "omit any TODO field + build warning" mechanism is spec 002's job.
 */
export function getVisibleProfiles(profiles: Profile[]): Profile[] {
  return profiles.filter(
    (profile) =>
      !isTodoPlaceholder(profile.network) && !isTodoPlaceholder(profile.url),
  );
}
