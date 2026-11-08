# 002 – CV page and downloadable PDF: implementation plan

Spec: [docs/specs/002-cv-page-and-pdf.md](./002-cv-page-and-pdf.md) · ADR:
[docs/adr/0002-pdf-generation-approach.md](../adr/0002-pdf-generation-approach.md)

Status: **Approved** (2026-11-08, "patvirtinu" with 9 amendments — see **Confirmed
decisions** below; this revision folds them into the plan directly).

## Summary

Spec 002 adds a full `/cv` page and a print-optimised `/cv/print` route, both rendering
the same CV content (summary, reverse-chronological work history, skills, education,
languages, certificates — with empty sections hidden) from the single `content/cv.yaml`
source via a shared `CvContent.astro` component, so the web page and the PDF can never
drift apart. A single TODO-filtering mechanism (`src/lib/cv.publish.ts`) hides any field
matching the whole word `TODO` (`/\bTODO\b/`, case-sensitive) when `astro build` runs in
production mode, using the Zod schema's required/optional distinction to decide whether a
TODO sub-field drops just that field or the whole record (see **Confirmed decisions #1**).
This one mechanism now also powers the home page's profile filtering, replacing spec
001's separate `getVisibleProfiles` exact-match check, so dev/prod and
home-page/`/cv`/`/cv/print` behaviour is identical everywhere. `make build`'s existing
`build:pdf` stub is replaced with a real script that spawns Astro's preview server, drives
headless Chromium (via `playwright-core`) to print `/cv/print` to
`dist/andrius-riauba-cv.pdf`, and both `/cv` and the home page gain a "Download CV (PDF)"
link — a plain nav link in the shared `Header`, plus a visually prominent download button
at the top of `/cv` itself. `/cv` also emits a schema.org `Person` JSON-LD block built from
`cv.yaml`, with `<` escaped as `<` to prevent the serialized JSON from being
misinterpreted as closing the `<script>` tag early.

## Confirmed decisions (supersede the original plan's open questions)

1. **TODO-stripping granularity is schema-driven, not record-vs-scalar.** Using the Zod
   shape in `cv.schema.ts`: if a TODO value is in a field the schema marks **required**,
   drop the whole containing record (object). If the field is **optional** (e.g.
   `work[].endDate`, `work[].url`, `education[].startDate`/`endDate`), drop only that one
   field, keeping the rest of the record. For plain string arrays (`work[].highlights`,
   `skills[].keywords`), drop only the offending array element — a single TODO highlight
   must never remove the whole work entry. Supersedes open question #1.
2. **Matching is case-sensitive whole-word**: `/\bTODO\b/`, not a case-insensitive
   substring. `"TODO: ask about dates"` matches; `"Kristodoras"` does not. Supersedes the
   original case-insensitive-substring reading of AC-2, and replaces spec 001's
   `isTodoPlaceholder`'s exact-match-after-trim/uppercase rule.
3. **Unify with the home page.** `getVisibleProfiles` (`src/lib/cv.ts`) is removed;
   `index.astro` and `Footer.astro` instead consume `cv.basics.profiles` already filtered
   by `getPublishableCv`/`cvForBuild` (task 3 below), so there is exactly one TODO-handling
   code path for the whole site, active identically in `astro dev` and `astro build`.
   Supersedes open question #2 — note this also changes *when* filtering applies on the
   home page: previously always-on, now prod-build-only like everywhere else (consistent
   with decision from the spec owner that TODOs should stay visible in dev everywhere).
4. **`/cv/print` renders links as real `<a>` elements whose visible text *is* the href**
   (e.g. `<a href="https://...">https://...</a>`), not plain text and not the originally
   proposed `::after` trick. This keeps them genuinely clickable in the generated PDF while
   still satisfying "links printed as text" visually. Tested by asserting
   `element.textContent() === element.getAttribute("href")` for every profile/company link
   on `/cv/print`. `/cv/print` additionally gets `<meta name="robots" content="noindex">`
   and `<link rel="canonical" href="/cv">` (it is a print artifact of `/cv`, not a page
   search engines should index separately). Supersedes the original plan's
   plain-text-only design decision.
5. **JSON-LD escaping.** `buildPersonJsonLd`'s caller serializes with
   `JSON.stringify(structuredData).replace(/</g, "\\u003c")` before injecting into
   `set:html`, so a `<` inside any CV field (e.g. a summary mentioning "<script>") cannot
   prematurely close the `<script type="application/ld+json">` tag.
6. **PDF font-embedding proof.** `tests/e2e/cv-pdf.spec.ts` additionally asserts the
   extracted PDF text contains `"Registrų Centras"` (a real `content/cv.yaml` string with
   Lithuanian `latin-ext` characters, `src/components/.../work` summary) to empirically
   prove the self-hosted font actually embeds those glyphs as selectable text rather than
   silently falling back to tofu/boxes or a rasterized substitute.
7. **PDF filename is `andrius-riauba-cv.pdf`** (not `andrius-r-cv.pdf` as literally written
   in the spec text) — both the spec's AC-4/AC-5 and this plan are updated to the corrected
   name; the spec owner corrected this during plan review.
8. **"≤2 pages" is a hard ceiling only** — no preference for 1 vs. 2 pages. Supersedes open
   question #3; task 11's print-density tuning target is simply "stay at or under 2", not
   "minimize to 1".
9. **Download link has two placements**: the existing plan's Header nav link stays
   (appears on every page using `Header`), **and** `/cv` additionally gets a visually
   distinct styled button (not just a nav-styled text link) near the top of the page,
   above or beside the summary. Supersedes open question #4.

## Acceptance criteria → tests

| AC   | Criterion (short)                                                        | Tests                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 | `/cv` shows summary, reverse-chron work, skills, education, languages, certificates; empty sections hidden | `tests/unit/cv.order.test.ts` (`getWorkReverseChronological`, incl. an ongoing/no-`endDate` entry sorting first); `tests/e2e/cv.spec.ts` (renders each non-empty section from real `content/cv.yaml`, asserts `certificates` heading absent since real content's `certificates: []` is empty, asserts work order) |
| AC-2 | TODO-valued fields (whole-word, case-sensitive) omitted from web+PDF+home in prod builds, with a build warning | `tests/unit/cv.publish.test.ts` (`findTodoFields`/`stripTodoFields`/`getPublishableCv` against synthetic fixtures covering: a required scalar leaf → whole record dropped; an optional scalar leaf → only that field dropped; a string-array element (`highlights`/`keywords`) → only that element dropped; `"Kristodoras"` and `"todo"` do **not** match; dev-mode passthrough leaves data untouched; `warn` receives every stripped path) |
| AC-3 | `/cv/print`: A4, no nav, ≤2 pages, links rendered as their own href text | `tests/e2e/cv-print.spec.ts` (no `<header>`/`<nav>`/`<footer>`; `@page { size: A4; }` in effect; every profile/company `<a>`'s `textContent()` equals its `href`; `noindex` meta and canonical→`/cv` present); `tests/e2e/cv-pdf.spec.ts` (`pdf-parse`'s `numpages` ≤ 2, reading the real `dist/andrius-riauba-cv.pdf`) |
| AC-4 | `make build` → `dist/andrius-riauba-cv.pdf` with selectable text incl. `basics.name` | `tests/e2e/cv-pdf.spec.ts` (`.text` contains `cv.basics.name` and `"Registrų Centras"` — proves latin-ext glyphs are embedded, not just ASCII); CI's `make e2e` (depends on `build`) proves the script exits 0 and the file exists |
| AC-5 | Visible "Download CV (PDF)" link on `/cv` and home, → `/andrius-riauba-cv.pdf` | `tests/e2e/home.spec.ts` (Header nav link present, `href="/andrius-riauba-cv.pdf"`); `tests/e2e/cv.spec.ts` (Header nav link **and** the styled top-of-page download button, both pointing at the same href) |
| AC-6 | `/cv` includes schema.org `Person` JSON-LD from `cv.yaml`, safely escaped | `tests/unit/structured-data.test.ts` (`buildPersonJsonLd` field mapping; a serialization test asserting a `<` in a fixture summary comes out as `<` in the injected string); `tests/e2e/cv.spec.ts` (`script[type="application/ld+json"]` on `/cv` parses to `{ "@type": "Person", name: cv.basics.name, ... }`) |

## Tasks

1. **TODO-filtering core (schema-aware).** Add `src/lib/cv.publish.ts`:
   - `findTodoFields(value, path)`: recursive walker over the parsed `Cv` tree; a string
     leaf matches `/\bTODO\b/` (case-sensitive). Returns dot-paths of every match.
   - `stripTodoFields(cv)`: deep-clones `cv` and, for each match, consults the Zod shape at
     that path (`cvSchema`'s nested `.shape`) to decide: field belongs to a **required**
     property of an object → delete the *entire enclosing object* from its parent array (or
     null it out if not inside an array); field belongs to an **optional** property →
     delete just that property; match is inside a plain string array (`highlights`,
     `keywords`) → splice out just that array element.
   - `getPublishableCv(cv, { isProd, warn })`: returns `cv` unchanged when `!isProd`;
     otherwise strips and calls `warn(message)` once listing every stripped path.
   - Export `cvForBuild` (reads `import.meta.env.PROD`, `warn` = `console.warn`) as the one
     import every page/component uses instead of the raw `cv` export.
   - Tests: `tests/unit/cv.publish.test.ts`, with fixtures mirroring every section's real
     shape (a `profiles` entry with TODO in the required `network` vs. required `url`; a
     `work` entry with TODO in the optional `endDate`/`url` vs. required `name`/`position`;
     a `highlights`/`keywords` entry with one TODO item among several; `"Kristodoras"`
     asserted as a non-match).
2. **Remove `getVisibleProfiles`; unify the home page.** Delete `isTodoPlaceholder` and
   `getVisibleProfiles` from `src/lib/cv.ts`. Update `src/pages/index.astro` and
   `src/components/Footer.astro` to import `cvForBuild` from `cv.publish.ts` and read
   `cvForBuild.basics.profiles` directly (already filtered). Update/remove any existing
   test that exercised the old `getVisibleProfiles` behaviour in favour of coverage in
   `cv.publish.test.ts`. Extend `tests/e2e/home.spec.ts` if needed to confirm profile
   filtering still works end-to-end through the new path.
3. **Work reverse-chronological ordering.** Add `getWorkReverseChronological(work)` to
   `src/lib/cv.ts` (sorts by `endDate ?? "ongoing-sentinel"` descending, then `startDate`
   descending as a tie-break; no-`endDate` entries sort first). Test:
   `tests/unit/cv.order.test.ts`, with a shuffled fixture including one ongoing entry and
   two entries sharing a year.
4. **JSON-LD helper + safe serialization.** Add `src/lib/structured-data.ts`:
   `buildPersonJsonLd(cv)` mapping `basics` → schema.org `Person` (`name`, `jobTitle` ←
   `label`, `email`, `url`, `address` ← `location`, `sameAs` ← visible profile URLs,
   `description` ← `summary`), and `toSafeJsonLd(value)` = `JSON.stringify(value).replace(/</g,
   "\\u003c")`. Test: `tests/unit/structured-data.test.ts` (field mapping; a fixture
   containing `<` in `summary` asserted to come out `<`-escaped).
5. **Shared `CvContent.astro`.** Add `src/components/CvContent.astro`: takes an
   already-publishable `cv`-shaped prop; renders every AC-1 section, hiding a section
   entirely when its backing array/string is empty; renders every profile/company URL as
   `<a href={url}>{url}</a>` (visible text = href, decision #4) in both `/cv` and
   `/cv/print` — no `linksAsText` branching needed since the href-as-text rendering is now
   correct in both contexts. No dedicated unit test (markup-only); covered by tasks 6–7's
   e2e suites.
6. **BaseLayout + Header: JSON-LD slot and download link.** Extend `BaseLayout.astro`'s
   `Props` with an optional `structuredData?: unknown`, rendered as
   `<script type="application/ld+json" set:html={toSafeJsonLd(structuredData)}>` in
   `<head>` when present. Add a "Download CV (PDF)" link
   (`href="/andrius-riauba-cv.pdf"`) to `Header.astro`'s nav.
7. **`/cv` page with styled download button.** Add `src/pages/cv.astro`: `BaseLayout` with
   `structuredData={buildPersonJsonLd(cvForBuild)}`; renders a visually distinct download
   button (styled, not just a text link — e.g. a `.button`-class element) near the top of
   the page linking to `/andrius-riauba-cv.pdf`, then `<CvContent cv={cvForBuild} />`.
   Test: `tests/e2e/cv.spec.ts` (AC-1, AC-5 — both the Header link and the button, AC-6).
8. **`/cv/print` page, print stylesheet, noindex/canonical.** Add `src/styles/print.css`
   (`@page { size: A4; margin: ...; }`, compact print typography) and
   `src/pages/cv/print.astro` (a minimal `<html>` shell — no `Header`/`Footer`, no nav,
   `<meta name="robots" content="noindex">`, `<link rel="canonical" href="/cv">` — importing
   `global.css` and `print.css`, rendering `<CvContent cv={cvForBuild} />`). Test:
   `tests/e2e/cv-print.spec.ts` (no-nav/A4/noindex/canonical/links-render-href-as-text).
9. **Real PDF generation script.** Replace `scripts/build-pdf-stub.mjs` with
   `scripts/build-pdf.mjs` (spawns `npm run preview -- --port 4323`, polls readiness with a
   bounded, fail-loud timeout, launches `playwright-core`'s `chromium`, navigates to
   `/cv/print`, awaits `document.fonts.ready`, calls `page.pdf({ path:
   "dist/andrius-riauba-cv.pdf", format: "A4", printBackground: true })`, tears down browser
   + server in `finally`). Update `package.json`: point `build:pdf` at the new file, add
   `playwright-core` (pinned to the same version as `@playwright/test`/`playwright`) and
   `pdf-parse` as devDependencies. Delete the stub file. See
   [ADR-0002](../adr/0002-pdf-generation-approach.md) (filename corrected to
   `andrius-riauba-cv.pdf` throughout).
10. **PDF content test.** Add `tests/e2e/cv-pdf.spec.ts`: reads
    `dist/andrius-riauba-cv.pdf` with `node:fs` + `pdf-parse`, asserts `.text` contains
    `cv.basics.name` (AC-4), `.text` contains `"Registrų Centras"` (decision #6, font
    embedding proof), and `.numpages <= 2` (AC-3, hard ceiling per decision #8).
11. **Extend existing suites.** `tests/e2e/accessibility.spec.ts` — add `/cv` and
    `/cv/print` to the scanned `paths`. `tests/e2e/layout.spec.ts` — add `/cv` to the
    shared-header/footer check (explicitly **not** `/cv/print`). `tests/e2e/home.spec.ts` —
    add the AC-5 download-link assertion and confirm profile filtering still works via the
    unified path (task 2).
12. **Final pass.** Update `docs/specs/002-cv-page-and-pdf.md`'s AC-4/AC-5 text to the
    corrected filename `andrius-riauba-cv.pdf`. Run `make lint`, `make test`, `make
    security`, `make e2e`, `make build` locally. Confirm the generated PDF is ≤2 pages (hard
    ceiling, decision #8). Confirm `npm audit --audit-level=high` is clean for the two new
    devDependencies. (Docs updates are the doc-writer agent's job in the next pipeline
    phase, as in spec 001.)

## Design decisions

- **`/cv` and `/cv/print` share one `CvContent.astro`** component, so the web page and the
  PDF's source HTML can never silently diverge.
- **Links render as `<a>` with their href as visible text**, not plain text or an
  `::after`-CSS trick — clickable in both the web page and the generated PDF, and simply
  assertable in Playwright (decision #4).
- **One TODO-filtering mechanism for the whole site** (`cv.publish.ts`), replacing spec
  001's separate home-page-only `getVisibleProfiles`, so there is exactly one place that
  encodes "what counts as a placeholder" and "what to do about it" (decision #3).
- **TODO-stripping granularity follows the Zod schema's required/optional split**, not a
  blanket "whole record" or "single field" rule — this avoids both a half-broken record
  (TODO in a required field) and over-deletion (a single TODO highlight taking its whole
  work entry with it) (decision #1).
- **Work order is computed, not trusted from file order**, mirroring spec 001's
  `getFeaturedProjectsSorted` precedent.
- **JSON-LD is injected via an optional `BaseLayout` prop**, serialized through a shared
  `toSafeJsonLd` helper so every future JSON-LD consumer gets the `<` escaping for free.
- **"Download CV (PDF)" appears twice**: the shared Header nav link (cheap, universal) plus
  a styled button at the top of `/cv` itself (decision #9) — the nav link alone was judged
  not prominent enough for AC-5's "clearly visible" on the page recruiters actually land on.
- **PDF generation mechanics**: see [ADR-0002](../adr/0002-pdf-generation-approach.md).

## Risks

- **AC-2's schema-driven stripping has no real-content positive case today.**
  `content/cv.yaml` has zero literal whole-word `TODO` values, so correctness rests on
  `tests/unit/cv.publish.test.ts`'s synthetic fixtures. Mitigate with fixture coverage
  mirroring every section's real shape and every required/optional field combination.
- **Fitting the full CV onto ≤2 printed A4 pages (AC-3) is content-density-dependent.**
  Guarded only by `cv-pdf.spec.ts`'s page-count assertion re-run on every build; no
  proactive warning before that point.
- **The PDF script's process lifecycle (spawn/poll/teardown) has no dedicated unit test** —
  mitigated by a `finally`-guaranteed kill and a bounded startup timeout (ADR-0002), but
  remains harder to unit-test than pure functions.
- **Chromium's PDF text-embedding for self-hosted `woff2` latin-ext glyphs is now
  empirically checked** (decision #6's "Registrų Centras" assertion) rather than merely
  assumed — this closes the gap the original plan flagged, but the assertion only runs
  after `make build` completes, so a regression still surfaces as a test failure, not a
  build-time warning.
- **`playwright-core` and `@playwright/test`/`playwright` must stay version-aligned**
  (ADR-0002) so the PDF script reuses the one Chromium binary `make setup` installs.
- **Removing `getVisibleProfiles` changes home-page behaviour timing**: TODO profiles were
  previously hidden on the home page in *both* dev and prod; after unification they follow
  the same prod-build-only rule as everywhere else, so a TODO profile **will** render on
  the home page during `astro dev`. This is the explicitly confirmed, intended behaviour
  (decision #3), not a regression, but is called out here since it changes what Andrius
  sees locally while editing `content/cv.yaml`.

## Open questions

None remaining — all four from the original plan were resolved by the confirmed decisions
above.
