# 001 – Site foundation and home page: implementation plan

Spec: [docs/specs/001-site-foundation.md](./001-site-foundation.md) · ADR: [docs/adr/0001-content-loading-strategy.md](../adr/0001-content-loading-strategy.md)

## Summary

Spec 001 bootstraps the Astro 5 project from the current scaffold (docs and content only,
no Astro app code yet) so that every Makefile target (`setup`, `test`, `lint`, `format`,
`security`, `build`) works end-to-end, and ships a minimal, static, accessible home page
plus a styled 404 page. Content is loaded from the existing `content/cv.yaml` (via a
hand-written Zod-validated module) and `content/projects/*.md` (via an Astro content
collection), so the build fails loudly on invalid content and the home page's copy,
profile links and featured-project list stay in sync with `content/` with no hard-coded
CV facts. A shared `BaseLayout` provides header/footer navigation, self-hosted fonts,
light/dark theming via `prefers-color-scheme`, and SEO/Open Graph meta tags, with zero
client-side JavaScript shipped on the home page. Vitest covers content-schema validation
and pure data-shaping logic; Playwright (with `@axe-core/playwright`) covers
accessibility, SEO markup, the page-weight budget and the 404 flow against the production
build (`astro build` + `astro preview`), not the dev server. CV page/PDF (spec 002) and
project detail/listing pages (spec 003) are explicitly out of scope; the home page links
to `/projects/<slug>` and the header links to `/cv`, `/projects` and
`/how-this-site-was-built` ahead of those specs landing, so those routes will 404 until
then — this is called out under Risks, not hidden.

## Acceptance criteria → tests

| AC   | Criterion (short)                                                        | Tests                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | `make setup && make build` produces dist/, no client JS on home          | `tests/e2e/performance.spec.ts` asserts zero `<script>` elements and zero `script`/`fetch`-initiated JS network requests on `/`; CI's existing `make build` step (`.github/workflows/ci.yml`) proves `dist/` is produced without error                                                                                                                                     |
| AC-2 | Home shows basics.name/label/summary/remote + non-TODO profile links     | `tests/unit/cv.test.ts` (`getVisibleProfiles` filters entries whose `network` or `url` is `"TODO"`); `tests/e2e/home.spec.ts` (text content + anchor hrefs match `content/cv.yaml`)                                                                                                                                                                                        |
| AC-3 | Invalid cv.yaml fails build with readable Zod error                      | `tests/unit/cv.schema.test.ts` (valid fixture parses; fixture missing `basics.name` throws, and the thrown/caught message names the field path and is human-readable)                                                                                                                                                                                                      |
| AC-4 | Featured projects, ordered by `order`, link to `/projects/<slug>`        | `tests/unit/projects.test.ts` (filter `featured === true`, sort by `order` ascending, against a fixture mirroring `content/projects/*.md`); `tests/e2e/home.spec.ts` (rendered order + `href="/projects/<slug>"` for each)                                                                                                                                                 |
| AC-5 | Shared header/footer on every page                                       | `tests/e2e/layout.spec.ts` run against both `/` and `/does-not-exist` (404 page) — nav text/order and footer (email, LinkedIn, © year) present on both                                                                                                                                                                                                                     |
| AC-6 | Zero axe violations; light + dark supported                              | `tests/e2e/accessibility.spec.ts` — axe scan on `/` and `/404` under `colorScheme: 'light'` and `'dark'` (via `page.emulateMedia`), zero violations in all four runs, plus a sanity check that a themed CSS custom property's computed value differs between the two schemes                                                                                               |
| AC-7 | <300 KB transferred weight; self-hosted fonts                            | `tests/e2e/performance.spec.ts` — sums response body sizes for all requests triggered by loading `/` against the **production** preview server, asserts total < 300 * 1024 bytes; asserts every font request URL is same-origin (not `fonts.googleapis.com` / `fonts.gstatic.com` / any third-party host)                                                                  |
| AC-8 | Unique title, meta description, OG tags, canonical on https://riauba.org | `tests/e2e/seo.spec.ts` — `/` and `/404` have different `<title>`, a non-empty `meta[name=description]`, `og:title`/`og:description`/`og:type`/`og:url`, and `link[rel=canonical]` starting with `https://riauba.org` and matching the current path; `tests/unit/seo.test.ts` unit-tests the canonical/meta-building helper directly (e.g. path joining, trailing slashes) |
| AC-9 | Unknown URL serves styled 404                                            | `tests/e2e/404.spec.ts` — navigating to an unknown path returns HTTP 404 and renders the shared layout (not a bare error page) with a link back home                                                                                                                                                                                                                       |

