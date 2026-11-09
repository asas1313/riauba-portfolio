import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

// Spec 004, AC-2/AC-3/AC-12 + Security hardening (items 15/16): the
// self-hosted `homelab-riauba` runner must never execute ci/claude-review
// jobs, every deploy/rollback workflow must actually use it for its
// deploy-side job(s) while keeping build jobs on ubuntu-latest, and every
// job that does run on it must be gated to Andrius' own GitHub actor.
const workflowsDir = fileURLToPath(
  new URL("../../.github/workflows/", import.meta.url),
);

interface WorkflowJob {
  "runs-on"?: string | string[];
  if?: string;
}

interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(filename: string): Workflow {
  return parseYaml(readFileSync(`${workflowsDir}${filename}`, "utf-8"));
}

function runsOnHomelab(job: WorkflowJob): boolean {
  const runsOn = job["runs-on"];
  if (runsOn === undefined) return false;
  const labels = Array.isArray(runsOn) ? runsOn : [runsOn];
  return labels.includes("homelab-riauba");
}

const workflowFiles = readdirSync(workflowsDir).filter(
  (file) => file.endsWith(".yml") || file.endsWith(".yaml"),
);

describe("self-hosted runner isolation (AC-2/AC-3/AC-12)", () => {
  it("every workflow file in .github/workflows/ parses to at least one job", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
    for (const file of workflowFiles) {
      const workflow = loadWorkflow(file);
      expect(Object.keys(workflow.jobs).length).toBeGreaterThan(0);
    }
  });

  it("ci.yml has no job running on the homelab-riauba runner", () => {
    const workflow = loadWorkflow("ci.yml");
    for (const job of Object.values(workflow.jobs)) {
      expect(runsOnHomelab(job)).toBe(false);
    }
  });

  it("claude-review.yml has no job running on the homelab-riauba runner", () => {
    const workflow = loadWorkflow("claude-review.yml");
    for (const job of Object.values(workflow.jobs)) {
      expect(runsOnHomelab(job)).toBe(false);
    }
  });

  const deployWorkflowFiles = [
    "deploy-staging.yml",
    "deploy-production.yml",
    "deploy-rollback.yml",
  ];

  it.each(deployWorkflowFiles)(
    "%s has at least one job on homelab-riauba",
    (file) => {
      const workflow = loadWorkflow(file);
      const hasHomelabJob = Object.values(workflow.jobs).some(runsOnHomelab);
      expect(hasHomelabJob).toBe(true);
    },
  );

  it.each(["deploy-staging.yml", "deploy-production.yml"])(
    "%s's build job(s) stay on ubuntu-latest, never homelab-riauba",
    (file) => {
      const workflow = loadWorkflow(file);
      const buildJobs = Object.entries(workflow.jobs).filter(([name]) =>
        /build/i.test(name),
      );
      expect(buildJobs.length).toBeGreaterThan(0);
      for (const [, job] of buildJobs) {
        expect(runsOnHomelab(job)).toBe(false);
        expect(job["runs-on"]).toBe("ubuntu-latest");
      }
    },
  );

  it.each(deployWorkflowFiles)(
    "%s: every homelab-riauba job is gated to github.actor == github.repository_owner",
    (file) => {
      const workflow = loadWorkflow(file);
      const homelabJobs = Object.entries(workflow.jobs).filter(([, job]) =>
        runsOnHomelab(job),
      );
      expect(homelabJobs.length).toBeGreaterThan(0);
      for (const [name, job] of homelabJobs) {
        expect(job.if, `job '${name}' in ${file}`).toContain(
          "github.actor == github.repository_owner",
        );
      }
    },
  );
});
