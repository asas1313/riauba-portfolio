import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 005, AC-10: no system or CDN font for any rendered text. Every
// `--font-*` token in tokens.css must list the self-hosted family
// ("Inter" / "JetBrains Mono") first; system/generic fallbacks are only
// ever allowed *after* it, never as the sole or first-listed family.
const tokensPath = fileURLToPath(
  new URL("../../src/styles/tokens.css", import.meta.url),
);

const SELF_HOSTED_FAMILIES = ["Inter", "JetBrains Mono"];

describe("font tokens are self-hosted, not system/CDN fonts (AC-10)", () => {
  it("declares at least one --font-* token", () => {
    const css = readFileSync(tokensPath, "utf-8");
    const matches = [...css.matchAll(/--font-[\w-]+:\s*([^;]+);/g)];
    expect(matches.length).toBeGreaterThan(0);
  });

  it("lists a self-hosted family first for every --font-* token", () => {
    const css = readFileSync(tokensPath, "utf-8");
    const matches = [...css.matchAll(/--font-[\w-]+:\s*([^;]+);/g)];
    for (const match of matches) {
      const value = match[1].trim();
      const firstFamily = value.split(",")[0].trim().replace(/^"|"$/g, "");
      expect(SELF_HOSTED_FAMILIES).toContain(firstFamily);
    }
  });
});
