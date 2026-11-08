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

  it("returns an empty array when the collection is empty (boundary)", () => {
    expect(getFeaturedProjectsSorted([])).toEqual([]);
  });

  it("returns an empty array when no entry is featured (empty-state, AC-4)", () => {
    const noneFeatured = entries.map((entry) => ({
      ...entry,
      data: { ...entry.data, featured: false },
    }));
    expect(getFeaturedProjectsSorted(noneFeatured)).toEqual([]);
  });

  it("does not throw and keeps a deterministic relative order for entries that tie on `order`", () => {
    const tied = [
      { id: "a", data: { ...baseData("A"), featured: true, order: 1 } },
      { id: "b", data: { ...baseData("B"), featured: true, order: 1 } },
    ];
    const result = getFeaturedProjectsSorted(tied);
    expect(result.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("projectSchema (invalid input, AC-4 content validation)", () => {
  it("rejects frontmatter missing the required title field", () => {
    const withoutTitle = {
      tagline: "tagline",
      status: "live",
      order: 0,
      featured: false,
      links: { live: null, docs: null, repo: null },
      stack: [],
    };
    expect(() => projectSchema.parse(withoutTitle)).toThrow();
  });

  it("rejects frontmatter where `order` is a string instead of a number", () => {
    const frontmatter = {
      title: "x",
      tagline: "tagline",
      status: "live",
      order: "1",
      featured: false,
      links: { live: null, docs: null, repo: null },
      stack: [],
    };
    expect(() => projectSchema.parse(frontmatter)).toThrow();
  });

  it("rejects frontmatter where `featured` is not a boolean", () => {
    const frontmatter = {
      title: "x",
      tagline: "tagline",
      status: "live",
      order: 0,
      featured: "true",
      links: { live: null, docs: null, repo: null },
      stack: [],
    };
    expect(() => projectSchema.parse(frontmatter)).toThrow();
  });
});
