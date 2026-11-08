import { parse as parseYaml } from "yaml";
import { parseCv } from "./cv.schema.ts";
import type { Work } from "./cv.schema.ts";
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

// No-end-date ("ongoing") entries must sort as the most recent entry.
// Lexically greater than any real "YYYY" or "YYYY-MM" date for the
// foreseeable future, so it only ever matters as a comparison sentinel and
// is never written to output.
const ONGOING_SENTINEL = "9999-99";

/**
 * Sorts work entries reverse-chronologically (AC-1): by `endDate` (treating
 * a missing `endDate` — an ongoing role — as the most recent), then by
 * `startDate` as a tie-break, both descending.
 */
export function getWorkReverseChronological(work: Work[]): Work[] {
  return [...work].sort((a, b) => {
    const aEnd = a.endDate ?? ONGOING_SENTINEL;
    const bEnd = b.endDate ?? ONGOING_SENTINEL;
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
    return b.startDate.localeCompare(a.startDate);
  });
}
