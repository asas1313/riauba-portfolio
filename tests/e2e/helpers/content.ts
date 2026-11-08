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

export interface Cv {
  basics: CvBasics;
  [key: string]: unknown;
}

export function readCv(): Cv {
  return parseYaml(readFileSync(cvPath, "utf-8")) as Cv;
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
