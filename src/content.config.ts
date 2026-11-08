import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Schema matches the frontmatter actually present in content/projects/*.md.
// `status` is deliberately a non-empty string, not a closed enum: the four
// existing files already use three different values ("live", "active",
// "case-study") and nothing in spec 001 defines a closed list.
export const projectSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  status: z.string().min(1),
  order: z.number(),
  featured: z.boolean(),
  links: z.object({
    live: z.string().nullable(),
    docs: z.string().nullable(),
    repo: z.string().nullable(),
  }),
  stack: z.array(z.string()),
});

const projects = defineCollection({
  // `content/projects` lives at the repository root, outside `src/`. Astro 5's
  // Content Layer API resolves a relative glob() `base` against the project
  // root (the directory containing astro.config.mjs), not against `src/` or
  // the current working directory of whatever invoked the build — so this
  // path works identically whether invoked via `astro dev`/`astro build` or
  // (indirectly, for the schema only) via Vitest. See ADR-0001.
  loader: glob({ base: "./content/projects", pattern: "*.md" }),
  schema: projectSchema,
});

export const collections = { projects };
