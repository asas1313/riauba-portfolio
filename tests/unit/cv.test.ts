import { describe, expect, it } from "vitest";
import { cv, getVisibleProfiles } from "../../src/lib/cv.ts";
import type { Profile } from "../../src/lib/cv.schema.ts";

describe("cv", () => {
  it("loads and parses content/cv.yaml into basics.name", () => {
    expect(cv.basics.name).toBe("Andrius Riauba");
  });

  it("loads the full basics block, not a partial/stale fixture", () => {
    expect(cv.basics.label).toContain("Senior Java Developer");
    expect(cv.basics.email).toBe("andrius@riauba.org");
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
