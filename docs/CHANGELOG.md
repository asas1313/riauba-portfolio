# Changelog

## Unreleased

### Added (spec 003 — projects catalogue and detail pages)

- `/projects` catalogue page listing every project (not just featured ones) from
  `content/projects/*.md`, sorted by `order`, each with a status badge and stack tags.
- Static `/projects/tag/<tag>` filter pages, one per distinct stack tag, generated at build
  time — filtering needs zero client-side JavaScript. Two distinct tag labels that would
  collide on the same URL slug (or a label with no usable slug at all) fail the build with a
  readable error instead of silently merging.
- `/projects/<slug>` detail pages rendering each project's markdown body, plus a link button
  per `live`/`docs`/`repo` entry — hidden (in both dev and production) when that link is `null`
  or the literal placeholder `"TODO"`.
- Markdown body paragraphs starting with `TODO` are omitted from project detail pages in
  production builds, with a build warning naming the file and count — the same `TODO` marker
  and whole-word/case-sensitive rule as spec 002's CV field stripping, implemented separately
  for markdown ASTs (`src/lib/markdown-todo.ts`) since the two operate on different data shapes
  at different times. See ADR-0003 for the full design, including two deviations discovered
  while implementing it: Astro 7.4 ships Sätteri, not the classic remark/unified pipeline, as
  its default Markdown processor (so the plugin targets Sätteri's native API instead of
  `markdown.remarkPlugins`), and Astro's `defineConfig` doesn't support a functional/callback
  form (so the production/dev gating is wired through a small inline integration instead). The
  warning itself is emitted from a separate, cache-independent scan of `content/projects/*.md`
  on an `astro:build:start` hook, not from the Sätteri plugin's `before` hook — review found
  that Astro's content-layer cache skips re-rendering (and therefore skips re-invoking the
  plugin) for a file whose on-disk content is unchanged since the last sync, so the warning
  would otherwise silently stop firing on the second and later consecutive builds against a
  warm cache. The `astro:build:start` hook always runs, so the warning now fires every build.
- `/how-this-site-was-built` page explaining the spec → plan → implement → test → review →
  docs delivery pipeline and its two human approval gates (plan approval, PR review before
  merge), with a table listing every spec in `docs/specs/` (number, title, status, and a link
  to its merged pull request when a `PR: <url>` line is present in that spec's file).
  `docs/specs/001-site-foundation.md` and `docs/specs/002-cv-page-and-pdf.md` are retrofitted
  with their own `PR:` lines.
- `src/lib/todo.ts`, extracted from `cv.publish.ts`, shared by the new `project-links.ts`'s
  link-button filter.
- `ProjectCard.astro` gains a status badge and stack-tag links, reused by the home page,
  `/projects` and `/projects/tag/<tag>`.

### Added (spec 001 — site foundation and home page)

- Astro 7 static site (`output: "static"`, TypeScript strict, plain CSS, zero client-side
  JavaScript on the home page).
- Home page (`/`) rendering `basics.name`, `basics.label`, `basics.summary` and the "remote"
  line from `content/cv.yaml`, plus links to every `basics.profiles` entry that isn't the
  `"TODO"` placeholder.
- Featured projects on the home page, read from `content/projects/*.md` via an Astro content
  collection, filtered to `featured: true` and sorted by `order`, each linking to
  `/projects/<slug>` (page itself not built until spec 003).
- Shared `Header` (Home, Projects, CV, "How this site was built" nav) and `Footer` (email,
  LinkedIn, © year) on every page.
- Strict, fail-loud content validation: a Zod schema for `content/cv.yaml`
  (`src/lib/cv.schema.ts`) and a content-collection schema for `content/projects/*.md`
  (`src/content.config.ts`), each throwing a readable error on invalid content and failing the
  build.
- SEO helper (`src/lib/seo.ts`) building a unique `<title>`, meta description, Open Graph tags
  and a same-origin canonical URL for every page.
- Self-hosted Inter fonts (OFL, woff2, latin + latin-ext subsets covering Lithuanian
  diacritics, weights 400/600) and light/dark theming via `prefers-color-scheme`.
- Styled 404 page.
- Vitest unit tests, Playwright e2e tests (including `@axe-core/playwright` accessibility
  scans), and an opt-in `make screenshots` target that regenerates
  `docs/user-guide/img/*.png`.
- A temporary `build:pdf` stub so `make build` succeeded ahead of real PDF generation; closed
  out by spec 002 below, which replaced it with real PDF generation.
- CI workflow running lint, unit tests, security audit, docs build and the e2e suite on every
  pull request and push to `main`.
- ADR-0001, documenting the content-loading strategy for `cv.yaml` vs. `content/projects/`.

### Added (spec 002 — CV page and PDF)

- CV page (`/cv`), rendering the entire `content/cv.yaml` document — contact details, profile
  links, summary, work history (sorted reverse-chronologically), skills, education, languages
  and certificates — via a shared `CvContent` component, plus a "Download CV (PDF)" button and
  a matching link in the header.
- Print-optimised route (`/cv/print`): a minimal, chrome-free rendering of the same CV content,
  `noindex`ed with a canonical pointing back at `/cv`, used as the source page for the
  generated PDF rather than meant to be browsed directly.
- Real PDF generation (`scripts/build-pdf.mjs`), replacing spec 001's `build:pdf` stub: spawns
  the site's own preview server, prints `/cv/print` to `dist/andrius-riauba-cv.pdf` with a
  headless Chromium via `playwright-core`, and always tears the server down afterwards. See
  ADR-0002 for the full rationale.
- JSON-LD `Person` structured data (`src/lib/structured-data.ts`) embedded on the CV page,
  mapping `cv.basics` onto schema.org's `Person` vocabulary.
- A single, schema-aware TODO-filtering mechanism (`src/lib/cv.publish.ts`, exporting
  `cvForBuild`), replacing spec 001's `getVisibleProfiles` helper. Every page now reads CV data
  through `cvForBuild` instead of the raw `cv` export, so one mechanism decides which
  `TODO`-marked placeholders are stripped from the entire CV tree (not just profile links) in
  production builds. The matching rule also changed: case-sensitive, whole-word `/\bTODO\b/`
  (so `"TODO: confirm dates"` matches but `"todo"` or a substring like `"Kristodoras"` no
  longer do), and TODO placeholders now render unfiltered in local dev everywhere, including
  the home page, consistent with every other page.
- ADR-0002, documenting the PDF generation approach.
