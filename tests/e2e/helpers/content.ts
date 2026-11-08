import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Playwright test files run under Node's own ESM loader, not Vite, so they
// cannot import src/lib/cv.ts (which uses a Vite-only `?raw` import to stay
// correct no matter how `astro build` bundles it — see the comment in
// src/lib/cv.ts). E2e tests instead read content/cv.yaml directly with
// plain fs + the `yaml` package to build expectations against the real
// content; schema validation itself is already covered by
// tests/unit/cv.schema.test.ts.
const cvPath = fileURLToPath(
  new URL("../../../content/cv.yaml", import.meta.url),
);

export interface Profile {
  network: string;
  url: string;
}

export interface CvBasics {
  name: string;
  label: string;
  email: string;
  remote: string;
  summary: string;
  profiles: Profile[];
  [key: string]: unknown;
}

export interface Work {
  name: string;
  position: string;
  startDate: string;
  endDate?: string;
  url?: string;
  summary: string;
  highlights: string[];
}

export interface Cv {
  basics: CvBasics;
  work: Work[];
  [key: string]: unknown;
}

export function readCv(): Cv {
  return parseYaml(readFileSync(cvPath, "utf-8")) as Cv;
}

// Mirrors src/lib/cv.ts's getWorkReverseChronological. Duplicated rather
// than imported: e2e spec files run under Node's own ESM loader, not Vite,
// so they cannot import src/lib/cv.ts (see the comment above readCv).
const ONGOING_SENTINEL = "9999-99";

export function readWorkReverseChronological(): Work[] {
  const work = readCv().work;
  return [...work].sort((a, b) => {
    const aEnd = a.endDate ?? ONGOING_SENTINEL;
    const bEnd = b.endDate ?? ONGOING_SENTINEL;
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
    return b.startDate.localeCompare(a.startDate);
  });
}

const projectsDir = fileURLToPath(
  new URL("../../../content/projects/", import.meta.url),
);

export interface ProjectEntry {
  id: string;
  title: string;
  tagline: string;
  status: string;
  order: number;
  featured: boolean;
  links: { live: string | null; docs: string | null; repo: string | null };
  stack: string[];
}

export function readProjects(): ProjectEntry[] {
  return readdirSync(projectsDir)
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => {
      const raw = readFileSync(`${projectsDir}${filename}`, "utf-8");
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!match) throw new Error(`No frontmatter found in ${filename}`);
      const frontmatter = parseYaml(match[1]) as Omit<ProjectEntry, "id">;
      return { id: filename.replace(/\.md$/, ""), ...frontmatter };
    });
}

export function readFeaturedProjectsSorted(): ProjectEntry[] {
  return readProjects()
    .filter((project) => project.featured)
    .sort((a, b) => a.order - b.order);
}

/** Mirrors src/lib/projects.ts's getAllProjectsSorted. Duplicated for the
 * same reason as readWorkReverseChronological above: e2e specs can't
 * import src/lib/*.ts directly. */
export function readAllProjectsSorted(): ProjectEntry[] {
  return [...readProjects()].sort((a, b) => a.order - b.order);
}

/** Mirrors src/lib/projects.ts's slugifyTag. */
export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TagGroup {
  slug: string;
  label: string;
  projects: ProjectEntry[];
}

/** Mirrors src/lib/projects.ts's getAllTagSlugs (read-only mirror; does not
 * re-implement the build's collision/empty-slug error checks, since those
 * are already covered by tests/unit/projects.test.ts). */
export function readTagGroups(): TagGroup[] {
  const bySlug = new Map<string, TagGroup>();
  for (const project of readProjects()) {
    for (const label of project.stack) {
      const slug = slugifyTag(label);
      const existing = bySlug.get(slug);
      if (existing) {
        existing.projects.push(project);
      } else {
        bySlug.set(slug, { slug, label, projects: [project] });
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Mirrors src/lib/todo.ts's TODO_PATTERN.
const TODO_PATTERN = /\bTODO\b/;

export type ProjectLinkKind = "live" | "docs" | "repo";

/** Mirrors src/lib/project-links.ts's getVisibleProjectLinks. */
export function readVisibleProjectLinkKinds(
  links: ProjectEntry["links"],
): ProjectLinkKind[] {
  return (["live", "docs", "repo"] as const).filter((kind) => {
    const url = links[kind];
    return url !== null && !TODO_PATTERN.test(url);
  });
}

const specsDir = fileURLToPath(
  new URL("../../../docs/specs/", import.meta.url),
);

export interface SpecIndexEntry {
  number: number;
  title: string;
  status: string;
  pr?: string;
}

/** Mirrors src/lib/specs.ts's getSpecIndex, reading docs/specs/*.md
 * directly with fs instead of a Vite import.meta.glob (e2e specs can't
 * import src/lib/*.ts directly). */
export function readSpecIndex(): SpecIndexEntry[] {
  return readdirSync(specsDir)
    .filter((filename) => /^\d{3}-[\w-]+\.md$/.test(filename))
    .map((filename) => {
      const raw = readFileSync(`${specsDir}${filename}`, "utf-8");
      const h1 = /^#\s+(\d{3})\s+–\s+(.+?)\s*$/m.exec(raw);
      const status = /^Status:\s*(.+?)\s*(?:·|$)/m.exec(raw);
      const pr = /^PR:\s*(\S+)\s*$/m.exec(raw);
      if (!h1 || !status) {
        throw new Error(`No parseable header found in ${filename}`);
      }
      return {
        number: Number(h1[1]),
        title: h1[2],
        status: status[1],
        pr: pr ? pr[1] : undefined,
      };
    })
    .sort((a, b) => a.number - b.number);
}
