import { describe, expect, it } from "vitest";
import { getVisibleProjectLinks } from "../../src/lib/project-links.ts";

describe("getVisibleProjectLinks (AC-4)", () => {
  it("hides a link whose value is null", () => {
    const result = getVisibleProjectLinks({
      live: "https://example.com",
      docs: null,
      repo: null,
    });
    expect(result.map((link) => link.kind)).toEqual(["live"]);
  });

  it('hides a link whose value is the literal string "TODO"', () => {
    const result = getVisibleProjectLinks({
      live: "TODO",
      docs: "https://docs.example.com",
      repo: null,
    });
    expect(result.map((link) => link.kind)).toEqual(["docs"]);
  });

  it("shows a real URL with the expected kind, label, url and isPrimary", () => {
    const result = getVisibleProjectLinks({
      live: "https://example.com",
      docs: null,
      repo: null,
    });
    expect(result).toEqual([
      {
        kind: "live",
        label: "Live",
        url: "https://example.com",
        isPrimary: true,
      },
    ]);
  });

  it("keeps a stable live/docs/repo ordering regardless of which are set", () => {
    const result = getVisibleProjectLinks({
      live: "https://live.example.com",
      docs: "https://docs.example.com",
      repo: "https://repo.example.com",
    });
    expect(result.map((link) => link.kind)).toEqual(["live", "docs", "repo"]);
  });

  it("returns an empty array when every link is null (boundary)", () => {
    expect(
      getVisibleProjectLinks({ live: null, docs: null, repo: null }),
    ).toEqual([]);
  });

  it('returns an empty array when every link is "TODO" (boundary)', () => {
    expect(
      getVisibleProjectLinks({ live: "TODO", docs: "TODO", repo: "TODO" }),
    ).toEqual([]);
  });

  // Spec 005, decision 4: button primary/secondary assignment is by link
  // *type* (live > docs > repo), not DOM position/"first visible link".
  describe("isPrimary is type-based, not positional (spec 005, AC-8's task 8)", () => {
    it("makes live primary when live, docs and repo are all present", () => {
      const result = getVisibleProjectLinks({
        live: "https://live.example.com",
        docs: "https://docs.example.com",
        repo: "https://repo.example.com",
      });
      expect(result.map((l) => [l.kind, l.isPrimary])).toEqual([
        ["live", true],
        ["docs", false],
        ["repo", false],
      ]);
    });

    it("makes docs primary (not repo) when live is absent but docs and repo are present -- proves type-based priority, not just first-in-DOM", () => {
      const result = getVisibleProjectLinks({
        live: null,
        docs: "https://docs.example.com",
        repo: "https://repo.example.com",
      });
      expect(result.map((l) => [l.kind, l.isPrimary])).toEqual([
        ["docs", true],
        ["repo", false],
      ]);
    });

    it("makes docs primary when live is TODO-marked (treated the same as absent)", () => {
      const result = getVisibleProjectLinks({
        live: "TODO",
        docs: "https://docs.example.com",
        repo: "https://repo.example.com",
      });
      expect(result.map((l) => [l.kind, l.isPrimary])).toEqual([
        ["docs", true],
        ["repo", false],
      ]);
    });

    it("makes repo primary when only repo is present", () => {
      const result = getVisibleProjectLinks({
        live: null,
        docs: null,
        repo: "https://repo.example.com",
      });
      expect(result).toEqual([
        {
          kind: "repo",
          label: "Repo",
          url: "https://repo.example.com",
          isPrimary: true,
        },
      ]);
    });
  });
});
