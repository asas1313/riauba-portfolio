import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { projectSchema } from "../../src/content.config.ts";
import {
  getAllProjectsSorted,
  getAllTagSlugs,
  getFeaturedProjectsSorted,
  getProjectsByTagSlug,
  slugifyTag,
} from "../../src/lib/projects.ts";

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

function baseData(title: string) {
  return {
    title,
    tagline: "tagline",
    status: "live",
    order: 0,
    featured: false,
    links: { live: null, docs: null, repo: null },
    stack: [] as string[],
  };
}

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

  it("rejects frontmatter where `links` is not an object (AC-2 completeness)", () => {
    const frontmatter = {
      title: "x",
      tagline: "tagline",
      status: "live",
      order: 0,
      featured: false,
      links: "https://example.com",
      stack: [],
    };
    expect(() => projectSchema.parse(frontmatter)).toThrow();
  });

  it("rejects frontmatter where `stack` is not an array (AC-2 completeness)", () => {
    const frontmatter = {
      title: "x",
      tagline: "tagline",
      status: "live",
      order: 0,
      featured: false,
      links: { live: null, docs: null, repo: null },
      stack: "Java",
    };
    expect(() => projectSchema.parse(frontmatter)).toThrow();
  });
});

describe("getAllProjectsSorted (AC-1)", () => {
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
  ];

  it("includes non-featured entries, unlike getFeaturedProjectsSorted", () => {
    const result = getAllProjectsSorted(entries);
    expect(result.map((entry) => entry.id)).toContain("homelab");
  });

  it("sorts every entry by order ascending", () => {
    const result = getAllProjectsSorted(entries);
    expect(result.map((entry) => entry.id)).toEqual([
      "atsidek",
      "homelab",
      "payments-migration",
    ]);
  });

  it("keeps a deterministic relative order for entries that tie on `order`", () => {
    const tied = [
      { id: "a", data: { ...baseData("A"), order: 1 } },
      { id: "b", data: { ...baseData("B"), order: 1 } },
    ];
    expect(getAllProjectsSorted(tied).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns an empty array when the collection is empty (boundary)", () => {
    expect(getAllProjectsSorted([])).toEqual([]);
  });
});

describe("slugifyTag (AC-3)", () => {
  it("lowercases and hyphenates a multi-word tag", () => {
    expect(slugifyTag("Spring Boot")).toBe("spring-boot");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugifyTag("Cloudflare Tunnel")).toBe("cloudflare-tunnel");
    expect(slugifyTag("C++")).toBe("c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyTag(" Java ")).toBe("java");
    expect(slugifyTag("--Java--")).toBe("java");
  });

  it("returns an empty string for a punctuation-only tag", () => {
    expect(slugifyTag("++")).toBe("");
    expect(slugifyTag("#")).toBe("");
  });
});

describe("getAllTagSlugs (AC-3)", () => {
  const entries = [
    {
      id: "atsidek",
      data: {
        ...baseData("Atsidėk"),
        stack: ["Java", "Spring Boot", "PostgreSQL"],
      },
    },
    {
      id: "payments-migration",
      data: {
        ...baseData("Payments platform migration"),
        stack: ["Java", "Spring Boot", "Microservices"],
      },
    },
  ];

  it("returns one entry per distinct slug, sorted by label", () => {
    const result = getAllTagSlugs(entries);
    expect(result.map((tag) => tag.slug)).toEqual([
      "java",
      "microservices",
      "postgresql",
      "spring-boot",
    ]);
  });

  it("groups projects under their tag's slug and keeps the first-seen label spelling", () => {
    const result = getAllTagSlugs(entries);
    const java = result.find((tag) => tag.slug === "java");
    expect(java?.label).toBe("Java");
    expect(java?.projects.map((entry) => entry.id)).toEqual([
      "atsidek",
      "payments-migration",
    ]);
  });

  it("returns an empty array for an empty collection (boundary)", () => {
    expect(getAllTagSlugs([])).toEqual([]);
  });

  it("throws a readable error naming both labels when two distinct labels collide on one non-empty slug", () => {
    const colliding = [
      { id: "a", data: { ...baseData("A"), stack: ["Node.js"] } },
      { id: "b", data: { ...baseData("B"), stack: ["Node JS"] } },
    ];
    expect(() => getAllTagSlugs(colliding)).toThrow(/Node\.js/);
    expect(() => getAllTagSlugs(colliding)).toThrow(/Node JS/);
  });

  it("throws a readable error naming the label when a tag slugifies to an empty string", () => {
    // A punctuation-only label (no alphanumeric characters at all) loses
    // every distinguishing character once lowercased/hyphenated/trimmed,
    // e.g. a tag someone wrote as just "++" or "#" — analogous to the
    // "C++" vs "C#"-style collision above, but with no leading letter left
    // to slugify to anything at all.
    const punctuationOnly = [
      { id: "a", data: { ...baseData("A"), stack: ["++"] } },
    ];
    expect(() => getAllTagSlugs(punctuationOnly)).toThrow(/\+\+/);
  });
});

describe("getProjectsByTagSlug (AC-3)", () => {
  const entries = [
    {
      id: "atsidek",
      data: { ...baseData("Atsidėk"), stack: ["Java", "Spring Boot"] },
    },
    {
      id: "homelab",
      data: { ...baseData("Self-hosted homelab"), stack: ["Proxmox"] },
    },
  ];

  it("returns only projects whose stack includes a tag matching the given slug", () => {
    const result = getProjectsByTagSlug(entries, "spring-boot");
    expect(result.map((entry) => entry.id)).toEqual(["atsidek"]);
  });

  it("returns an empty array when no project matches the slug (boundary)", () => {
    expect(getProjectsByTagSlug(entries, "rust")).toEqual([]);
  });

  it("returns an empty array for an empty collection (boundary)", () => {
    expect(getProjectsByTagSlug([], "java")).toEqual([]);
  });
});
