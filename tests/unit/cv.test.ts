import { describe, expect, it } from "vitest";
import { cv } from "../../src/lib/cv.ts";

describe("cv", () => {
  it("loads and parses content/cv.yaml into basics.name", () => {
    expect(cv.basics.name).toBe("Andrius Riauba");
  });

  it("loads the full basics block, not a partial/stale fixture", () => {
    expect(cv.basics.label).toContain("Senior Java Developer");
    expect(cv.basics.email).toBe("andrius@riauba.org");
  });
});
