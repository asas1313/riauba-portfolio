# Changelog

## Unreleased

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
- A temporary `build:pdf` stub so `make build` succeeds ahead of real PDF generation
  (spec 002).
- CI workflow running lint, unit tests, security audit, docs build and the e2e suite on every
  pull request and push to `main`.
- ADR-0001, documenting the content-loading strategy for `cv.yaml` vs. `content/projects/`.
