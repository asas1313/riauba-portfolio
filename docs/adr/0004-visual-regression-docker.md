# ADR-0004: Visual regression testing inside the official Playwright Docker image

Status: Accepted · Date: 2026-11-08

## Context

Spec 005 (AC-8) asks for Playwright screenshot baselines of key pages in both light and dark
themes, checked into the repository and compared on every run — a true visual-regression gate,
distinct from the project's existing `tests/screenshots/` suite (which only *captures*
illustrative PNGs for `docs/user-guide/`, is opt-in via `make screenshots`, and asserts nothing
about pixel content).

Playwright's `toHaveScreenshot()` renders the same page deterministically given the same
browser *binary* and the same host font-rendering stack, but font anti-aliasing, subpixel
hinting and even default font substitution differ across operating systems (and sometimes
across Linux distributions/driver versions) in ways that produce spurious pixel diffs having
nothing to do with an actual visual regression. This is a well-known Playwright limitation, not
specific to this project.

Spec 005's AC-11 anticipates this directly: it requires the visual suite to run inside the
*official* Playwright Docker image, pinned to the exact same version as the `@playwright/test`
npm dependency, both locally (via a `make` target) and in CI — so every baseline comparison
happens inside one controlled, reproducible rendering environment, never on a contributor's own
host OS.

## Decision

- Baselines are generated and compared **only** inside
  `mcr.microsoft.com/playwright:v<X.Y.Z>-<ubuntu-codename>`, where `<X.Y.Z>` is kept identical
  to the installed `@playwright/test`/`playwright-core` version (today `1.65.0`; this project
  already has precedent for pinning `playwright-core` to `@playwright/test`'s exact version for
  a different reason — PDF generation, ADR-0002 — so the same discipline extends naturally
  here).
- A new, dedicated Playwright config (`playwright.visual.config.ts`) and test directory
  (`tests/visual/`) are added, kept separate from `playwright.config.ts` (functional e2e,
  `tests/e2e/`) and `playwright.screenshots.config.ts` (documentation screenshots,
  `tests/screenshots/`) — three configs, three distinct purposes, no overlap.
- Two new `Makefile` targets, `visual` (asserts against committed baselines, used by CI) and
  `visual-update` (regenerates baselines with `--update-snapshots`), both wrap the test run in
  `docker run` against the pinned image. `visual-update` is the *only* supported way to change
  a baseline PNG — a bare-host run would silently commit host-specific rendering artefacts.
  (Mirrors the existing `make screenshots` target's "opt-in, overwrites tracked files"
  convention, for the same underlying reason: these commands overwrite checked-in binary files
  and must never be an implicit side effect of a routine `make test`/`make e2e` run.)
- A new CI job uses GitHub Actions' native `jobs.<id>.container:` key to run entirely inside the
  same pinned image — no self-hosted Docker daemon or `docker run` wrapper is needed in CI
  itself, only in the local `make visual*` targets.
- A small unit test (`tests/unit/playwright-docker-version.test.ts`) cross-checks that the
  version segment of the image tag referenced by the `Makefile` and by `ci.yml` always matches
  the installed `@playwright/test` version exactly, so the two can never silently drift apart
  (the same class of risk ADR-0002 already calls out for `playwright-core`).

## Alternatives considered

- **Run the visual suite on the bare CI runner (`ubuntu-latest`), as `tests/e2e/` already
  does.** Rejected: this is exactly the setup AC-11 is written to avoid — GitHub's `ubuntu-
  latest` image's installed font stack and Playwright's own browser-install step are not
  guaranteed to byte-for-byte match what a contributor's local machine renders, so baselines
  generated locally and checked by CI (or vice versa) would be flaky by construction.
- **Skip visual regression entirely and rely only on the existing axe/functional e2e suite.**
  Rejected: none of the existing suites can catch a purely visual regression (e.g. a token
  value accidentally reverted, a card losing its border) — which is the explicit point of
  AC-8/AC-11.
- **Use a hosted visual-testing SaaS (e.g. Percy, Chromatic).** Rejected without even raising it
  as an option worth deeper exploration: a new paid, US-hosted third-party service is a bigger
  commitment than this spec asks for, conflicts with `CLAUDE.md`'s "avoid adding US cloud
  services without asking," and AC-11 already specifies a concrete, free, self-contained
  mechanism (the official Docker image) that fully satisfies the requirement without one.

## Consequences

- Contributors who want to run `make visual`/`make visual-update` locally need Docker installed
  — a new local toolchain requirement this project did not previously have (flagged as an open
  question in the spec 005 plan, not decided unilaterally here).
- Bumping `@playwright/test`'s version in the future will very likely require regenerating
  every baseline wholesale (even for visually-unchanged pages), since the pinned Docker image
  tag must move in lockstep — an accepted, recurring maintenance cost of this approach.
- The image is pulled from `mcr.microsoft.com` (Microsoft's container registry), a US-hosted
  source; this is an accepted exception to `CLAUDE.md`'s general "avoid adding US cloud
  services without asking" preference (spec 005 plan, Decision 2), since AC-11 leaves no
  realistic non-US-hosted alternative that is still "the official Playwright Docker image."
- `make test`/`make e2e`/CI's main job stay exactly as fast and Docker-free as they are today;
  only the new, separate `visual` target/job pays the Docker-pull and container-overhead cost.
