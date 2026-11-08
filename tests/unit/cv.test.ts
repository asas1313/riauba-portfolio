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

  it("returns an empty array when given an empty profiles list (boundary)", () => {
    expect(getVisibleProfiles([])).toEqual([]);
  });

  it("returns an empty array when every profile is a TODO placeholder", () => {
    const allTodo: Profile[] = [
      { network: "TODO", url: "TODO" },
      { network: "TODO", url: "https://example.com/not-ready" },
      { network: "Mastodon", url: "TODO" },
    ];
    expect(getVisibleProfiles(allTodo)).toEqual([]);
  });

  it("matches TODO case- and whitespace-insensitively, hiding other casings and whitespace variants too", () => {
    const almostTodo: Profile[] = [
      { network: "todo", url: "https://example.com/lowercase" },
      { network: " TODO", url: "https://example.com/leading-space" },
      { network: "GitLab", url: "https://gitlab.com/andrius" },
    ];
    // "todo" (lowercase) and " TODO" (with stray whitespace) are content
    // typos for the placeholder and must be hidden just like the exact
    // literal "TODO", so a typo never silently publishes a placeholder link.
    expect(getVisibleProfiles(almostTodo).map((p) => p.network)).toEqual([
      "GitLab",
    ]);
  });

  it("also hides a profile whose url is a TODO placeholder with stray casing or whitespace", () => {
    const almostTodoUrl: Profile[] = [
      { network: "Mastodon", url: " todo " },
      { network: "GitLab", url: "https://gitlab.com/andrius" },
    ];
    expect(getVisibleProfiles(almostTodoUrl).map((p) => p.network)).toEqual([
      "GitLab",
    ]);
  });
});
