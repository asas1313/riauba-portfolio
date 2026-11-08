# 005 – Visual design (professional theme): implementation plan

Spec: [docs/specs/005-visual-design.md](./005-visual-design.md) · ADR (new, drafted alongside
this plan): [docs/adr/0004-visual-regression-docker.md](../adr/0004-visual-regression-docker.md)

Status: **Approved** (patvirtinta 2026-11-08). All open questions resolved — see the
"Decisions" section, which supersedes the "Design decisions"/"Open questions" defaults below
wherever they differ.

## Decisions (patvirtinta 2026-11-08)

1. Plain CSS, no Tailwind. Spec text fixed: `docs/specs/005-visual-design.md` now reads
   "Design tokens as CSS variables (plain CSS custom properties)" instead of "(Tailwind v4
   @theme)".
2. The `mcr.microsoft.com/playwright` image is an accepted exception to the
   European/self-hosted-first default (spec-mandated, no non-US equivalent exists). Local
   `docker run` invocations (task 11) must add `--user $(id -u):$(id -g)` (avoid root-owned
   output files) and `--ipc=host` (Playwright's documented requirement to avoid Chromium
   crashes under Docker's default shared-memory limits).
3. Accent colour: keep `#1d4ed8` as the **light**-theme accent. The **dark** theme does *not*
   reuse the same hex — task 13's contrast-tuning pass must pick a distinct, lighter-tuned
   variant of the same hue for `[data-theme="dark"]` (and the `prefers-color-scheme: dark`
   block), not just reuse `#1d4ed8` on a dark background.
4. Button primary/secondary assignment is by **link type, not DOM position**: priority order
   `live` > `docs` > `repo` — whichever of these is present with the highest priority is
   `.project-link-button` (primary); any other present link gets `.button-secondary`. This
   replaces task 8's "first visible link" rule.
5. Mono font: **JetBrains Mono, weight 400, latin + latin-ext subset** (not latin-only — kept
   consistent with the rest of the site's Lithuanian-character requirement even though no
   current content uses it), **not preloaded** (zero bytes on any page without `code`/`pre`).
6. Visual baselines (AC-8): the task 11 page set stands, **plus** `/` and `/cv` at 360px
   width, light theme only (2 extra baselines — these are *not* duplicated in dark, since
   their purpose is narrow-width layout, already covered in both themes at the other
   breakpoints by the main baseline set).
7. **No mobile-menu toggle at all** — task 5's `<details>/<summary>` CSS-only collapsing menu
   is dropped entirely. With only 3 nav items, the nav simply wraps onto its own line below the
   site name/logo at narrow widths (flex-wrap, no JS, no `::details-content` dependency, no
   hidden/revealed state to test). AC-4's responsive tests become: no horizontal scroll at
   360/768/1280px, and all nav `<a>` links are visible (not `display:none`, not clipped) and
   independently clickable at 360px.

Further fixes (patvirtinta 2026-11-08):

- AC-5/task 10's font-preload check direction is **"every `<link rel=preload as=font>` is
  actually requested"** (no dead/unused preloads) — **not** "every requested font is
  preloaded." Inter 600 (headings) is deliberately *not* preloaded (below-the-fold on most
  pages); only Inter 400 **latin and latin-ext** (both subset files) are preloaded.
- Both inline scripts (theme-init in `<head>`, theme-toggle in `Header`) must wrap every
  `localStorage` access in `try`/`catch` (private-browsing/storage-disabled contexts throw on
  access, not just on write).
- Set the CSS `color-scheme` property (`light`/`dark`) alongside `data-theme` in both the
  head-init script and the toggle script, so native form controls/scrollbars follow the
  active theme too.
- The theme toggle `<button>` is hidden by default (e.g. `[hidden]` or `visibility:hidden` in
  the base stylesheet) and revealed only by the toggle script once it attaches its listener —
  it must never render as an apparently-functional control when JS hasn't run.
