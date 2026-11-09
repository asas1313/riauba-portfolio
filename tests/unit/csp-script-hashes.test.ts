import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 004, AC-6/task 6: infra/Caddyfile's CSP allows exactly the two
// inline <script is:inline> blocks shipped by the site (spec 005) via
// sha256-<base64> hashes (never `unsafe-inline`), computed the same way a
// browser would for CSP matching: the exact UTF-8 text content between the
// <script> tags. This test keeps that sync mechanical -- a future edit to
// either script's exact text must update infra/Caddyfile's CSP line too,
// or this test fails loudly.
const baseLayoutPath = fileURLToPath(
  new URL("../../src/components/BaseLayout.astro", import.meta.url),
);
const headerPath = fileURLToPath(
  new URL("../../src/components/Header.astro", import.meta.url),
);
const caddyfilePath = fileURLToPath(
  new URL("../../infra/Caddyfile", import.meta.url),
);

const INLINE_SCRIPT_PATTERN = /<script is:inline>([\s\S]*?)<\/script>/;

function extractInlineScript(path: string): string {
  const source = readFileSync(path, "utf-8");
  const match = source.match(INLINE_SCRIPT_PATTERN);
  if (!match) {
    throw new Error(
      `csp-script-hashes: no <script is:inline> block in ${path}`,
    );
  }
  return match[1];
}

function sha256Token(scriptText: string): string {
  const digest = createHash("sha256")
    .update(scriptText, "utf-8")
    .digest("base64");
  return `'sha256-${digest}'`;
}

describe("CSP sha256 hashes stay in sync with the two inline scripts (AC-6)", () => {
  it("infra/Caddyfile's Content-Security-Policy contains BaseLayout.astro's head script hash", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");
    const token = sha256Token(extractInlineScript(baseLayoutPath));
    expect(caddyfile).toContain(token);
  });

  it("infra/Caddyfile's Content-Security-Policy contains Header.astro's theme-toggle script hash", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");
    const token = sha256Token(extractInlineScript(headerPath));
    expect(caddyfile).toContain(token);
  });

  it("does not fall back to 'unsafe-inline' anywhere in the CSP", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");
    const cspLine = caddyfile
      .split("\n")
      .find((line) => /content-security-policy/i.test(line));
    expect(cspLine).toBeDefined();
    expect(cspLine).not.toMatch(/unsafe-inline/);
  });
});
