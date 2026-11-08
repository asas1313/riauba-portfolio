import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cv, getVisibleProfiles, resolveCvPath } from "../../src/lib/cv.ts";
import type { Profile } from "../../src/lib/cv.schema.ts";

describe("cv", () => {
  it("loads and parses content/cv.yaml into basics.name", () => {
    expect(cv.basics.name).toBe("Andrius Riauba");
  });
});

describe("resolveCvPath", () => {
  it("resolves content/cv.yaml relative to the project root, not process.cwd()", () => {
    const resolved = resolveCvPath();
    expect(existsSync(resolved)).toBe(true);
    expect(
      resolved.endsWith("content/cv.yaml") ||
        resolved.endsWith("content\\cv.yaml"),
    ).toBe(true);
  });

  it("stays correct even if the current working directory changes", () => {
    const before = resolveCvPath();
    const originalCwd = process.cwd();
    process.chdir("/tmp");
    try {
      const after = resolveCvPath();
      expect(after).toBe(before);
      expect(existsSync(after)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("getVisibleProfiles", () => {
  const profiles: Profile[] = [
    { network: "LinkedIn", url: "https://www.linkedin.com/in/andrius-r" },
    { network: "GitHub", url: "https://github.com/asas1313" },
    { network: "TODO", url: "https://example.com/not-ready" },
    { network: "Mastodon", url: "TODO" },
  ];

  it("hides profiles whose network or url is the literal string TODO", () => {
    const visible = getVisibleProfiles(profiles);
    expect(visible.map((profile) => profile.network)).toEqual([
      "LinkedIn",
      "GitHub",
    ]);
  });
});
