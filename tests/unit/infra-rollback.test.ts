import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Spec 004, AC-5: infra/rollback.sh <env> [sha] repoints `current` without
// rebuilding, using the same temp-directory + real-script-spawn harness as
// tests/unit/infra-deploy.test.ts.
const deployScript = fileURLToPath(
  new URL("../../infra/deploy.sh", import.meta.url),
);
const rollbackScript = fileURLToPath(
  new URL("../../infra/rollback.sh", import.meta.url),
);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "riauba-rollback-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeDistDir(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "riauba-dist-"));
  writeFileSync(join(dir, "index.html"), contents);
  return dir;
}

function deploy(env: string, sha: string, contents = sha): void {
  execFileSync(deployScript, [env, sha, makeDistDir(contents)], {
    env: { ...process.env, RIAUBA_ROOT: root },
  });
}

function runRollback(
  env: string,
  sha?: string,
): { status: number | null; stdout: string; stderr: string } {
  const args = sha === undefined ? [env] : [env, sha];
  try {
    const stdout = execFileSync(rollbackScript, args, {
      env: { ...process.env, RIAUBA_ROOT: root },
      encoding: "utf-8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const execError = error as {
      status: number | null;
      stdout: string;
      stderr: string;
    };
    return {
      status: execError.status,
      stdout: execError.stdout?.toString() ?? "",
      stderr: execError.stderr?.toString() ?? "",
    };
  }
}

function currentTarget(env: string): string {
  return readlinkSync(join(root, env, "current"));
}

describe("infra/rollback.sh (AC-5)", () => {
  it("with no sha, repoints current to the release deployed immediately before the live one", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    deploy("staging", "shaC");
    expect(currentTarget("staging")).toBe("releases/shaC");

    const result = runRollback("staging");
    expect(result.status).toBe(0);
    expect(currentTarget("staging")).toBe("releases/shaB");
  });

  it("walks further back through releases.log on a rollback-of-a-rollback, never bouncing between the same two releases", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    deploy("staging", "shaC");

    runRollback("staging"); // -> shaB
    expect(currentTarget("staging")).toBe("releases/shaB");

    runRollback("staging"); // must go further back to shaA, not bounce to shaC
    expect(currentTarget("staging")).toBe("releases/shaA");
  });

  it("after a deploy-after-rollback, finds the release actually live immediately before the new deploy, not the deploy-chronology neighbor", () => {
    // Regression test (QA finding): deploy A, B, C; roll back (no sha) to
    // B; deploy D (a hotfix on top of the rolled-back B); roll back again
    // (no sha) must land on B -- the release that was actually live
    // immediately before D was deployed -- never C (D's neighbor in pure
    // deploy order, which was never live at the time D went out).
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    deploy("staging", "shaC");

    runRollback("staging"); // -> shaB
    expect(currentTarget("staging")).toBe("releases/shaB");

    deploy("staging", "shaD"); // hotfix deployed on top of the rolled-back B
    expect(currentTarget("staging")).toBe("releases/shaD");

    runRollback("staging"); // must land on shaB, not shaC
    expect(currentTarget("staging")).toBe("releases/shaB");
  });

  it("after an explicit-sha rollback, a following no-sha rollback undoes that jump (goes to what was live right before it), not the deploy-chronology walk-back", () => {
    // Regression test (QA finding, round 2): deploy A, B, C, D; an
    // *explicit* rollback to B is a deliberate jump, distinct from an
    // *automatic* (no-sha) walk-back. Undoing it with a no-sha rollback
    // must return to D -- the release actually live immediately before
    // the explicit jump -- never fall into the deploy-chronology
    // walk-back logic (which is reserved for undoing a *previous no-sha*
    // rollback) and land on A instead.
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    deploy("staging", "shaC");
    deploy("staging", "shaD");
    expect(currentTarget("staging")).toBe("releases/shaD");

    runRollback("staging", "shaB"); // deliberate explicit jump
    expect(currentTarget("staging")).toBe("releases/shaB");

    runRollback("staging"); // undo the jump -> must land on shaD
    expect(currentTarget("staging")).toBe("releases/shaD");
  });

  it("with an explicit sha, repoints to that exact release", () => {
    deploy("production", "shaA");
    deploy("production", "shaB");
    deploy("production", "shaC");

    const result = runRollback("production", "shaA");
    expect(result.status).toBe(0);
    expect(currentTarget("production")).toBe("releases/shaA");
  });

  it("fails loudly and leaves current unchanged when the given sha doesn't exist under releases/", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");

    const before = currentTarget("staging");
    const result = runRollback("staging", "does-not-exist");
    expect(result.status).not.toBe(0);
    expect(currentTarget("staging")).toBe(before);
  });

  it("rewrites DEPLOYED to the sha it rolled back to", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    deploy("staging", "shaC");

    runRollback("staging", "shaA");
    const deployed = readFileSync(join(root, "staging", "DEPLOYED"), "utf-8");
    expect(deployed).toMatch(/^shaA\s+\S+/);
  });

  it("appends a rollback-explicit line to releases.log for an explicit-sha rollback, distinct from deploy lines", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    runRollback("staging", "shaA");

    const log = readFileSync(join(root, "staging", "releases.log"), "utf-8");
    const lines = log.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^shaA\s+\S+\s+rollback-explicit$/);
  });

  it("appends a rollback-auto line to releases.log for a no-sha rollback, distinct from deploy and rollback-explicit lines", () => {
    deploy("staging", "shaA");
    deploy("staging", "shaB");
    runRollback("staging");

    const log = readFileSync(join(root, "staging", "releases.log"), "utf-8");
    const lines = log.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^shaA\s+\S+\s+rollback-auto$/);
  });
});