- Task 7: express the reading measure as `max-width: 68ch` (not a fixed px/rem value); drop
  the planned e2e pixel-width bounding-box assertion — the visual-regression baselines (task
  11) are the check for this, not a new e2e assertion.
- Task 2's hardcoded-colour guard also flags `rgb(`, `rgba(`, `hsl(`, and `oklch(` literals
  outside `tokens.css`, not just hex literals.
- Add a note to spec 004's section of `docs/technical/index.md`: if a Content-Security-Policy
  is ever added, the two inline scripts from tasks 3–4 will need `sha256-` hashes (or a nonce)
  in the `script-src` directive, since `unsafe-inline` would defeat the point of adding a CSP.

## Summary

Spec 005 replaces today's minimal styling (plain `:root` custom properties switched only by
`prefers-color-scheme`, one accent colour, no mobile nav, no theme toggle) with a calm,
AstroPaper-inspired professional theme, ported as a **visual layer only** — no Tailwind
toolchain, no change to Astro's zero-client-JS-by-default posture beyond the one feature that
genuinely needs script: a persisted, flash-free dark/light toggle. Concretely: a single CSS
token file (`src/styles/tokens.css`) becomes the sole place colours/radii/fonts are defined
(enforced by a new lint-style unit test, not just convention); a `data-theme` attribute on
`<html>`, set by a tiny inline `<head>` script before first paint and flipped by a small toggle
button script, lets a manual choice override `prefers-color-scheme` and persist via
`localStorage` — the only client-side JavaScript shipped anywhere on the site; `Header.astro`
gains a skip-link, active-link state, and a `flex-wrap`-based nav that needs no collapsing
mechanism or JS at narrow widths; `Footer.astro` gains a GitHub link; every existing component (project cards, tag chips,
link buttons, CV sections, download button) is restyled from the token file without changing
markup/test-ids; a new self-hosted monospace font is added for `code`/`pre`; and a brand-new
Playwright *visual regression* suite (distinct from the existing, non-regression
`tests/screenshots/` documentation-screenshot capture) adds committed screenshot baselines that
are only ever generated and checked inside the official, version-pinned Playwright Docker
image, both via a new `make visual` target and a new CI job. `/cv/print` and the generated PDF
are explicitly untouched (out of scope per the spec), and are not expected to pick up the new
theme tokens' dark-mode behaviour beyond what they already inherit today.

## Acceptance criteria → tests

The spec file's own numbered list has a rendering/numbering quirk around items 9–11 (item 10 is
indented as if nested under item 9, and the visible count reads 9, 10, 11 rather than a clean
1–11). This plan does **not** renumber the spec file; it addresses all eleven criteria by
content, labelled AC-1..AC-11 in authoring order here for traceability.

