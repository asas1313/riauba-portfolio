import { describe, expect, it } from "vitest";

describe("vitest wiring", () => {
  it("runs unit tests from tests/unit", () => {
    expect(1 + 1).toBe(2);
  });
});
