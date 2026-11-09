import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Spec 004-deployment-setup-lxc-fixes, AC-1/AC-3: infra/setup-lxc.sh must
// resolve the Caddyfile's {$VAR} tokens from infra/production.env /
// infra/staging.env *before* any install step (including the root check),
// and name exactly which file/variable is missing when either is absent
// or incomplete. Same real-script-spawn harness as
// tests/unit/infra-deploy.test.ts/infra-rollback.test.ts: a scratch copy
// of infra/'s contents, run as this sandbox's/CI's own non-root user
// (neither ever runs tests as root, which is exactly what makes the
// "variable check happens before the root check" ordering testable at
// all -- see the plan's Design decisions).
const infraDir = fileURLToPath(new URL("../../infra/", import.meta.url));
const scriptRelPath = "setup-lxc.sh";

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "riauba-setup-lxc-"));
  copyFileSync(join(infraDir, scriptRelPath), join(scratchDir, scriptRelPath));
  chmodSync(join(scratchDir, scriptRelPath), 0o755);
  copyFileSync(join(infraDir, "Caddyfile"), join(scratchDir, "Caddyfile"));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

function runScript(): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync(join(scratchDir, scriptRelPath), [], {
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

const ROOT_CHECK_MESSAGE = "must be run as root";

describe("infra/setup-lxc.sh variable resolution (AC-1)", () => {
  it("fails before the root check, naming the missing file, when production.env is absent entirely", () => {
    writeFileSync(
      join(scratchDir, "staging.env"),
      "STAGING_HOSTS=staging.riauba.org\n",
    );
    // production.env deliberately not written.
    const result = runScript();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production\.env/);
    expect(result.stderr).toMatch(/PROD_HOSTS/);
    expect(result.stderr).not.toMatch(ROOT_CHECK_MESSAGE);
  });

  it("fails before the root check, naming the missing file, when staging.env is absent entirely", () => {
    writeFileSync(
      join(scratchDir, "production.env"),
      "PROD_HOSTS=riauba.org\n",
    );
    // staging.env deliberately not written.
    const result = runScript();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/staging\.env/);
    expect(result.stderr).toMatch(/STAGING_HOSTS/);
    expect(result.stderr).not.toMatch(ROOT_CHECK_MESSAGE);
  });

  it("fails before the root check, naming the variable, when a file exists but doesn't define its expected variable", () => {
    writeFileSync(join(scratchDir, "production.env"), "SOMETHING_ELSE=value\n");
    writeFileSync(
      join(scratchDir, "staging.env"),
      "STAGING_HOSTS=staging.riauba.org\n",
    );
    const result = runScript();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production\.env/);
    expect(result.stderr).toMatch(/PROD_HOSTS/);
    expect(result.stderr).not.toMatch(ROOT_CHECK_MESSAGE);
  });

  it("reports both problems when both files are missing", () => {
    const result = runScript();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production\.env/);
    expect(result.stderr).toMatch(/staging\.env/);
    expect(result.stderr).not.toMatch(ROOT_CHECK_MESSAGE);
  });

  it("reaches the root check (i.e. passes the variable check) once both files are present and correct", () => {
    writeFileSync(
      join(scratchDir, "production.env"),
      "PROD_HOSTS=riauba.org\n",
    );
    writeFileSync(
      join(scratchDir, "staging.env"),
      "STAGING_HOSTS=staging.riauba.org\n",
    );
    const result = runScript();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(ROOT_CHECK_MESSAGE);
  });

  it("does not create /srv/riauba, a deploy user or touch Caddy when the variable check fails", () => {
    // Nothing a non-root test process could do anyway, but this
    // documents and partially guards the "touching nothing else at
    // all" requirement: the script must exit before any such attempt,
    // so there's no useradd/mkdir/apt-get stdout noise either.
    const result = runScript();
    expect(result.stdout).toBe("");
  });
});

describe("infra/setup-lxc.sh EnvironmentFile/drop-in paths (AC-3)", () => {
  const scriptSource = readFileSync(join(infraDir, scriptRelPath), "utf-8");

  it("references exactly one EnvironmentFile= destination path", () => {
    // Strip trailing quote/backtick characters so a literal path quoted
    // inside a bash string (e.g. `EnvironmentFile=/etc/caddy/env"`) is
    // recognised as the same path as its header-comment documentation.
    const matches = scriptSource.match(/EnvironmentFile=[^\s"'`]+/g) ?? [];
    const distinct = new Set(matches);
    expect(distinct.size).toBe(1);
  });

  it("references exactly one systemd drop-in path under caddy.service.d/", () => {
    const matches =
      scriptSource.match(
        /\/etc\/systemd\/system\/caddy\.service\.d\/[^\s"'`]+/g,
      ) ?? [];
    const distinct = new Set(matches);
    expect(distinct.size).toBe(1);
  });
});

describe("infra/production.env and infra/staging.env (checked-in inputs)", () => {
  it("infra/production.env contains exactly PROD_HOSTS=riauba.org", () => {
    const content = readFileSync(join(infraDir, "production.env"), "utf-8");
    expect(content.trim()).toBe("PROD_HOSTS=riauba.org");
  });

  it("infra/staging.env contains exactly STAGING_HOSTS=staging.riauba.org", () => {
    const content = readFileSync(join(infraDir, "staging.env"), "utf-8");
    expect(content.trim()).toBe("STAGING_HOSTS=staging.riauba.org");
  });

  it("both files exist on disk (sanity check for the test harness itself)", () => {
    expect(existsSync(join(infraDir, "production.env"))).toBe(true);
    expect(existsSync(join(infraDir, "staging.env"))).toBe(true);
  });
});
