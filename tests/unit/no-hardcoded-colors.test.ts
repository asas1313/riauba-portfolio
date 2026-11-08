import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 005, AC-1 / task 2: src/styles/tokens.css is the *only* place colour
// literals may be declared. Every other src/**/*.css file, and every
// <style> block inside src/**/*.astro, must reference colours exclusively
// via `var(--color-*)` custom properties.
const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));
const tokensPath = fileURLToPath(
  new URL("../../src/styles/tokens.css", import.meta.url),
);

const COLOR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|oklch)\(/g;

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = `${dir}/${entry}`.replace(/\/{2,}/g, "/");
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function findColorLiterals(text: string): { line: number; match: string }[] {
  const findings: { line: number; match: string }[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const matches = line.match(COLOR_LITERAL_PATTERN);
    if (matches) {
      for (const match of matches) {
        findings.push({ line: index + 1, match });
      }
    }
  });
  return findings;
}

function extractStyleBlocks(astroSource: string): string {
  const blocks = [...astroSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return blocks.map((block) => block[1]).join("\n");
}

describe("no hard-coded colour literals outside tokens.css (AC-1)", () => {
  it("has a tokens.css file that itself contains at least one colour literal", () => {
    const tokens = readFileSync(tokensPath, "utf-8");
    expect(findColorLiterals(tokens).length).toBeGreaterThan(0);
  });

  it("flags every hex/rgb/rgba/hsl/oklch colour literal outside tokens.css", () => {
    const files = walk(srcDir).filter(
      (file) => file.endsWith(".css") || file.endsWith(".astro"),
    );
    const offenders: string[] = [];
    for (const file of files) {
      if (file === tokensPath) continue;
      const raw = readFileSync(file, "utf-8");
      const text = file.endsWith(".astro") ? extractStyleBlocks(raw) : raw;
      const findings = findColorLiterals(text);
      for (const finding of findings) {
        offenders.push(`${file}:${finding.line} -> ${finding.match}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
