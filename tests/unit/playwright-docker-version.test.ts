import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 005, AC-11 / ADR-0004: the Playwright Docker image tag referenced by
// the Makefile's `visual`/`visual-update` targets and by
// .github/workflows/ci.yml's visual job must always name the exact same
// `@playwright/test` version as package-lock.json, so the two can never
// silently drift apart.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const IMAGE_TAG_PATTERN =
  /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-\S+/g;

function findImageVersions(text: string): string[] {
  return [...text.matchAll(IMAGE_TAG_PATTERN)].map((match) => match[1]);
}

function installedPlaywrightVersion(): string {
  const lockfile = JSON.parse(
    readFileSync(`${repoRoot}package-lock.json`, "utf-8"),
  ) as { packages: Record<string, { version?: string }> };
  const pkg = lockfile.packages["node_modules/@playwright/test"];
  if (!pkg?.version) {
    throw new Error(
      "playwright-docker-version: could not read @playwright/test's installed version from package-lock.json",
    );
  }
  return pkg.version;
}

describe("Playwright Docker image version pin (AC-11)", () => {
  const installedVersion = installedPlaywrightVersion();

  it("Makefile references the pinned image at least once, matching the installed @playwright/test version", () => {
    const makefile = readFileSync(`${repoRoot}Makefile`, "utf-8");
    const versions = findImageVersions(makefile);
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(version).toBe(installedVersion);
    }
  });

  it("ci.yml references the pinned image at least once, matching the installed @playwright/test version", () => {
    const ciYml = readFileSync(`${repoRoot}.github/workflows/ci.yml`, "utf-8");
    const versions = findImageVersions(ciYml);
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(version).toBe(installedVersion);
    }
  });

  it("Makefile and ci.yml reference the exact same image tag (including codename)", () => {
    const makefile = readFileSync(`${repoRoot}Makefile`, "utf-8");
    const ciYml = readFileSync(`${repoRoot}.github/workflows/ci.yml`, "utf-8");
    const fullTagPattern = /mcr\.microsoft\.com\/playwright:v\S+/g;
    const makefileTags = new Set(makefile.match(fullTagPattern));
    const ciTags = new Set(ciYml.match(fullTagPattern));
    expect(makefileTags.size).toBeGreaterThan(0);
    expect(ciTags).toEqual(makefileTags);
  });
});