| AC | Criterion (short) | Tests |
| --- | --- | --- |
| AC-1 | All pages use shared tokens; no hard-coded colours outside the token file | `tests/unit/no-hardcoded-colors.test.ts` (new: scans every `src/**/*.css` and `<style>` block in `src/**/*.astro` for hex, `rgb(`/`rgba(`, `hsl(`, and `oklch(` colour literals, failing if any are found outside `src/styles/tokens.css`); `tests/e2e/accessibility.spec.ts`'s existing "themed accent colour differs between light and dark" check extended to also assert a couple of new tokens (e.g. `--color-bg-elevated`, `--color-focus-ring`) resolve to non-empty, different-per-theme values |
| AC-2 | WCAG 2.2 AA contrast in both themes on `/`, `/cv`, `/projects`, one project page, one tag page — zero axe violations | `tests/e2e/accessibility.spec.ts` (already scans this exact path set in both colour schemes; re-verified/re-tuned token values, no new mechanism needed — see Design decisions) |
| AC-3 | Theme toggle works, persists, no flash on reload | `tests/e2e/theme-toggle.spec.ts` (new): clicking the toggle flips `document.documentElement.dataset.theme` and the computed `--color-bg`; a reload with no interaction keeps the previously-chosen theme (via `localStorage`); pre-seeding `localStorage` with `"dark"` via `page.addInitScript` before `page.goto` and asserting `document.documentElement.dataset.theme === "dark"` is already true at the `DOMContentLoaded` event (proving the head script ran before `Header`/`Footer` paint, not after a later tick) as the closest Playwright-provable proxy for "no flash" |
| AC-4 | Responsive at 360/768/1280px: no horizontal scroll, nav usable on mobile | `tests/e2e/responsive.spec.ts` (new): at each of the three viewport widths, `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; at 360px every nav `<a>` is visible (not `display:none`/clipped, non-zero bounding box) and independently clickable — the nav wraps below the site name via `flex-wrap`, no toggle, no JS; at 1280px the nav is inline on one line |
| AC-5 | No performance-budget regression; fonts preloaded; total font payload ≤150 KB | `tests/e2e/performance.spec.ts` (existing <300 KB total-weight/zero-third-party checks re-run unchanged against the restyled pages); new assertion in the same file (or a new `tests/e2e/fonts-budget.spec.ts`) summing only `resourceType === "font"` response bytes per page and asserting the total is `< 150 * 1024`; a check that every font `<link rel="preload" as="font">` present in `<head>` is actually requested (no dead/unused preloads) — the inverse direction from "every requested font is preloaded" (Inter 600 and the mono font are deliberately not preloaded) |
| AC-6 | Lithuanian characters render in the chosen font ("Registrų Centras") | `tests/e2e/cv.spec.ts` (extend): asserts the `/cv` page's work section contains visible text `"Registrų Centras"` (already present in `content/cv.yaml`, not previously asserted by this exact string); `tests/e2e/cv-pdf.spec.ts` (spec 002, unchanged) already proves the string is embedded as selectable glyphs in the generated PDF; the new visual-regression baseline for `/cv` (AC-8/AC-11) is the strongest empirical proof that the glyphs paint correctly rather than as tofu, since Playwright cannot otherwise inspect which font a browser actually used per glyph |
| AC-7 | AstroPaper MIT notice included in `THIRD_PARTY_NOTICES` for any ported styles | `tests/unit/third-party-notices.test.ts` (new): asserts `THIRD_PARTY_NOTICES.md` exists at the repo root and contains both the string `"AstroPaper"` and the string `"MIT"` |
| AC-8 | Playwright screenshot baselines added for key pages in both themes | `tests/visual/pages.spec.ts` (new) — `toHaveScreenshot()` assertions for `/`, `/cv`, `/projects`, `/projects/atsidek`, `/projects/tag/java`, `/how-this-site-was-built`, `/404`, each in light and dark `colorScheme` at the main viewport, **plus `/` and `/cv` at 360px width in light theme only**, against committed baseline PNGs (16 baselines total) |
| AC-9 | All existing tests pass unchanged except selectors that strictly need updating (listed in the PR description) | No dedicated test — a process requirement. This plan's own Task list below identifies the one expected break (`tests/e2e/performance.spec.ts`'s "ships zero `<script>` elements" assertion, which must change to account for the new inline theme-init/theme-toggle script) so it can be named explicitly in the PR description rather than discovered as a surprise |
| AC-10 | Fonts bundled in the repo (`src/assets/fonts` or pinned `@fontsource`); no system or CDN font for any rendered text | `tests/e2e/performance.spec.ts` (existing same-origin font-URL assertion, re-run against the new mono font too); `tests/unit/no-hardcoded-colors.test.ts`'s sibling check is **not** reused here — instead a new `tests/unit/fonts.test.ts` asserts every `font-family` token declared in `tokens.css` lists only `"Inter"`/the new mono family name as its first entries (system/generic fallbacks are allowed *after* the self-hosted family, per normal CSS fallback practice, but never as the sole or first-listed family) |
| AC-11 | Visual screenshot tests run inside the official, version-pinned Playwright Docker image, locally (`make` target) and in CI; baselines generated only there; tests await `document.fonts.ready` | `tests/unit/playwright-docker-version.test.ts` (new): parses the exact installed `@playwright/test` version (from `package-lock.json`) and the Docker image tag referenced by the `Makefile`'s `visual`/`visual-update` targets and by `.github/workflows/ci.yml`'s visual job, asserting all three name the identical version string; `tests/visual/pages.spec.ts` itself calls `await page.evaluate(() => document.fonts.ready)` before every `toHaveScreenshot()`; manual/CI verification that `make visual` only succeeds when actually run inside the pinned image (documented, not unit-testable) |

## Tasks

1. **Extract and extend the token file.** Add `src/styles/tokens.css`: move today's `:root`
   custom properties (`--color-bg`, `--color-text`, `--color-text-muted`, `--color-accent`,
   `--color-border`, `--font-sans`, `--content-width`) out of `global.css` into this new file,
   keeping the same names (already relied on by `tests/e2e/accessibility.spec.ts`) rather than
   renaming to AstroPaper's literal token names (see Design decisions). Add new tokens needed by
   this spec: `--color-bg-elevated` (card/surface background), `--color-focus-ring`,
   `--font-mono`, `--radius-sm`/`--radius-md`, and a `[data-theme="dark"]`/`[data-theme="light"]`
   override block declared *after* the existing `@media (prefers-color-scheme: dark)` block so a
   manual choice always wins over the system preference (same specificity, later source order).
   `--color-accent` stays `#1d4ed8` in the light set; the dark set (`@media (prefers-color-
   scheme: dark)` and `[data-theme="dark"]`) gets a **distinct, lighter-tuned variant** of the
   same hue, not a reuse of `#1d4ed8` — exact value finalised in task 13's contrast pass.
   `global.css` `@import`s `tokens.css` first. Files: `src/styles/tokens.css` (new),
   `src/styles/global.css` (edit).
