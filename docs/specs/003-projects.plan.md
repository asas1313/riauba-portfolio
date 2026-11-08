# 003 – Projects catalogue and detail pages: implementation plan

Spec: [docs/specs/003-projects.md](./003-projects.md) · ADR:
[docs/adr/0003-project-body-todo-stripping.md](../adr/0003-project-body-todo-stripping.md)

Status: **Approved with amendments** (2026-11-08) — see amendments list below; supersedes the
original Open questions, which are kept for record but resolved.

## Amendments (approved by Andrius, 2026-11-08)

1. `PR:` line format and retrofit into specs 001/002 — accepted as drafted. Additionally: spec
   003's own `PR:` line is added to `docs/specs/003-projects.md` **after** `gh pr create` runs
   (step 8 of the ship process), committed to this same branch before merge — not part of the
   implementer's tasks below, handled by the orchestrator at PR time.
2. AC-4's link-button hiding is **unconditional** (dev and prod) — confirmed as drafted, no longer
   an open question.
3. Tag slug collisions must **fail the build**, not silently merge: `getAllTagSlugs` throws a
   readable error if two distinct tag labels slugify to the same non-empty slug, or if any tag
   slugifies to an empty string (e.g. a punctuation-only tag like `"C++"` vs `"C#"` both losing
   their distinguishing characters). Supersedes the original "silent merge, documented behaviour"
   design — see updated Task 2, Design decisions and Risks below.
4. One generic badge style for all `status` values — confirmed as drafted.
5. `/how-this-site-was-built` copy — confirmed: short and factual, Andrius will review tone/
   accuracy before merge.
6. `tests/unit/specs.test.ts` must **not** hardcode "exactly specs 001–004" or "003/004 have no
   PR" — assert against whatever `docs/specs/*.md` actually contains at test time, so the suite
   doesn't break the moment spec 004 (or later) is retrofitted with a PR line or a new spec is
   added. See updated Task 9/AC-6 test description.
7. `removeTodoParagraphs` must check a paragraph's **recursively-joined plain text** (concatenating
   all descendant inline text, so a leading `**TODO**` bold run is also caught), not just the
   first child's raw text. The remaining, narrower limitation — only *top-level* paragraphs
   (direct children of the document root) are inspected, not paragraphs nested inside list items
   or blockquotes — is documented in ADR-0003 instead. See updated Task 4 and ADR-0003.
