# ADR-0002: PDF generation approach for the downloadable CV

Status: Accepted · Date: 2026-11-08

## Context

Spec 002 (AC-4) requires `make build` to produce `dist/andrius-riauba-cv.pdf` by printing the
`/cv/print` route, with selectable text (not a rasterized image), using Playwright — the
same tool already used for the e2e suite. Spec 001 shipped a stub (`npm run build:pdf` →
`scripts/build-pdf-stub.mjs`, a no-op that exists only so `make build`'s two-step script
(`astro build && npm run build:pdf`) succeeds end to end before this spec lands.

Two sub-problems need solving:

1. **How does a plain Node build script render a page and print it to PDF?** `astro
   build` only produces static files in `dist/`; nothing serves them. Printing requires a
   running HTTP server plus a headless browser.
2. **How does `make build`'s e2e-adjacent test (AC-4) verify the PDF's content** (selectable
   text, page count) without a browser, since this check runs as a Playwright test file but
   doesn't need a page — it just needs to parse a binary PDF file already on disk.

## Decision

1. **Serve `dist/` by spawning the existing `npm run preview` script** (Astro's own static
   file server, already used by `playwright.config.ts`'s `webServer`) as a child process
   from `scripts/build-pdf.mjs`, on a dedicated port (`4323`) distinct from the e2e suite's
   port (`4321`) so the two never collide even if something runs them back to back.
   `build-pdf.mjs` polls the server with `fetch` until it responds (bounded timeout, fails
   the build loudly on timeout — see CLAUDE.md's "fail loudly" convention) and always kills
   the child process in a `finally` block before exiting, so a crash never leaves an
   orphaned process holding the port.
2. **Add `playwright-core` as an explicit devDependency**, pinned to the same version as
   the existing `@playwright/test`/`playwright` dependency, and use its `chromium` launcher
   directly in `scripts/build-pdf.mjs` (`chromium.launch()` → `page.goto()` →
   `page.pdf({ path: "dist/andrius-riauba-cv.pdf", format: "A4", printBackground: true })`).
   `playwright-core` is already present in `node_modules` today as a *transitive*
   dependency of `@playwright/test`; promoting it to an explicit, version-pinned
   devDependency means `scripts/build-pdf.mjs` reuses the exact same Chromium binary that
   `make setup`'s `npx playwright install --with-deps chromium` already downloaded for the
   e2e suite, instead of depending on an unstated transitive detail or triggering a second,
   possibly differently-versioned browser download.
3. **Add `pdf-parse` as a test-only devDependency** for `tests/e2e/cv-pdf.spec.ts`, which
   reads `dist/andrius-riauba-cv.pdf` from disk with `node:fs` and extracts `.text` / `.numpages`
   to assert AC-4 (selectable text including `basics.name`) and the page-count half of AC-3
   (max 2 pages). It is never imported by production/build code, only by this one test
   file.

## Alternatives considered

- **Hand-roll a minimal static file server** (`node:http` + manual MIME-type mapping)
  instead of spawning `npm run preview`. Rejected: Astro's own preview server already
  correctly handles directory-style routing, the special-cased `404.html`, and every asset
  type the site serves; reimplementing that is pure risk for no benefit, and the "fail
  loudly" readiness-polling logic is needed either way.
- **Use `@playwright/test`'s test-runner fixtures** (a `test()` block with a `page` fixture)
  to drive the PDF print, instead of a plain Node script. Rejected: `build:pdf` must run as
  part of `make build`, before `make test`/`make e2e` exist as a concept here — wrapping
  build-time PDF generation inside the test runner would conflate "build step" and "test
  step" and make `make build` depend on the Playwright test harness rather than just the
  `playwright-core` library.
- **Add the full `playwright` package instead of `playwright-core`.** Rejected: `playwright`
  additionally bundles its own browser-management CLI and installs its own copy of the
  browsers on `npm install` unless suppressed; `playwright-core` has no browsers of its own
  and is the documented low-level building block for consumers (like `@playwright/test`
  itself) that manage browser binaries separately — which `make setup` already does.
- **Render the PDF from a rasterized screenshot** (e.g. `page.screenshot()` composited into
  a PDF). Rejected outright: AC-4 explicitly requires selectable text.

## Consequences

- `scripts/build-pdf.mjs` owns a small amount of process-lifecycle code (spawn, poll,
  teardown) that has no test of its own beyond the end-to-end proof that `make build`
  succeeds and `dist/andrius-riauba-cv.pdf` passes `tests/e2e/cv-pdf.spec.ts`. A bug in the
  teardown path would only surface as a hung `make build` or a leaked process, not a clean
  test failure — flagged under the plan's Risks.
- Two different Playwright-family packages now exist in the dependency tree with version
  alignment as a manual invariant (`playwright-core`'s pinned version must track
  `@playwright/test`'s). A future dependency bump must update both together.
- `make setup`'s existing `npx playwright install --with-deps chromium` step remains the
  single source of the actual browser binary; this ADR does not add a second browser
  install step.
