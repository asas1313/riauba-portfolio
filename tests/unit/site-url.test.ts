import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "../../src/lib/site-url.ts";

// Spec 004, AC-1: SITE_URL build variable drives every absolute URL; the
// build fails loudly if it is missing or configured-but-empty, while every
// other Astro command keeps working locally without it.
describe("resolveSiteUrl", () => {
  it("throws a descriptive error when command is 'build' and SITE_URL is unset", () => {
    expect(() => resolveSiteUrl({}, "build")).toThrow(/SITE_URL/);
  });

  it("throws when command is 'build' and SITE_URL is an empty string (configured but empty)", () => {
    expect(() => resolveSiteUrl({ SITE_URL: "" }, "build")).toThrow(/SITE_URL/);
  });

  it("throws when command is 'build' and SITE_URL is only whitespace", () => {
    expect(() => resolveSiteUrl({ SITE_URL: "   " }, "build")).toThrow(
      /SITE_URL/,
    );
  });

  it("returns the trimmed SITE_URL when building with it set", () => {
    expect(
      resolveSiteUrl({ SITE_URL: "  https://staging.riauba.org  " }, "build"),
    ).toBe("https://staging.riauba.org");
  });

  it("falls back to http://localhost:4321 for 'dev' without SITE_URL", () => {
    expect(resolveSiteUrl({}, "dev")).toBe("http://localhost:4321");
  });

  it("falls back to http://localhost:4321 for 'preview' without SITE_URL", () => {
    expect(resolveSiteUrl({}, "preview")).toBe("http://localhost:4321");
  });

  it("falls back to http://localhost:4321 for 'check' without SITE_URL", () => {
    expect(resolveSiteUrl({}, "check")).toBe("http://localhost:4321");
  });

  it("falls back to http://localhost:4321 for 'sync' without SITE_URL", () => {
    expect(resolveSiteUrl({}, "sync")).toBe("http://localhost:4321");
  });

  it("still honours an explicit SITE_URL for non-build commands", () => {
    expect(resolveSiteUrl({ SITE_URL: "https://example.test" }, "dev")).toBe(
      "https://example.test",
    );
  });
});
