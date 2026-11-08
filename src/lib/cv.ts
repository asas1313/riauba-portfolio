import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseCv } from "./cv.schema.ts";
import type { Profile } from "./cv.schema.ts";

/**
 * Resolves the absolute path to content/cv.yaml from the project root,
 * using this module's own location (import.meta.url), not
 * process.cwd() — Vitest and `astro build` invoke modules from different
 * working directories, so a cwd-relative path would be fragile. See
 * ADR-0001.
 */
export function resolveCvPath(): string {
  return fileURLToPath(new URL("../../content/cv.yaml", import.meta.url));
}

function loadCv() {
  const raw = readFileSync(resolveCvPath(), "utf-8");
  const data = parseYaml(raw);
  return parseCv(data);
}

/** Parsed once at module load / build time. */
export const cv = loadCv();

/**
 * Hides any profile entry whose network or url is the literal placeholder
 * string "TODO" (AC-2). The fuller "omit any TODO field + build warning"
 * mechanism is spec 002's job.
 */
export function getVisibleProfiles(profiles: Profile[]): Profile[] {
  return profiles.filter(
    (profile) => profile.network !== "TODO" && profile.url !== "TODO",
  );
}
