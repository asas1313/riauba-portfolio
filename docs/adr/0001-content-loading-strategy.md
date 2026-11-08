# ADR-0001: Content loading strategy for cv.yaml and content/projects

Status: Accepted · Date: 2026-11-08

## Context

CLAUDE.md fixes the location of the site's content as `content/cv.yaml` (a single YAML
document describing the whole CV) and `content/projects/*.md` (one markdown file per
project, with frontmatter), both at the repository root, outside `src/`. This predates
any Astro project code — spec 001 is the first to actually read this content.

Astro 5's Content Layer API expects collections to be defined in `src/content.config.ts`
and loaded through a "loader" (built-in `glob()`, `file()`, or a custom function). Loaders
read from the filesystem via Node `fs`, so they are not restricted to `src/content/` —
a `base` path outside `src/` works. However:

- `content/projects/*.md` is naturally a collection of many entries with frontmatter →
  a good fit for the `glob()` loader and content collection schema validation.
- `content/cv.yaml` is a single YAML _document_, not a list of entries. The `file()`
  loader's entry model (array of objects, or a map keyed by id) does not map cleanly
  onto one big nested object. Forcing it into a collection would add indirection for no
  benefit, since there is and will only ever be one CV.

We need both: (a) a build that fails loudly with a readable error on invalid content
(CLAUDE.md convention, spec 001 AC-3), and (b) typed access to CV data from pages.

## Decision

1. `content/projects/*.md` is modelled as an Astro content collection named `projects`,
   defined in `src/content.config.ts` using the `glob()` loader with
   `base: "./content/projects"` (relative to the project root, the directory containing
   `astro.config.mjs` — not relative to `src/`) and `pattern: "*.md"`. Its schema
   is a Zod object (`title`, `tagline`, `status`, `order`, `featured`, `links`, `stack`)
   matching the frontmatter actually present in the four existing project files. Astro
   validates every entry against this schema at build time and fails the build with a
   readable error on mismatch — this is the existing content-collection behaviour, no
   custom error handling needed.
2. `content/cv.yaml` is **not** modelled as a content collection. It is read and parsed
   with the `yaml` package in a plain module, `src/lib/cv.ts`, and validated against a
   hand-written Zod schema, `src/lib/cv.schema.ts`. `src/lib/cv.ts` exports a single typed
   `cv` constant (parsed once at module load / build time) plus small pure helpers
   (`getVisibleProfiles`, `getFeaturedProjects` lives with the projects collection
   instead). On a Zod validation failure, the module throws with `error.issues`
   formatted into a readable message (file, path, expected vs. received), which surfaces
   as a build failure (AC-3).
3. Both `content/cv.yaml` and `content/projects/` stay at the repository root (not moved
   under `src/content/`), per CLAUDE.md. Only the loader/parsing code lives under `src/`.

## Alternatives considered

- **Model cv.yaml as a one-entry content collection** (`file()` loader, single id `"cv"`).
  Rejected: adds an artificial collection-of-one and an extra `getEntry("cv", "cv")`
  indirection for zero gain over a plain typed module; the `file()` loader's built-in
  parsing also makes it harder to produce a _readable_ validation error (AC-3) than a
  module that controls its own Zod error formatting.
- **Move content/ under src/content/** so everything uses one consistent collection
  mechanism. Rejected: CLAUDE.md already fixes `content/cv.yaml` and `content/projects/`
  as the content location; moving it is out of scope and would conflict with spec 002/003
  expectations that already reference `content/cv.yaml`.
- **Parse both cv.yaml and projects by hand, skip content collections entirely.**
  Rejected for projects: content collections give us file-glob discovery, per-entry
  `slug`/`id` generation (needed for `/projects/<slug>` links, AC-4) and schema caching
  for free; reimplementing that manually would duplicate Astro's own mechanism.

## Consequences

- Two different, purpose-fit mechanisms for content loading exist side by side
  (collection for `projects`, plain module for `cv`). This asymmetry must be documented
  (this ADR) so future contributors don't try to "unify" them without cause.
- Spec 002 (CV page) and spec 003 (project pages) will import `src/lib/cv.ts` and the
  `projects` collection respectively — this ADR's module boundaries become the shared
  contract for those specs.
- `yaml` is added as a new runtime (build-time only) dependency.