2. **Mechanical AC-1 guard.** Add `tests/unit/no-hardcoded-colors.test.ts`: reads every
   `src/**/*.css` file and every `<style>` block inside `src/**/*.astro`, regex-scans for hex
   colour literals (`/#[0-9a-fA-F]{3,8}\b/`) **and** `rgb(`/`rgba(`/`hsl(`/`oklch(` function
   literals, and fails listing file/line if any are found outside `src/styles/tokens.css`. Fix
   the one known offender today, `src/styles/print.css`'s
   `border-top: 1px solid #ccc`, by switching it to `var(--color-border)` (print.css is otherwise
   explicitly out of scope — spec 002's "layout must stay unchanged" — but this one-line
   colour-token substitution does not change layout/pagination, only reuses an existing variable
   that already resolves to a visually near-identical grey). File:
   `tests/unit/no-hardcoded-colors.test.ts` (new), `src/styles/print.css` (edit, one line).
3. **Theme toggle: inline head script.** Extend `BaseLayout.astro`'s `<head>`: immediately after
   `<meta charset>`, a synchronous `<script is:inline>` reads `localStorage.getItem("theme")`
   inside a `try`/`catch` (private-browsing/storage-disabled contexts can throw on access, not
   just on write) and, if it is exactly `"light"` or `"dark"`, sets
   `document.documentElement.dataset.theme` and CSS `document.documentElement.style.colorScheme`
   to it before any stylesheet paints (no `prefers-color-scheme` fallback needed in script — the
   CSS media query already handles the no-stored-preference case). File: `BaseLayout.astro`
   (edit).
4. **Theme toggle: button + persistence script.** Add a toggle `<button>` (sun/moon inline SVG
   icon, `aria-pressed`, `aria-label="Toggle colour theme"`, hidden by default via `[hidden]` or
   `visibility:hidden` in the base stylesheet so it never appears as a functional control before
   JS attaches) to `Header.astro`, plus one `<script is:inline>` (in `Header.astro`, loaded on
   every page since `Header` is universal) that: un-hides/reveals the button once it attaches its
   listener, computes the *current effective* theme (reads `dataset.theme` if set, else
   `matchMedia("(prefers-color-scheme: dark)")`), listens for a click, flips to the opposite
   theme, writes it to `localStorage` wrapped in `try`/`catch`, sets `dataset.theme` and
   `style.colorScheme`, and updates `aria-pressed`/icon. This and task 3's script are the
   **only** client-side JavaScript shipped anywhere on the site. File: `src/components/
   Header.astro` (edit). Tests: `tests/e2e/theme-toggle.spec.ts` (new, AC-3).