## Tasks

1. **Scaffold the Astro project.** Add `package.json` (name, scripts: `dev`, `build`,
   `preview`), `astro.config.mjs` (`site: "https://riauba.org"`, static output, no UI
   framework integrations), `tsconfig.json` (extends `astro/tsconfigs/strict`),
   `.gitignore` (`node_modules`, `dist`, `.astro`, `test-results`, `playwright-report`).
   Add a placeholder `src/pages/index.astro` ("hello world"). Verify `npm install` and
   `npx astro build` succeed and produce `dist/index.html`.
2. **Linting and formatting.** Add `eslint.config.js` (flat config: `@eslint/js`,
   `typescript-eslint`, `eslint-plugin-astro` recommended configs), `.prettierrc.json` +
   `prettier-plugin-astro`, `.prettierignore`. Verify `make lint` and `make format` work
   against the placeholder page.
3. **Test tooling scaffolding.** Add `vitest.config.ts` (`test.include:
["tests/unit/**/*.test.ts"]`), `playwright.config.ts` (`testDir: "tests/e2e"`,
   `webServer: { command: "npm run preview", url: "http://localhost:4321",
reuseExistingServer: false }` — the production build itself is **not** run by
   Playwright's `webServer`; it is a precondition supplied by `make e2e`'s Makefile
   dependency, task 13), add `@axe-core/playwright` and `@playwright/test` as
   dev dependencies. Add one trivial test in each suite to prove wiring; verify
   `make test` and `make e2e` are green.
4. **Content layer: projects collection.** Add `src/content.config.ts` defining the
   `projects` collection with the `glob()` loader (`base: "./content/projects"`,
   resolved from the **project root**, not `src/` — Astro 5's `glob()` loader resolves
   relative `base` paths against the config root by default, so no extra resolution code
   is needed here; verify this explicitly in task 4's test since it's the plan's main
   risk) and a Zod schema (`title`, `tagline`, `status`, `order`, `featured`,
   `links: { live, docs, repo }` nullable strings, `stack: string[]`) matching
   `content/projects/*.md`. Tests: `tests/unit/projects.test.ts` (schema accepts the four
   real files parsed via `getCollection`-equivalent fixture data; filter/sort helper
   `getFeaturedProjectsSorted`).
