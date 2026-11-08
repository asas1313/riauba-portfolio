# 005 — Visual design (professional theme)

Status: Draft

## Goal
Replace the current ad-hoc styling with a calm, formal, professional look
based on the AstroPaper design language (github.com/satnaing/astro-paper, MIT).
Port the visual layer only — do NOT migrate onto the AstroPaper codebase.
Keep all existing routes, content collections, data logic and tests.

## Scope
- Design tokens as CSS variables (plain CSS custom properties): background, foreground,
  muted, border, one accent colour (deep blue/teal family), light + dark sets.
- Dark mode: follows prefers-color-scheme, plus a manual toggle persisted in
  localStorage; no flash of wrong theme (inline script in <head>).
- Typography: self-hosted sans font via @fontsource with latin-ext subset
  (Lithuanian characters), e.g. Inter or IBM Plex Sans; mono font for code.
  No Google Fonts CDN. Readable measure (~65–75ch), clear heading scale.
- Layout: centered max-width container, consistent vertical rhythm.
- Header: name/logo left, nav (Projects, CV, How this site was built) right,
  theme toggle, mobile menu; active link state; skip-to-content link.
- Footer: GitHub, LinkedIn, email, copyright.
- Components restyled: project cards (title, summary, tags, status badge),
  tag chips, link buttons (primary/secondary), CV page sections, download button.
- Subtle hover/focus states; visible focus ring everywhere.

## Out of scope
- /cv/print and the generated PDF: layout must stay unchanged
  (existing cv-pdf tests must pass, ≤2 pages).
- New content, new routes, animations beyond simple transitions.

## Acceptance criteria
1. All pages use the shared tokens; no hard-coded colours outside the token file.
2. WCAG 2.2 AA contrast in both themes (automated axe check in e2e for
   /, /cv, /projects, one project page, one tag page) — zero violations.
3. Theme toggle works, persists, and there is no theme flash on reload.
4. Responsive at 360px, 768px, 1280px: no horizontal scroll, nav usable on mobile.
5. Lighthouse (or existing performance.spec.ts budgets) does not regress;
   fonts preloaded, total font payload ≤ 150 kB.
6. Lithuanian characters render in the chosen font (e2e checks "Registrų Centras").
7. AstroPaper MIT notice included in THIRD_PARTY_NOTICES (or equivalent) for
   any ported styles.
8. Playwright screenshot baselines added for key pages in both themes.
9. All existing tests pass unchanged except selectors that strictly need updating
   (list them in the PR description).
   10. Fonts are bundled in the repo (src/assets/fonts or pinned @fontsource);
    no system or CDN font is used for any rendered text.
11. Screenshot tests run inside the official Playwright Docker image pinned to
    the same version as @playwright/test, both locally (make target) and in CI;
    baselines are generated only in that image. Tests await document.fonts.ready
    before capturing.
    