5. **Skip-link and active-link state (no mobile-menu toggle).** `BaseLayout.astro`: add a
   visually-hidden-until-`:focus` `<a class="skip-link" href="#main-content">Skip to
   content</a>` as the first focusable element in `<body>`, and `id="main-content"` on `<main>`.
   `Header.astro`: compare each nav item's `href` against `Astro.url.pathname`, adding
   `aria-current="page"` + an `.active` class to the matching link. The nav itself needs **no**
   collapsing mechanism: with 3 items, `flex-wrap` on the header's nav container lets the nav
   wrap onto its own line below the site name/logo at narrow widths — no `<details>`, no JS, no
   hidden/revealed state. Files: `src/components/BaseLayout.astro` (edit), `src/components/
   Header.astro` (edit), `src/styles/global.css` (edit — skip-link, active-link, header
   `flex-wrap` rules). Tests: `tests/e2e/responsive.spec.ts` (new, AC-4: no horizontal scroll at
   360/768/1280px; every nav link visible and clickable at 360px); `tests/e2e/layout.spec.ts`
   (extend: skip-link present on every page, `aria-current="page"` on the matching nav item per
   path).
6. **Footer: add GitHub link.** Extend `Footer.astro` to also look up
   `cvForBuild.basics.profiles` for `network === "GitHub"` (mirroring the existing LinkedIn
   lookup) and render it alongside email/LinkedIn/copyright. File: `src/components/Footer.astro`
   (edit). Tests: `tests/e2e/layout.spec.ts` (extend footer assertion with the GitHub href).
7. **Typography and vertical rhythm.** In `global.css`, tune the heading scale (h1–h3
   sizes/line-height/margins) and body measure via `--content-width`, converting today's
   `42rem` fixed width to `max-width: 68ch` (AstroPaper-style ~65–75-character reading measure,
   expressed in `ch` rather than a fixed px/rem value so it tracks the actual font), plus
   consistent spacing between headings/paragraphs/lists. File: `src/styles/global.css` (edit).
   No dedicated unit or e2e test — purely visual/markup, covered entirely by task 11's
   visual-regression baselines; no pixel-width e2e assertion is added.
8. **Component restyle: cards, chips, buttons, CV sections, focus ring.** Restyle
   `.project-badge`, `.project-tags`/`.tag-link`, `.project-link-button`, `.cv-download-button`,
   and `CvContent.astro`'s section markup purely via `global.css` token-based rules — no markup
   or `data-testid`/class-name changes, so existing e2e selectors keep working unmodified.
   Introduce one new `.button-secondary` class (border-only, no fill) for the project detail
   page's lower-priority link buttons. Assignment is **by link type, not DOM position**:
   priority order `live` > `docs` > `repo` — whichever present link is highest-priority gets
   `.project-link-button` (primary/filled); every other present link gets `.button-secondary`.
   Add a global `:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset:
   2px; }` rule plus component-level hover transitions. Files: `src/styles/global.css` (edit),
   `src/pages/projects/[slug].astro` (edit: compute primary link by the `live`>`docs`>`repo`
   priority order, apply `.button-secondary` to the rest). Tests: extend `tests/e2e/
   projects.spec.ts` to assert the highest-priority present link has `.project-link-button` and
   every other present link has `.button-secondary`, with a visibly different computed
   `background-color`/`border` pair, across at least one project missing `live` (so `docs`
   becomes primary) to prove it's type-based, not positional.