5. **Content layer: cv.yaml.** Add `src/lib/cv.schema.ts` (Zod schema for the full
   `basics`/`work`/`skills`/`education`/`languages`/`certificates` shape) and
   `src/lib/cv.ts` (resolves `content/cv.yaml` from the **project root**, via
   `new URL("../../content/cv.yaml", import.meta.url)` or `process.cwd()`-relative
   joining — not a path relative to the module's own directory assumption that could
   break if the module moves — reads it with the `yaml` package, parses with the schema,
   throws a readable formatted error listing the Zod issue path(s) on failure, exports
   typed `cv` plus `getVisibleProfiles(profiles)`). Tests: `tests/unit/cv.schema.test.ts`,
   `tests/unit/cv.test.ts` (including a test that the resolved path is correct regardless
   of the process's current working directory at `vitest`/`astro build` invocation time).
6. **Global styles and self-hosted fonts.** Add `src/styles/global.css`: CSS custom
   properties for light theme (accent `#1d4ed8`) and a `@media (prefers-color-scheme:
dark)` override (a lighter tint of the accent, chosen and verified to pass WCAG AA
   contrast against the dark background — checked by the AC-6 axe e2e suite, task 11),
   base typography, `@font-face` rules pointing at local Inter (OFL-licensed) `woff2`
   files under `src/assets/fonts/` — weights 400 and 600 (or the Inter variable font if
   it stays within the AC-7 budget as a single file), subsets **latin + latin-ext** (not
   latin-only: `content/cv.yaml` and `content/projects/*.md` contain Lithuanian
   characters such as "ų", "š", "č", which latin-only Inter subsets do not cover and
   would silently fall back to a system font for), `rel` preloading avoided to keep the
   AC-7 budget tight. Add the font's `OFL.txt` licence file alongside it. No dedicated
   test in this task; covered later by AC-6 (contrast) and AC-7 (budget) e2e tests.
7. **SEO helper.** Add `src/lib/seo.ts`: given `{ title, description, path }` builds a
   full `<title>`, canonical URL (`new URL(path, Astro.site)`), and Open Graph tag values.
   Test: `tests/unit/seo.test.ts`.
8. **BaseLayout, Header, Footer.** Add `src/components/BaseLayout.astro` (renders
   `<head>` meta via `seo.ts`, imports `global.css`, wraps `<Header />`, `<slot />`,
   `<Footer />`), `src/components/Header.astro` (nav: Home `/`, Projects `/projects`, CV
   `/cv`, How this site was built `/how-this-site-was-built`), `src/components/Footer.astro`
   (mailto link from `cv.basics.email`, LinkedIn link from `cv.basics.profiles`, `©
{new Date().getFullYear()} {cv.basics.name}`, computed at build time). Tests:
   `tests/e2e/layout.spec.ts` (requires at least the 404 page from task 9 to exist to
   prove "any page" — can be written against `/` first and extended once 404 exists).
9. **Home page.** Add `src/pages/index.astro` (replacing the placeholder): uses
   `BaseLayout`, renders `cv.basics` fields and visible profile links (AC-2), and the
   featured/sorted projects from the `projects` collection as links to
   `/projects/<entry.id>` (AC-4), optionally via a small `src/components/ProjectCard.astro`.
   Tests: `tests/e2e/home.spec.ts`.
10. **404 page.** Add `src/pages/404.astro` using `BaseLayout`, a friendly message and a
    link home. Astro emits this as `dist/404.html`; `astro preview` serves it with a 404
    status for unknown paths. Tests: `tests/e2e/404.spec.ts`; finish wiring
    `tests/e2e/layout.spec.ts` from task 8 against this page too.
11. **Accessibility, performance and no-JS e2e suite.** Add
    `tests/e2e/accessibility.spec.ts` (AC-6), `tests/e2e/performance.spec.ts` (AC-1's
    no-JS assertion + AC-7's weight/font-origin assertions), `tests/e2e/seo.spec.ts`
    (AC-8). Fix any findings (e.g. trim font weights/subsets if the budget is exceeded).
12. **`build:pdf` placeholder script.** Add a `build:pdf` npm script that prints a notice
    ("PDF generation is implemented in spec 002") and exits 0, so `make build` (which
    runs `npm run build && npm run build:pdf`) succeeds end-to-end now. Mark it clearly
    as a temporary stub with a `// TODO(spec-002)` comment so it is not mistaken for the
    real implementation. Verify `make setup && make build` succeeds and `dist/` contains
    `index.html`, `404.html`, and the font assets (AC-1).
13. **Wire `make e2e` into CI and make it own the build dependency.** Change the
    Makefile's `e2e` target to `e2e: build` (a make prerequisite) so `make e2e` always
    runs against a fresh production build without Playwright's `webServer` rebuilding it
    (keeps task 3's `webServer.command` to the cheap `npm run preview` only, avoiding a
    duplicate build). Add a `run: make e2e` step to `.github/workflows/ci.yml` (replacing
    the separate `make build` step, since `make e2e` now runs it). Keep Playwright
    browser install **Chromium-only** (`make setup` already does `npx playwright install
--with-deps chromium`, not `--with-deps` for all browsers), and add a GitHub Actions
    cache step (`actions/cache` keyed on the OS and a hash of `package-lock.json`,
    caching `~/.cache/ms-playwright`) around the browser-install step so CI doesn't
    re-download Chromium on every run. This enforces AC-6/AC-7/AC-8/AC-9 on every PR
    while keeping CI cost bounded.
14. **Final pass.** Run `make lint`, `make test`, `make e2e`, `make security`, `make
build` locally; fix anything red. (Docs updates in `docs/user-guide/` and
    `docs/technical/` are the doc-writer agent's job in the next pipeline phase, not part
    of this task list.)

## Design decisions

- **Content loading split** (collection for `projects`, plain Zod-validated module for
  `cv.yaml`) — see [ADR-0001](../adr/0001-content-loading-strategy.md) for the full
  rationale and alternatives considered.
- **`project.status` is typed as a non-empty string, not a Zod enum.** The four existing
  files use three different values (`live`, `active`, `case-study`) and the spec gives no
  closed list; constraining it to today's values would silently reject a legitimate new
  status later. Revisit once spec 003 defines status badges explicitly.
- **TODO-filtering scope.** Spec 001 AC-2 only asks to hide `basics.profiles` entries
  whose value is `"TODO"`. The fuller "omit any TODO field + print a build warning"
  mechanism is spec 002 AC-2's job; `getVisibleProfiles` is deliberately narrow and will
  likely be superseded/reused by that later mechanism.
- **Playwright must run against the production build**, not `astro dev` (which injects a
  dev-only HMR client and would both violate the "no client JS" check and skew the
  weight budget). The build itself is produced once by `make e2e`'s `build` prerequisite
  (task 13), not by Playwright's `webServer`, which only runs `npm run preview` — this
  avoids building twice (once for `make build` in CI, once again inside `webServer`).
- **No UI framework integration** (no React/Vue/Svelte) is added to `astro.config.mjs`;
  everything is `.astro` components and plain CSS, which is what makes "zero client JS"
  trivial to guarantee rather than something to police per-component.
- **Favicon**: no logo/image asset exists in `content/`. Plan adds a minimal inline SVG
  monogram favicon (generated from `basics.name`'s initials) purely as placeholder
  scaffolding — this is boilerplate, not an invented personal fact, so it is treated as
  an implementation detail rather than an open question.
- **Full Lighthouse automation is out of scope for this plan.** The spec's non-functional
  requirement hedges with "checked in e2e with a budget test where feasible" — this plan
  implements the feasible proxy (zero axe violations + <300 KB transferred weight) rather
  than wiring a Lighthouse-CI run, which would need its own tooling decision.
- **Accent colour and typeface are fixed, not proposed.** Confirmed by Andrius: accent
  `#1d4ed8` for the light theme with a lighter tint for dark (verified against WCAG AA
  contrast by the AC-6 axe suite in both schemes), typeface Inter (OFL), self-hosted
  `woff2`, subsets **latin + latin-ext** (the content contains Lithuanian diacritics).
- **No `og:image` in spec 001.** Confirmed: AC-8 ships with `og:title`/`og:description`/
  `og:type`/`og:url` + canonical only; a social-preview image is deferred to whichever
  later spec first has a logo/photo asset to use.
- **Content paths are resolved from the project root, not relative to the consuming
  module.** `src/content.config.ts`'s `glob()` `base` is `"./content/projects"` (Astro 5
  resolves relative `base` against the config root); `src/lib/cv.ts` resolves
  `content/cv.yaml` the same way, independent of `process.cwd()` at invocation time —
  this matters because Vitest (project root) and `astro build` invoke modules from
  different working directories, and a path relative to the module's own directory would
  silently break if either file moves.

## Risks

- `content/cv.yaml` and `content/projects/*.md` live outside `src/`; Astro 5's Content
  Layer API loaders reading paths outside `src/content/` is a comparatively new pattern.
  Mitigate by validating it works under `astro dev`, `astro build`, and `astro check`
  early (task 1–4), not just at the end.
- The 300 KB transferred-weight budget (AC-7) includes font bytes. Using latin-ext (not
  latin-only) subsets to cover Lithuanian diacritics makes the font file larger than a
  latin-only subset would be; mitigate by using `woff2` only and a single weight pair
  (400/600) — switch to the variable font only if it is smaller than the two static
  files combined.
- Header links to `/cv`, `/projects`, `/how-this-site-was-built`, and home-page links to
  `/projects/<slug>`, will 404 until specs 002/003 (and a future "how this site was
  built" page) ship. This is an accepted, visible gap of incremental delivery, not a bug.
  **The PR description for this spec must explicitly list these routes as intentionally
  404ing** so the reviewer doesn't flag it as a missed AC.
- The `build:pdf` placeholder script (task 12) could be forgotten and left in place past
  spec 002, silently masking a missing PDF. Mitigate with the `TODO(spec-002)` comment
  and by making spec 002's plan explicitly replace it.
- `npm audit --audit-level=high` (`make security`) depends on the dependency set chosen
  here (Astro, Vitest, Playwright, ESLint, Zod, `yaml`, `@axe-core/playwright`); a
  transitive high-severity advisory in any of them would block CI and need a follow-up
  bump, not a code change.

## Open questions

None — all three raised during planning (accent colour/typeface, OG image, CI `e2e`
step) were confirmed by Andrius; see the **Design decisions** section above for the
resolved choices.
