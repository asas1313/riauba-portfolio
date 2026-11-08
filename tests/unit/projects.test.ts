import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { projectSchema } from "../../src/content.config.ts";
import { getFeaturedProjectsSorted } from "../../src/lib/projects.ts";

const projectsDir = fileURLToPath(
  new URL("../../content/projects/", import.meta.url),
);

const realProjectFiles = [
  "ai-delivery-pipeline.md",
  "atsidek.md",
  "homelab.md",
  "payments-migration.md",
];

function readFrontmatter(filename: string): unknown {
  const raw = readFileSync(`${projectsDir}${filename}`, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter found in ${filename}`);
  return parseYaml(match[1]);
}

describe("projectSchema", () => {
  it.each(realProjectFiles)(
    "accepts the real frontmatter of %s",
    (filename) => {
      const frontmatter = readFrontmatter(filename);
      expect(() => projectSchema.parse(frontmatter)).not.toThrow();
    },
  );
});

describe("getFeaturedProjectsSorted", () => {
  const entries = [
    {
      id: "homelab",
      data: { ...baseData("Self-hosted homelab"), featured: false, order: 3 },
    },
    {
      id: "payments-migration",
      data: {
        ...baseData("Payments platform migration"),
        featured: true,
        order: 4,
      },
    },
    {
      id: "atsidek",
      data: { ...baseData("Atsidėk"), featured: true, order: 1 },
    },
    {
      id: "ai-delivery-pipeline",
      data: {
        ...baseData("Spec-to-deploy AI delivery pipeline"),
        featured: true,
        order: 2,
      },
    },
  ];

  function baseData(title: string) {
    return {
      title,
      tagline: "tagline",
      status: "live",
      order: 0,
      featured: false,
      links: { live: null, docs: null, repo: null },
      stack: [],
    };
  }

  it("keeps only featured entries", () => {
    const result = getFeaturedProjectsSorted(entries);
    expect(result.map((entry) => entry.id)).not.toContain("homelab");
  });

  it("sorts the remaining entries by order ascending", () => {
    const result = getFeaturedProjectsSorted(entries);
    expect(result.map((entry) => entry.id)).toEqual([
      "atsidek",
      "ai-delivery-pipeline",
      "payments-migration",
    ]);
  });
});
