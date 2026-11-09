import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Spec 004, AC-4: infra/deploy.sh <env> <sha> <dist-dir> copies to
// releases/<sha>/, atomically switches `current`, prunes to 5 newest
// (by releases.log order, never directory mtime), writes DEPLOYED, and
// rejects any env other than staging|production. Spawns the real script
// (not a reimplementation) against a fs.mkdtempSync temp directory, per
// the plan's "Resolved decisions" (same tool as
// tests/unit/playwright-docker-version.test.ts/third-party-notices.test.ts
// -- read non-TypeScript project files directly, no new shell-testing
// framework).
const deployScript = fileURLToPath(
  new URL("../../infra/deploy.sh", import.meta.url),
);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "riauba-deploy-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeDistDir(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "riauba-dist-"));
  writeFileSync(join(dir, "index.html"), contents);
  return dir;
}

function runDeploy(
  env: string,
  sha: string,
  distDir: string,
): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(deployScript, [env, sha, distDir], {
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

describe("infra/deploy.sh (AC-4)", () => {
  it("rejects an env other than staging|production and writes nothing", () => {
    const dist = makeDistDir("hello");
    const result = runDeploy("preprod", "abc123", dist);
    expect(result.status).not.toBe(0);
    expect(existsSync(join(root, "preprod"))).toBe(false);
  });

  it("copies the dist dir to releases/<sha>/ and switches current to it", () => {
    const dist = makeDistDir("hello from sha1");
    const result = runDeploy("staging", "sha1", dist);
    expect(result.status).toBe(0);

    const currentIndex = join(root, "staging", "current", "index.html");
    expect(readFileSync(currentIndex, "utf-8")).toBe("hello from sha1");

    const releaseIndex = join(
      root,
      "staging",
      "releases",
      "sha1",
      "index.html",
    );
    expect(readFileSync(releaseIndex, "utf-8")).toBe("hello from sha1");
  });

  it("writes releases/<sha>/version.txt containing exactly the sha", () => {
    const dist = makeDistDir("v1");
    runDeploy("staging", "deadbeef", dist);
    const versionTxt = readFileSync(
      join(root, "staging", "releases", "deadbeef", "version.txt"),
      "utf-8",
    );
    expect(versionTxt).toBe("deadbeef");
  });

  it("writes DEPLOYED with the sha and a parseable UTC timestamp", () => {
    const dist = makeDistDir("v1");
    runDeploy("production", "feed1234", dist);
    const deployed = readFileSync(
      join(root, "production", "DEPLOYED"),
      "utf-8",
    );
    const match = deployed.match(
      /^feed1234\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s*$/,
    );
    expect(match).not.toBeNull();
    expect(Number.isNaN(new Date(match![1]).getTime())).toBe(false);
  });

  it("appends one append-only line per deploy to releases.log", () => {
    const dist1 = makeDistDir("v1");
    const dist2 = makeDistDir("v2");
    runDeploy("staging", "shaA", dist1);
    runDeploy("staging", "shaB", dist2);

    const log = readFileSync(join(root, "staging", "releases.log"), "utf-8");
    const lines = log.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^shaA\s+\S+\s+deploy$/);
    expect(lines[1]).toMatch(/^shaB\s+\S+\s+deploy$/);
  });

  it("switches current atomically across a second deploy, keeping both releases", () => {
    const dist1 = makeDistDir("v1");
    const dist2 = makeDistDir("v2");
    runDeploy("staging", "shaA", dist1);
    runDeploy("staging", "shaB", dist2);

    const currentTarget = readlinkSync(join(root, "staging", "current"));
    expect(currentTarget).toBe("releases/shaB");

    const releases = readdirSync(join(root, "staging", "releases")).sort();
    expect(releases).toEqual(["shaA", "shaB"]);
  });

  it("prunes releases/* to exactly 5 directories after a 7th deploy, keeping current's target", () => {
    for (let n = 1; n <= 7; n += 1) {
      const dist = makeDistDir(`v${n}`);
      runDeploy("staging", `sha${n}`, dist);
    }

    const releases = readdirSync(join(root, "staging", "releases")).sort();
    expect(releases).toHaveLength(5);

    const currentTarget = readlinkSync(join(root, "staging", "current"));
    expect(currentTarget).toBe("releases/sha7");
    expect(releases).toContain("sha7");
    // Oldest two (sha1, sha2) must have been pruned; the 5 most-recently
    // logged (sha3..sha7) survive.
    expect(releases).not.toContain("sha1");
    expect(releases).not.toContain("sha2");
  });

  it("prunes by releases.log order, never by directory mtime", () => {
    for (let n = 1; n <= 5; n += 1) {
      const dist = makeDistDir(`v${n}`);
      runDeploy("staging", `sha${n}`, dist);
    }
    // sha1 is the oldest by log order but gets the newest mtime -- if
    // pruning ever used mtime instead of releases.log order, sha1 would
    // survive the next deploy. It must not.
    const sha1Dir = join(root, "staging", "releases", "sha1");
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    utimesSync(sha1Dir, future, future);

    const dist6 = makeDistDir("v6");
    runDeploy("staging", "sha6", dist6);

    const releases = readdirSync(join(root, "staging", "releases"));
    expect(releases).not.toContain("sha1");
    expect(releases).toHaveLength(5);
  });

  it("redeploying the same already-current sha ends with the new content live", () => {
    // Deterministic end-state check for "deploy the same sha twice in a
    // row" (e.g. a re-run of a failed workflow, or a resolved production
    // sha that happens to already be live): the second deploy's content
    // must win, releases.log gets one line per call, and the sha is
    // never pruned (it's always `current`'s own target).
    const sha = "shaRedeployed";
    runDeploy("staging", sha, makeDistDir("v1"));
    expect(
      readFileSync(
        join(root, "staging", "releases", sha, "index.html"),
        "utf-8",
      ),
    ).toBe("v1");

    const result = runDeploy("staging", sha, makeDistDir("v2"));
    expect(result.status).toBe(0);
    expect(
      readFileSync(
        join(root, "staging", "releases", sha, "index.html"),
        "utf-8",
      ),
    ).toBe("v2");
    expect(readlinkSync(join(root, "staging", "current"))).toBe(
      `releases/${sha}`,
    );

    const log = readFileSync(join(root, "staging", "releases.log"), "utf-8");
    expect(log.trim().split("\n")).toHaveLength(2);
  });

  it("redeploying the sha that current already points at never exposes an empty or partial release directory (AC-4 atomicity)", async () => {
    // Regression test (review finding): infra/deploy.sh used to
    // `rm -rf releases/<sha>` followed by `cp -a` straight into place,
    // leaving a window where `current` pointed at an empty/partial
    // directory while redeploying a sha that was already live (e.g. a
    // re-run of a failed workflow). A large-enough dist dir makes that
    // window observable by a tight concurrent poll if it exists; the
    // fixed implementation (build into a temp dir, then `mv -T` into
    // place) never creates such a window at all, so this never flakes
    // on correct code -- it can only fail to catch a reintroduced bug if
    // the copy is implausibly fast.
    const sha = "shaAtomicRedeploy";
    const fileCount = 400;

    function makeBigDistDir(tag: string): string {
      const dir = mkdtempSync(join(tmpdir(), "riauba-dist-big-"));
      for (let i = 0; i < fileCount; i += 1) {
        writeFileSync(join(dir, `file-${i}.txt`), `${tag}-${i}`);
      }
      return dir;
    }

    runDeploy("staging", sha, makeBigDistDir("v1"));
    expect(readlinkSync(join(root, "staging", "current"))).toBe(
      `releases/${sha}`,
    );

    const releaseDir = join(root, "staging", "releases", sha);
    const expectedFullCount = fileCount + 1; // + version.txt

    let sawEmptyWindow = false;
    let sawPartialWindow = false;
    const poll = setInterval(() => {
      if (!existsSync(releaseDir)) {
        sawEmptyWindow = true;
        return;
      }
      const entryCount = readdirSync(releaseDir).length;
      if (entryCount > 0 && entryCount < expectedFullCount) {
        sawPartialWindow = true;
      }
    }, 0);

    try {
      const child = spawn(
        deployScript,
        ["staging", sha, makeBigDistDir("v2")],
        { env: { ...process.env, RIAUBA_ROOT: root } },
      );
      const exitCode: number = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? -1));
      });
      expect(exitCode).toBe(0);
    } finally {
      clearInterval(poll);
    }

    expect(sawEmptyWindow).toBe(false);
    expect(sawPartialWindow).toBe(false);
    expect(readFileSync(join(releaseDir, "file-0.txt"), "utf-8")).toBe("v2-0");
  });

  it("sweeps orphaned .content/ directories left by a crashed deploy, without touching referenced ones", () => {
    // Regression test (review iteration 2 finding): releases/<sha> is a
    // symlink into .content/<sha>.<nonce>/, switched into place with a
    // single atomic `mv -T`. A deploy.sh run killed between finishing the
    // `cp -a` into .content/ and performing that swap (OOM, a
    // cancelled/retried workflow, an LXC reboot -- all realistic on this
    // LXC's constrained resources) leaves the physical directory behind
    // with no releases/ symlink ever pointing at it, and nothing used to
    // ever revisit .content/ to notice. deploy.sh must sweep .content/ on
    // every invocation and delete any directory whose name isn't
    // currently the `readlink` target of some releases/ symlink, while
    // leaving legitimately-referenced content alone.
    runDeploy("staging", "shaKeep", makeDistDir("v1"));

    const contentDir = join(root, "staging", ".content");
    const orphanDir = join(contentDir, "orphan.99999");
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, "index.html"), "orphaned");

    runDeploy("staging", "shaNew", makeDistDir("v2"));

    expect(existsSync(orphanDir)).toBe(false);
    expect(
      readFileSync(
        join(root, "staging", "releases", "shaKeep", "index.html"),
        "utf-8",
      ),
    ).toBe("v1");
    expect(
      readFileSync(
        join(root, "staging", "releases", "shaNew", "index.html"),
        "utf-8",
      ),
    ).toBe("v2");
  });

  it("creates a fresh releases dir structure per environment", () => {
    mkdirSync(root, { recursive: true });
    const dist = makeDistDir("v1");
    runDeploy("staging", "shaA", dist);
    expect(existsSync(join(root, "production"))).toBe(false);
  });
});