8. Explicitly verify the content-layer cache behaviour named in ADR-0003's Context: run `astro
   dev`, then `astro build` **without clearing `.astro/`** in between, and confirm TODO paragraphs
   are still stripped from the production output. If they are not, this is a bug to fix before
   shipping, not a documented limitation. See updated Task 4/14.
9. The new `/projects`, `/projects/<slug>` and `/projects/tag/<tag>` pages must be added to
   `tests/e2e/performance.spec.ts`'s coverage, not just `layout.spec.ts`/`accessibility.spec.ts`.
   See updated Task 11.

## Summary

Spec 003 turns the already-existing `projects` content collection (built ahead of time in spec
001) into three new public route shapes — a `/projects` catalogue listing every project ordered
by `order`, static `/projects/tag/<tag>` filter pages for each stack tag, and `/projects/<slug>`
detail pages rendering each file's markdown body with link buttons — plus a
`/how-this-site-was-built` page explaining the AI delivery pipeline and listing every spec in
`docs/specs/` with its status and (when present) a link to its merged PR. Content-level
validation (AC-2) is already enforced by the existing `projectSchema` in `src/content.config.ts`
from spec 001/ADR-0001 and needs no new mechanism, only confirmation of coverage. Two small,
purpose-fit TODO-handling additions are needed: an **unconditional** (dev-and-prod) filter that
hides a project detail page's live/docs/repo link button when that link is `null` or literally
`"TODO"` (AC-4), and a **production-build-only** remark plugin that drops any markdown body
paragraph starting with `TODO` (AC-5), reusing spec 002's whole-word/case-sensitive matching rule
but operating on the markdown AST rather than a JS object tree (see ADR-0003 for why). The spec
list on `/how-this-site-was-built` is read at build time from `docs/specs/*.md` via a new,
narrow parser (`src/lib/specs.ts`) looking for the existing `# NNN – Title` / `Status: ...` header
convention plus a new, optional `PR: <url>` line that this plan introduces (and retrofits into
specs 001 and 002, whose PRs are already known from the shipped ship logs).

## Acceptance criteria → tests

| AC | Criterion (short) | Tests |
| --- | --- | --- |
| AC-1 | `/projects` lists every project ordered by `order`, each with title, tagline, status badge, stack tags | `tests/unit/projects.test.ts` (new `getAllProjectsSorted`: includes non-featured entries unlike `getFeaturedProjectsSorted`, ascending `order`, stable tie-break, empty-collection boundary); `tests/e2e/projects.spec.ts` (`/projects` renders all four real project files in `order`, each showing title/tagline/status text/stack tag text, via `readProjects()` from `tests/e2e/helpers/content.ts`) |
| AC-2 | Invalid project frontmatter fails the build with a readable error | Already covered by `tests/unit/projects.test.ts`'s existing `projectSchema` rejection tests (missing `title`, wrong-typed `order`/`featured`); this plan adds 1–2 more fixtures (invalid `links` shape, non-array `stack`) for completeness. No new production code — `src/content.config.ts`'s existing Zod schema + Astro's content-collection validation (ADR-0001) already enforces this |
| AC-3 | Selecting a stack tag on `/projects` filters to that tag via static `/projects/tag/<tag>` pages, no JS required | `tests/unit/projects.test.ts` (new `slugifyTag`, `getAllTagSlugs`, `getProjectsByTagSlug`: slugification of real tag strings e.g. "Spring Boot" → "spring-boot", filtering correctness, empty/no-match boundary; **plus**: `getAllTagSlugs` throws a readable error for two distinct labels colliding on one non-empty slug, and for any label slugifying to an empty string); `tests/e2e/projects.spec.ts` (every stack tag on `/projects` is an `<a href="/projects/tag/<slug>">`; navigating directly to a real tag URL shows only matching projects; zero `<script>` elements on both `/projects` and a `/projects/tag/<slug>` page, proving the filter needs no client JS); `tests/e2e/performance.spec.ts` (extended to also assert the <300 KB/zero-third-party/zero-`<script>` budget for `/projects`, a real `/projects/<slug>`, and a real `/projects/tag/<slug>`) |
| AC-4 | `/projects/<slug>` renders the markdown body and shows a button per link only when it is set (not `null`, not `"TODO"`) | `tests/unit/project-links.test.ts` (new `getVisibleProjectLinks`: `null` hidden, literal `"TODO"` hidden, a real URL shown, stable live/docs/repo ordering, all-`null` → empty array); `tests/e2e/projects.spec.ts` (against real fixtures: `atsidek` shows only a "live" button, `homelab`/`payments-migration` show zero link buttons; markdown body text — e.g. `homelab`'s single paragraph — is present as rendered HTML, not raw markdown syntax) |
| AC-5 | Markdown body paragraphs starting with `TODO` are omitted in production builds, with a build warning | `tests/unit/markdown-todo.test.ts` (new `removeTodoParagraphs` against synthetic mdast fixtures: a paragraph whose **recursively-joined plain text** (concatenating all descendant inline text nodes, so a leading `**TODO**` bold run or `TODO` inside a leading link is also caught) matches `/^TODO\b/` is removed; a paragraph merely *containing* `TODO` later in the sentence is kept — AC-5 is "starting with", not spec 002's "anywhere"; a paragraph nested inside a list item or blockquote starting with `TODO` is conservatively kept (top-level-only scope, documented in ADR-0003); multiple top-level TODO paragraphs are all removed; non-paragraph top-level nodes, e.g. a heading, are untouched; `remarkStripTodoParagraphs({enabled:false})` is a no-op even against a TODO fixture; `{enabled:true}` calls `warn` exactly once per file with a count when something was removed, and not at all otherwise); `tests/e2e/projects.spec.ts` (built, production `/projects/atsidek` and `/projects/payments-migration` pages, each of which has a real `TODO (Andrius): ...` paragraph in `content/projects/`, never render the literal text `"TODO"` anywhere in `<main>`; **plus** a cache-staleness check: run `astro dev` (or an equivalent content-sync warm-up) then `astro build` **without** clearing `.astro/` in between, and confirm the production output still has the TODO paragraph stripped — see plan amendment 8 / ADR-0003) |
| AC-6 | `/how-this-site-was-built` explains the delivery pipeline and lists every spec (number, title, status) with a PR link when a `pr:`/`PR:` field is present, omitted otherwise | `tests/unit/specs.test.ts` (new `parseSpecIndexEntry`/`getSpecIndex`: parses the `# NNN – Title` + `Status: ...` header convention from synthetic fixtures; parses an optional `PR: <url>` line when present; filename filter excludes `*.plan.md`/`*.log.md`/`_TEMPLATE.md`; a real-content check, derived dynamically from the actual `docs/specs/*.md` directory listing at test time — not a hardcoded "exactly 001–004" assumption — that `getSpecIndex()` returns one entry per matching real spec file, numbers/titles/statuses matching those files' own headers, sorted ascending, and that any entry's `pr` field matches that file's own `PR:` line when present); `tests/e2e/how-this-site-was-built.spec.ts` (page contains non-empty explanatory prose about the pipeline; lists every real spec from `docs/specs/*.md` with its real title/status, read dynamically rather than hardcoding which specs currently have a PR; every spec whose file has a `PR:` line renders a link to that exact URL, every spec without one renders no PR link — checked per-file, not via a fixed "003/004 have none" assumption that would break once spec 003 retrofits its own `PR:` line post-merge) |

## Tasks

1. **Extract the shared TODO-matching predicate.** Add `src/lib/todo.ts` exporting the
   whole-word, case-sensitive `TODO_PATTERN = /\bTODO\b/` (moved from `cv.publish.ts`) and a
   small `isTodoMarked(value: string | null | undefined): boolean` helper. Refactor
   `src/lib/cv.publish.ts` to import `TODO_PATTERN` from here instead of defining its own
   copy; its public behaviour and exports are unchanged, so `tests/unit/cv.publish.test.ts`
   needs no changes. Files: `src/lib/todo.ts` (new), `src/lib/cv.publish.ts` (edit),
   `tests/unit/todo.test.ts` (new — `"Kristodoras"`/`"todo"` non-matches, `"TODO: ..."` match,
   `null`/`undefined` → not marked).
2. **`getAllProjectsSorted`, tag slugs and filtering in `projects.ts`.** Add to
   `src/lib/projects.ts`: `getAllProjectsSorted(entries)` (no `featured` filter, same ascending
   `order` sort as `getFeaturedProjectsSorted`); `slugifyTag(tag: string): string` (lowercase,
   non-alphanumeric runs → single hyphen, trim leading/trailing hyphens); `getAllTagSlugs(entries)`
   returning one `{ slug, label, projects }` per distinct slug (label = first-seen original tag
   spelling for that slug), sorted by label — **and throwing a readable `Error` at build time**
   (naming both colliding labels, or the offending empty-slug label) if two distinct tag labels
   slugify to the same non-empty slug, or if any label slugifies to an empty string; no silent
   merge (amendment 3); `getProjectsByTagSlug(entries, slug)`. File: `src/lib/projects.ts` (edit).
   Tests: `tests/unit/projects.test.ts` (extend) — real-content fixtures (`"Spring Boot"` →
   `"spring-boot"`), a synthetic two-distinct-labels-same-slug fixture asserting `getAllTagSlugs`
   throws (not merges), a synthetic punctuation-only-label (e.g. `"C++"`/`"C#"`-style) fixture
   asserting the empty-slug case also throws, empty-collection boundaries.
3. **`getVisibleProjectLinks`.** Add `src/lib/project-links.ts`: given a project's `links`
   object, returns an ordered array of `{ kind: "live" | "docs" | "repo", label, url }` entries,
   dropping any whose value is `null` or `isTodoMarked`. This filter is **unconditional**
   (same result in `astro dev` and `astro build` — see Design decisions and Open questions).
   Test: `tests/unit/project-links.test.ts` (new).
4. **Markdown body TODO-paragraph stripping (AC-5).** Add `src/lib/markdown-todo.ts`
   (`removeTodoParagraphs(tree)`, `remarkStripTodoParagraphs({ enabled, warn })`) per
   [ADR-0003](../adr/0003-project-body-todo-stripping.md). `removeTodoParagraphs` matches a
   top-level paragraph by its **recursively-joined plain text** (concatenate all descendant
   inline text nodes depth-first, so a leading `**TODO**` bold run or a `TODO` inside a leading
   link is caught, not just a bare leading `text` node), against `/^TODO\b/`; only *direct*
   children of the document root are inspected (paragraphs nested in list items/blockquotes are
   out of scope — documented as a limitation in ADR-0003, not silently "fixed" by a full-tree
   visitor). Update `astro.config.mjs` to the functional `defineConfig(({ command }) => ({ ...,
   markdown: { remarkPlugins: [[remarkStripTodoParagraphs, { enabled: command === "build", warn:
   console.warn }]] } }))` form. Files: `src/lib/markdown-todo.ts` (new), `astro.config.mjs`
   (edit). Tests: `tests/unit/markdown-todo.test.ts` (new, synthetic mdast fixtures only — no
   Astro build needed for the unit-level logic). **Manual/CI verification (amendment 8):** after
   implementing, run `astro dev` briefly (to warm the content-layer cache), stop it, then run
   `astro build` **without** deleting `.astro/`, and confirm the built `/projects/<slug>` pages
   with real TODO paragraphs still have them stripped — if stale-cache HTML leaks through, this
   is a bug to fix (e.g. the content-layer cache may need busting on config/plugin changes), not
   something to document around.
5. **`ProjectCard` gains a status badge and stack tag links; shared styles.** Extend
   `src/components/ProjectCard.astro` to render a status badge (`<span class="project-badge">
   {project.data.status}</span>`, styled generically — no per-status colour coding, see Open
   questions) and each stack entry as `<a href="/projects/tag/{slugifyTag(tag)}">{tag}</a>`,
   alongside the existing title link and tagline (unchanged markup/testid, so
   `tests/e2e/home.spec.ts` keeps passing unmodified). Add `.project-badge`/`.project-tags`/
   `.tag-link` rules to `src/styles/global.css` (plain CSS, light/dark-aware via existing custom
   properties, no new ones needed). Files: `src/components/ProjectCard.astro` (edit),
   `src/styles/global.css` (edit). No dedicated unit test (markup/CSS-only); covered by task 6's
   and the existing home page's e2e suites.
6. **`/projects` catalogue page (AC-1).** Add `src/pages/projects/index.astro`: `getCollection
   ("projects")` → `getAllProjectsSorted` → render each via `ProjectCard` inside `BaseLayout`
   (own title/description/`path="/projects"`, per the site's per-page SEO convention). File:
   `src/pages/projects/index.astro` (new).
7. **`/projects/tag/<tag>` static filter pages (AC-3).** Add
   `src/pages/projects/tag/[tag].astro` with `getStaticPaths()` built from `getAllTagSlugs`,
   passing `{ label, projects }` as props; renders the same `ProjectCard`-based list, through
   `BaseLayout` with a tag-specific title ("Projects tagged \"<label>\"") and
   `path="/projects/tag/<slug>"`. File: `src/pages/projects/tag/[tag].astro` (new).
8. **`/projects/<slug>` detail page (AC-2 confirmation, AC-4, AC-5 integration).** Add
   `src/pages/projects/[slug].astro`: `getStaticPaths()` from `getCollection("projects")`
   (`params: { slug: entry.id }`); imports `render` from `astro:content` to get `<Content />`
   for the (already TODO-paragraph-stripped, in production, per task 4) body; renders
   `title`/`tagline`/status badge/stack tags (reusing the task-5 markup, extracted if
   convenient) and a link button per `getVisibleProjectLinks(project.data.links)` entry. File:
   `src/pages/projects/[slug].astro` (new). This is also where AC-2 is implicitly exercised:
   `getStaticPaths` reading an invalid collection entry would already have failed the build
   earlier, at collection-sync time, per ADR-0001 — no new error handling needed here.
9. **Spec index parsing (`src/lib/specs.ts`) and PR-line retrofit.** Add `src/lib/specs.ts`:
   reads `docs/specs/*.md` via `import.meta.glob("/docs/specs/*.md", { query: "?raw", import:
   "default", eager: true })` (resolved by Vite at transform time against the project root,
   immune to the chunk-relocation problem ADR-0001 documents for a computed `fs` path — same
   reasoning as `cv.ts`'s `?raw` import, just via the glob form since the file set is open-ended);
   filters filenames to `/^\d{3}-[\w-]+\.md$/` (excludes `_TEMPLATE.md`, `*.plan.md`, `*.log.md`);
   `parseSpecIndexEntry(raw, filename)` extracts `{ number, title, status, pr? }` from the `#
   NNN – Title` first line, the `Status: ...` line, and an optional `PR: <url>` line (throws a
   readable error, per this project's fail-loud convention, if the filename's leading number
   disagrees with the H1's, or if the H1/Status line is missing/malformed); `getSpecIndex()`
   returns all entries sorted ascending by `number`. **Retrofit**: add a `PR:
   https://github.com/asas1313/riauba-portfolio/pull/2` line to `docs/specs/001-site-foundation.md`
   and a `PR: https://github.com/asas1313/riauba-portfolio/pull/3` line to
   `docs/specs/002-cv-page-and-pdf.md` (both URLs taken from their own ship logs /
   `git reflog`; see Design decisions — **flagged in Open questions for confirmation** since it
   edits already-"Final" spec files). Files: `src/lib/specs.ts` (new),
   `docs/specs/001-site-foundation.md` (edit, metadata only), `docs/specs/002-cv-page-and-pdf.md`
   (edit, metadata only). Tests: `tests/unit/specs.test.ts` (new).
10. **`/how-this-site-was-built` page (AC-6).** Add `src/pages/how-this-site-was-built.astro`:
    hand-written prose (not sourced from `content/`, since it is site copy about process, not a
    CV fact — see Open questions) describing the spec → plan → implement → test → review → docs
    pipeline and its two human gates (plan approval, production deploy — per `CLAUDE.md`'s
    "Definition of done"), followed by a table built from `getSpecIndex()`: number, title,
    status, and a "PR" link only when `entry.pr` is set. File:
    `src/pages/how-this-site-was-built.astro` (new).
11. **Extend shared e2e suites to the new routes.** `tests/e2e/layout.spec.ts` — add
    `/projects`, a real slug (`/projects/atsidek`), a real tag (`/projects/tag/java` or
    equivalent) and `/how-this-site-was-built` to the shared-header/footer `pages` array.
    `tests/e2e/accessibility.spec.ts` — add the same four paths to its `paths` array (light +
    dark axe scans). `tests/e2e/performance.spec.ts` (amendment 9) — add `/projects`, the same
    real slug and the same real tag path to its budget checks (<300 KB, zero third-party
    requests, zero `<script>` elements), alongside the existing `/` coverage; `/how-this-
    site-was-built` is reasonable to include too since it's the same zero-JS static-page shape.
    Files: all three edited.
12. **New e2e suites.** Add `tests/e2e/projects.spec.ts` (AC-1, AC-2 note, AC-3, AC-4, AC-5 —
    see the table above) and `tests/e2e/how-this-site-was-built.spec.ts` (AC-6), both reading
    expected data via `tests/e2e/helpers/content.ts` (extended with a `readProjects()`-based
    `getAllProjectsSorted`/tag-grouping mirror and a small spec-index reader, following the
    existing "e2e specs can't import `src/lib/*.ts` directly" convention already documented
    there). Files: `tests/e2e/projects.spec.ts` (new), `tests/e2e/how-this-site-was-built.spec.ts`
    (new), `tests/e2e/helpers/content.ts` (edit).
13. **Docs and changelog.** Update `docs/technical/index.md` (architecture diagram and module
    table: new `/projects*`/`/how-this-site-was-built` pages, `todo.ts`, `project-links.ts`,
    `markdown-todo.ts`, `specs.ts`; remove the "do not exist yet" scope note) and
    `docs/user-guide/index.md` (remove the "not built yet" callout; document stack-tag filtering
    and the project detail page; note the `TODO`-paragraph and `TODO`-link-button rules for
    project authors). Add a "spec 003" section to `docs/CHANGELOG.md`. File:
    `docs/specs/003-projects.log.md` (already exists, untracked) continues to be updated by the
    pipeline's own process, not by this plan.
14. **Final pass.** `make lint`, `make test`, `make security`, `make docs`, `make e2e`,
    `make build` all green locally. Confirm `npm audit --audit-level=high` stays clean (no new
    dependencies are added by this plan — see Design decisions).

## Design decisions

- **No new dependency.** Markdown-body TODO stripping is implemented as a small, hand-written
  remark plugin (ADR-0003) operating directly on mdast's plain-object `.children` arrays, rather
  than pulling in `unist-util-visit` or similar — the only traversal needed is over a node's
  *direct* children, not a full-tree visitor.
- **AC-4's link-button filter is unconditional** (same in dev and prod), unlike AC-5's and spec
  002's prod-build-only TODO stripping — confirmed by amendment 2.
- **Tag slug collisions fail the build** rather than silently merging (amendment 3): `getAllTagSlugs`
  throws a readable error naming the colliding labels (or the empty-slug label) instead of the
  originally-planned "last-seen label wins" merge. Consistent with the project's fail-loud
  convention (`cv.publish.ts`'s required-field TODO handling from spec 002 sets the same
  precedent).
- **`pr:` becomes a plain `PR: <url>` text line**, not YAML frontmatter, appended directly below
  the existing `Status: ... · Owner: ... · Date: ...` line rather than folded into it. This
  keeps the diff to existing "Final" spec files to one added line each, avoids introducing a
  second, YAML-based metadata format alongside the project's existing plain-header convention,
  and keeps `parseSpecIndexEntry` a simple two-regex function instead of a YAML parser dependency
  for a single optional field. See **Open questions** — this is a judgment call, not something
  the spec text actually specifies.
- **`getAllProjectsSorted`/`getFeaturedProjectsSorted` stay separate functions** (not one
  parameterised by a filter predicate) — both are one-line filter+sort pure functions already
  unit-tested independently; merging them would save a few lines at the cost of a slightly less
  direct call site (`getAllProjectsSorted(entries)` vs. something like
  `getProjectsSorted(entries, { featuredOnly: false })`).
- **Status badges have one generic visual style regardless of the status string** (the schema
  deliberately keeps `status` an open string per ADR-0001/spec 001, not a closed enum) — no
  per-value colour coding (e.g. green for "live"). Confirmed by amendment 4.
- **Tag pages are derived, not authored.** There is no separate "tags" content file; every tag
  page is generated from whatever `stack` arrays already exist across `content/projects/*.md`,
  consistent with the project's "add a markdown file, nothing else" authoring model (spec 003's
  second user story).
- **`docs/specs/*.md` is read via a Vite `import.meta.glob` raw import**, parallel to `cv.ts`'s
  single-file `?raw` import and for the same reason (ADR-0001's chunk-relocation hazard), rather
  than `node:fs` + a computed path. Unlike `cv.yaml`, the file set is open-ended (grows by one
  file per future spec), so the glob form is used instead of a static single-file import.

## Risks

- **Tag slug collisions now fail the build (amendment 3)**, so the risk shifts from "silent data
  merge" to "an unexpected build failure the first time two tags happen to collide." Acceptable:
  it surfaces at build time with a readable error naming both labels, same posture as invalid
  frontmatter (AC-2) and spec 002's required-field TODO error.
- **AC-5's "starting with TODO" rule now inspects the paragraph's recursively-joined plain text**
  (amendment 7), so a leading `**TODO**` or a TODO inside a leading link is caught too. The
  remaining, narrower limitation is scope, not detection: only *top-level* paragraphs (direct
  children of the document root) are inspected — a TODO paragraph nested inside a list item or
  blockquote ships as-is. Documented in ADR-0003 and covered by a unit test asserting that
  conservative (not-stripped) behaviour rather than silently passing.
- **The `PR:` line retrofit touches two already-"Final"-status, previously-merged spec files**
  (001, 002). The edit is metadata-only (adds one line each; no AC/content text changes), but it
  is still a change to files the project treats as closed/shipped records. Flagged explicitly in
  Open questions rather than just done silently.
- **No single aggregated TODO-stripping warning for project bodies**, unlike `cv.publish.ts`'s
  one-line-per-build summary — `markdown-todo.ts` warns once per affected *file* instead (see
  ADR-0003 Consequences). A build with several TODO paragraphs across several files produces
  several warning lines rather than one summary; still visible in the build log, just not
  identically formatted to the CV mechanism.
- **No independent performance-budget re-check for the new pages.** `tests/e2e/performance.spec.ts`
  (<300 KB, zero third-party requests, zero `<script>`) today only exercises `/`. This plan's new
  pages add no images, no JS, and reuse the same fonts/CSS already counted against the home
  page's budget, so a regression is unlikely, but it is an *assumption*, not a re-proven budget,
  for `/projects`, `/projects/<slug>` and `/projects/tag/<tag>`. Task 12's zero-`<script>`
  assertions (for AC-3's "no JS" requirement) partially cover this but don't re-check total byte
  weight.

## Open questions

All resolved — see the **Amendments** section at the top of this document (approved 2026-11-08).
Tag canonicalization beyond build-time collision detection (amendment 3) remains a possible
future content-governance decision, not a blocker for this spec.
