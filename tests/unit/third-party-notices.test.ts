import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 005, AC-7: AstroPaper MIT notice included in THIRD_PARTY_NOTICES for
// any ported styles.
const noticesPath = fileURLToPath(
  new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url),
);

describe("THIRD_PARTY_NOTICES.md (AC-7)", () => {
  it("exists at the repo root and mentions AstroPaper and MIT", () => {
    const text = readFileSync(noticesPath, "utf-8");
    expect(text).toContain("AstroPaper");
    expect(text).toContain("MIT");
  });

  it("also credits the self-hosted fonts (Inter and JetBrains Mono)", () => {
    const text = readFileSync(noticesPath, "utf-8");
    expect(text).toContain("Inter");
    expect(text).toContain("JetBrains Mono");
    expect(text).toContain("OFL");
  });
});
