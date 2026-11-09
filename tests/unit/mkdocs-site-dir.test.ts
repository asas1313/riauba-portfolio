import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Spec 004, AC-9: the deploy workflows need `make docs SITE_DIR=dist/docs`
// so /docs/ ships inside the same build artifact as the rest of the site,
// while plain `make docs`/CI keep writing to `site/` (today's behaviour)
// when SITE_DIR isn't overridden.
const makefilePath = fileURLToPath(new URL("../../Makefile", import.meta.url));

describe("Makefile `docs` target supports SITE_DIR (AC-9)", () => {
  it("defaults SITE_DIR to 'site'", () => {
    const makefile = readFileSync(makefilePath, "utf-8");
    expect(makefile).toMatch(/SITE_DIR\s*\?=\s*site\b/);
  });

  it("passes SITE_DIR to mkdocs build via --site-dir", () => {
    const makefile = readFileSync(makefilePath, "utf-8");
    expect(makefile).toMatch(
      /mkdocs build --strict --site-dir[= ]\$\(SITE_DIR\)/,
    );
  });
});
