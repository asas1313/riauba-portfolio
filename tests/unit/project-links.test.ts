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

  it("shows a real URL with the expected kind, label and url", () => {
    const result = getVisibleProjectLinks({
      live: "https://example.com",
      docs: null,
      repo: null,
    });
    expect(result).toEqual([
      { kind: "live", label: "Live", url: "https://example.com" },
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
});
