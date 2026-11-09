import { describe, expect, it } from "vitest";
import { buildRobotsTxt } from "../../src/lib/robots.ts";

// Spec 004, AC-7: staging (and production while PROD_NOINDEX=true) must
// disallow everything in robots.txt; both environments otherwise allow it.
describe("buildRobotsTxt", () => {
  it("disallows everything when noindex is true", () => {
    expect(buildRobotsTxt(true)).toBe("User-agent: *\nDisallow: /\n");
  });

  it("allows everything when noindex is false", () => {
    expect(buildRobotsTxt(false)).toBe("User-agent: *\nAllow: /\n");
  });
});
