// Regression test for review 1's BLOCKER 1: `astro build` run twice in a
// row against unchanged real TODO content (content/projects/atsidek.md and
// payments-migration.md both have a real top-level TODO paragraph) must
// warn about both files on *every* run, not just the first one against a
// cold content-layer cache. See src/lib/markdown-todo.ts's "Cache-
// independent warning" header comment and ADR-0003's Addendum for the full
// investigation. This spawns the real `astro` CLI rather than only
// exercising `warnAboutTodoParagraphsInFiles` directly, so it would have
// caught the original bug (which was in how/when astro.config.mjs invoked
// the warning, not in the pure functions themselves).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function runAstroBuild(): string {
  return execFileSync("npx", ["astro", "build"], {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();
}

describe("astro build TODO warning (AC-5) across repeated builds", () => {
  it("warns about both real TODO-marked project files on a first build, and again on an immediately-following second build with an unchanged, warm content-layer cache", () => {
    const firstRun = runAstroBuild();
    expect(firstRun).toContain("atsidek.md");
    expect(firstRun).toContain("payments-migration.md");
    expect(firstRun).toMatch(/markdown-todo: omitted 1 TODO-marked/);

    const secondRun = runAstroBuild();
    expect(secondRun).toContain("atsidek.md");
    expect(secondRun).toContain("payments-migration.md");
    expect(secondRun).toMatch(/markdown-todo: omitted 1 TODO-marked/);
  }, 60_000);
});