9. **Self-hosted mono font.** Add JetBrains Mono, weight 400, **latin + latin-ext subset**
   (kept consistent with the rest of the site's Lithuanian-character requirement) as a
   self-hosted webfont under `src/assets/fonts/` plus its licence file; add `@font-face` +
   `--font-mono` token in `tokens.css`; style `code`/`pre` with it in `global.css`. No current
   `content/projects/*.md` file uses inline code or code blocks, so this has no visible effect
   yet, but is added now so AC-10 ("no system or CDN font for *any* rendered text") holds
   immediately once any future content does use `code`/`pre`, rather than needing a follow-up
   spec. Not preloaded (task 10) — zero bytes requested on any page without `code`/`pre`.
   Files: `src/assets/fonts/jetbrains-mono-latin-400.woff2` (+ latin-ext variant) + licence
   (new), `src/styles/tokens.css` (edit), `src/styles/global.css` (edit).
10. **Font preloading and font-payload budget.** Add `<link rel="preload" as="font"
    type="font/woff2" crossorigin>` to `BaseLayout.astro`'s `<head>` for the Inter 400
    **latin and latin-ext** files only (the ones needed for first-paint body text — not the 600
    weight or the mono font, neither of which is above-the-fold on any page). Extend
    `tests/e2e/performance.spec.ts` with a per-page font-bytes-only sum asserted `< 150 * 1024`,
    and a check that every `<link rel="preload" as="font">` present is actually requested by the
    page (no dead/unused preloads) — the inverse of asserting every requested font is preloaded,
    since Inter 600 and the mono font are deliberately requested-but-not-preloaded (AC-5). Files:
    `src/components/BaseLayout.astro` (edit), `tests/e2e/performance.spec.ts` (edit).
11. **Visual regression suite + Docker-pinned execution.** Add `playwright.visual.config.ts`
    (`testDir: "tests/visual"`, disables animations, fixed viewport per project, snapshots
    committed under `tests/visual/pages.spec.ts-snapshots/`) and `tests/visual/pages.spec.ts`
    (AC-8: the page set from the table above, light + dark, at the main viewport, **plus `/`
    and `/cv` at 360px in light theme only**, each awaiting `document.fonts.ready` before
    `toHaveScreenshot()`, per AC-11). Add `Makefile` targets `visual` (runs `make build`,
    then the visual suite **inside** `docker run --rm --user $(id -u):$(id -g) --ipc=host
    -v "$$PWD:/work" -w /work mcr.microsoft.com/playwright:v<pinned-version>-<codename>
    npx playwright test --config=playwright.visual.config.ts`) and `visual-update` (same, with
    `--update-snapshots`, documented as the *only* supported way to regenerate baselines — never
    on a bare host, mirroring the existing `screenshots` target's "explicit opt-in, overwrites
    tracked files" convention). `--user $(id -u):$(id -g)` keeps generated/updated snapshot
    files owned by the host user, not root; `--ipc=host` is Playwright's documented requirement
    to avoid Chromium crashing under Docker's default shared-memory limits. Add a new CI job in
    `.github/workflows/ci.yml` using
    `jobs.<id>.container: image: mcr.microsoft.com/playwright:v<pinned-version>-<codename>`
    (GitHub Actions runs this natively, no self-hosted Docker daemon needed) that checks out,
    builds, and runs the same visual suite, failing the PR on any pixel diff. Add
    `tests/unit/playwright-docker-version.test.ts` (AC-11) asserting the `Makefile`'s and
    `ci.yml`'s referenced image tag's version segment matches the installed `@playwright/test`
    version exactly, so the two can never silently drift. See
    [ADR-0004](../adr/0004-visual-regression-docker.md). Files: `playwright.visual.config.ts`
    (new), `tests/visual/pages.spec.ts` + baseline PNGs (new, **generated only inside the pinned
    Docker image**, not by the implementer's local host), `Makefile` (edit), `.github/workflows/
    ci.yml` (edit), `tests/unit/playwright-docker-version.test.ts` (new).
12. **AstroPaper MIT notice + licence consolidation.** Add `THIRD_PARTY_NOTICES.md` at the repo
    root: an Inter OFL-1.1 notice (cross-referencing the existing `src/assets/fonts/OFL.txt`),
    the new mono font's licence, and an AstroPaper MIT notice explicitly scoping what was ported
    ("design-token structure/naming conventions and overall page-layout/component visual
    patterns — no source code or build tooling from that project"), with a link to
    `github.com/satnaing/astro-paper`. File: `THIRD_PARTY_NOTICES.md` (new). Test:
    `tests/unit/third-party-notices.test.ts` (new, AC-7).
13. **Contrast tuning pass.** With tokens finalised (tasks 1–10), re-run
    `tests/e2e/accessibility.spec.ts` against both themes on every AC-2-required path; pick the
    dark-theme accent's distinct lighter-tuned variant of `#1d4ed8` (per Decision 3 — light
    theme keeps `#1d4ed8` exactly, dark theme does not reuse it) and adjust
    `--color-bg-elevated`/`--color-focus-ring`/badge-and-chip colours in `tokens.css` until zero
    violations, same as the existing dark-accent tuning precedent from spec 001. File:
    `src/styles/tokens.css` (edit, values only).
14. **Update existing suites for the one intentional break (AC-9).** `tests/e2e/
    performance.spec.ts`: change "ships zero `<script>` elements" to "ships at most two inline
    `<script>` elements (the theme-init and theme-toggle scripts from tasks 3–4) and zero
    externally-sourced `<script src>` elements." No other existing e2e assertion is expected to
    need a selector change (nav/footer hrefs, axe scan paths, PDF/print assertions are all
    unaffected by this spec's styling-only changes) — confirm this during implementation and
    list any further changes explicitly in the PR description per AC-9. File:
    `tests/e2e/performance.spec.ts` (edit).
15. **Docs and changelog.** Update `docs/technical/index.md` (styling/fonts section: `tokens.
    css`, theme-toggle architecture and its two inline scripts, mono font, the new `tests/
    visual/` suite and its Docker-pinned execution, `make visual`/`visual-update` targets; plus
    a note in spec 004's section that if a CSP is ever added, the two inline scripts will need
    `sha256-` hashes or a nonce in `script-src`, since `unsafe-inline` would defeat the point)
    and
    `docs/user-guide/index.md` (how to toggle the theme; a note for contributors that updating
    visual baselines requires Docker and must use `make visual-update`, never a bare-host run).
    Regenerate `docs/user-guide/img/*.png` via the existing, unrelated `make screenshots` target
    once the new visuals are final (documentation screenshots, not test baselines — see
    Design decisions). Add a "spec 005" section to `docs/CHANGELOG.md`. (Doc-writer agent's job
    per project convention; listed here for completeness, not as this plan's own task.)
16. **Final pass.** `make lint`, `make test`, `make security`, `make docs`, `make e2e` all green
    locally; `make visual` green when run inside the pinned Docker image (requires Docker
    locally — see Open questions); confirm `npm audit --audit-level=high` stays clean (no new
    npm *dependency* is added — the mono font is a static asset like Inter already is, not an
    `@fontsource` package; Docker is an external tool invocation, not an npm dependency).

## Design decisions

All seven open questions from the original draft are resolved — see "Decisions" above. This
section keeps only the decisions that still need rationale beyond a one-line answer.

- **No Tailwind is added.** The spec text has been corrected at source (`docs/specs/
  005-visual-design.md` now says "plain CSS custom properties" instead of "Tailwind v4
  @theme") rather than left as a standing contradiction with `CLAUDE.md`'s "plain CSS (no
  Tailwind)."
- **Existing token names are kept, not renamed to AstroPaper's literal names**
  (`--color-fill`/`--color-text-base`/etc.). `tests/e2e/accessibility.spec.ts` already asserts
  against `--color-accent` by name; renaming everything would be a bigger, purely cosmetic diff
  for no behavioural benefit.
- **Manual override via `[data-theme]` attribute, not a `.dark`/`.light` class**, with CSS
  `color-scheme` set alongside it so native form controls/scrollbars follow too. Matches
  AstroPaper's own mechanism and keeps the CSS specificity story simple: `:root` (light
  defaults) → `@media (prefers-color-scheme: dark)` → `[data-theme="dark"]`/`[data-theme=
  "light"]` declared after it in source order, so a manual choice always beats the system
  preference without needing `!important` anywhere.
- **Two small inline scripts, each wrapping `localStorage` access in `try`/`catch`, are the
  only client-side JavaScript on the site** (theme-init in `<head>`, theme-toggle in `Header`).
  This is a deliberate, narrow exception to "zero client JS by default" (`CLAUDE.md`),
  justified because a flash-free, persisted manual override is fundamentally impossible with
  CSS alone. The nav, by contrast, needs no JS at all — it collapses via plain `flex-wrap`
  (Decision 7), so there is no mobile-menu exception to track.
- **Mono font is added pre-emptively** (task 9) even though no current content uses `code`/
  `pre`, so AC-10 holds immediately for any future project write-up that does include a code
  snippet, rather than requiring a follow-up spec. It is requested-but-not-preloaded, so it
  costs zero bytes on every page today.
- **`tests/screenshots/` (documentation screenshots) and `tests/visual/` (regression
  baselines) stay two separate suites with two separate purposes.** The former is opt-in,
  overwrites tracked PNGs used in `docs/user-guide/`, and is not a pass/fail test; the latter
  is a real pass/fail CI gate comparing against committed baselines, and — per AC-11 — must
  only ever run inside the pinned Playwright Docker image.
- **No new npm dependency.** The mono font is a hand-managed static `woff2` asset (same pattern
  as Inter today), not an `@fontsource` package; the Docker image is invoked via `docker run`
  from the `Makefile`/CI, not installed as a Node dependency.

## Risks

- **Docker as a new local/CI toolchain requirement (AC-11, accepted exception — Decision 2).**
  Every contributor who wants to run `make visual`/`make visual-update` locally now needs
  Docker installed, which `make setup` does not install today. Mitigated by making
  `visual`/`visual-update` explicitly separate from `make test`/`make e2e` (which stay
  Docker-free).
- **Cross-host font-rendering drift is exactly why AC-11 exists**, but it also means any future
  change to the pinned Playwright Docker image version (bumping `@playwright/test`) will likely
  regenerate every baseline wholesale, even for pages that didn't visually change — an accepted,
  known cost of this approach (see ADR-0004), not a bug.
- **Font-payload budget (AC-5, ≤150 KB) is new and additive to the existing <300 KB total-weight
  budget** — adding a mono font file (now latin **and** latin-ext, per Decision 5, so slightly
  larger than a latin-only subset) narrows the remaining headroom further. Mitigated by keeping
  it single-weight and not preloaded, and by task 16's explicit final-pass re-check; if the
  budget is tight, the mono font can be deferred (see task 9's rationale) without touching any
  other AC.
- **The skip-link/active-link changes to `Header.astro`/`BaseLayout.astro` touch the same files
  `tests/e2e/layout.spec.ts` already asserts against for every page in the site**, so a markup
  mistake here has wide blast radius. Mitigated by task 14's explicit "no other selector should
  need to change" check run early, not deferred to the final pass. Dropping the `<details>/
  <summary>` mechanism entirely (Decision 7) removes what would otherwise have been the
  riskiest single piece of this task.
- **AC-9's "zero `<script>` elements" assertion is a known, intentional break** (task 14) —
  risk is forgetting to call it out in the PR description, not the change itself.
- **`live`>`docs`>`repo` button-priority logic (Decision 4) must be computed per-project from
  whichever links are actually present**, not assumed — a project with only `docs` and `repo`
  makes `docs` primary, not `live`-shaped markup with a missing href. Task 8's test explicitly
  covers a project missing `live` to catch a hardcoded "first child" regression.

## Open questions

None outstanding — all seven original open questions are resolved; see "Decisions" above.
