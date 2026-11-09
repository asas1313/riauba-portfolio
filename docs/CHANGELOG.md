# Changelog

## Unreleased

### Added (spec 004 — homelab hosting, staging and production deployment)

- Real hosting: both staging and production now run on Andrius' Proxmox homelab, served by Caddy
  behind the existing Cloudflare Tunnel (`vepryne-pve`), with TLS terminating at Cloudflare and no
  inbound port open on the portfolio LXC at all. Serves `riauba.org`/`staging.riauba.org` —
  switching from the temporary `portfolio.riaubyne.eu`/`portfolio-staging.riaubyne.eu` hostnames
  used during spec 004's initial rollout (the "Switch to riauba.org" checklist, now complete) was
  a configuration-only change, as documented — see
  [ADR-0005](adr/0005-homelab-self-hosted-runner-deployment.md) and the new
  [deployment runbook](technical/runbook.md).
- Follow-up fix: `infra/setup-lxc.sh` now resolves `PROD_HOSTS`/`STAGING_HOSTS` from two
  checked-in files, `infra/production.env`/`infra/staging.env`, validating and failing loudly
  before any install step if either is missing or incomplete, generating the systemd
  `EnvironmentFile`/drop-in itself, and validating the Caddyfile with `caddy validate` before
  ever installing or reloading it.
- Follow-up fix: `deploy-staging.yml`/`deploy-production.yml`'s `actions/upload-artifact@v4` step
  now passes `include-hidden-files: true` — without it, the action silently drops dotfiles, which
  was stripping `astro.config.mjs`'s `dist/.noindex` sentinel before the deploy job ever saw it,
  so `infra/Caddyfile`'s `@noindex` header never applied and `make smoke ENV=staging` failed its
  `X-Robots-Tag` check.
- Deploys run on a self-hosted GitHub Actions runner (`homelab-riauba`, unprivileged `deploy` OS
  user) that only ever connects outbound to GitHub — no SSH keys, no open inbound ports and no
  deploy secrets exist anywhere in this setup. The build itself always happens on a GitHub-hosted
  runner; the homelab runner only ever receives a finished `dist/` artifact.
- `deploy-staging.yml` deploys automatically on every push to `main`; `deploy-production.yml` is a
  manual `workflow_dispatch` requiring `confirm=deploy`, defaulting to the sha currently live on
  staging and refusing any ref that isn't an ancestor of `origin/main`; `deploy-rollback.yml` is a
  manual, no-rebuild rollback for either environment. All three are gated so only Andrius' own
  actions (`github.actor == github.repository_owner`) can ever reach the homelab runner.
- `infra/deploy.sh` writes immutable, SHA-named releases under
  `/srv/riauba/<env>/releases/<sha>/` (each a symlink into a sibling `.content/<sha>.<nonce>/`
  directory, built fully off to the side and swapped in with a single atomic `mv -T`, so even a
  redeploy of an already-current sha never exposes an empty or partially-written release to
  Caddy) and atomically repoints `current` at it the same way. An append-only `releases.log`
  drives both pruning (keep the 5 most-recently-logged releases, by log order, never directory
  mtime) and an unconditional orphan-GC sweep of `.content/` on every run, so a deploy killed
  between writing its content and swapping its symlink never leaks disk space. `infra/rollback.sh`
  repoints `current` with no rebuild, either to an explicit sha or — using a hybrid rule over
  `releases.log`'s three action types (`deploy`, `rollback-explicit`, `rollback-auto`) — to
  whichever release was actually live immediately before the current one, including after a
  deploy-on-top-of-a-rollback or a rollback-of-a-rollback.
- `SITE_URL` (required for `astro build`, defaulted locally by `make build`) and `NOINDEX`
  build-time variables (`src/lib/site-url.ts`, `src/lib/robots.ts`, `src/pages/robots.txt.ts`,
  `astro.config.mjs`'s `astro:build:done` hook) drive per-environment canonical/Open Graph URLs,
  `/robots.txt` and a `dist/.noindex` sentinel that `infra/Caddyfile` turns into an
  `X-Robots-Tag: noindex, nofollow` header on the currently deployed release — staging always
  noindexed, production indexable now that `PROD_NOINDEX` is `false` (the "Switch to riauba.org"
  checklist's last remaining step).
- `infra/Caddyfile` (shared by both environments, installed by the new idempotent
  `infra/setup-lxc.sh`) serves a strict Content-Security-Policy with `sha256` hashes for the two
  inline scripts shipped by spec 005 (never `unsafe-inline`), plus `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, immutable long-cache headers for hashed `_astro/*`
  assets, and a custom static 404 page.
- `make smoke ENV=<staging|production> [SHA=<sha>]` replaces the old rsync/SSH `make deploy`
  target (deleted — there is no local equivalent any more; deploying only ever happens via
  `infra/deploy.sh` on the homelab runner itself). It checks the key routes return 200, optionally
  compares `/version.txt` against `SHA`, and on staging additionally requires the noindex header.
  `make docs` gained a `SITE_DIR` override so the deploy workflows can build the MkDocs site
  straight into `dist/docs/`.
- Security hardening beyond the spec's own acceptance criteria: a main-branch ruleset requiring
  PR review from a code owner (`.github/CODEOWNERS`, `@asas1313`) and a passing `ci` check; a
  required human reviewer on the `production` GitHub Environment before any job targeting it runs;
  Actions settings preventing a workflow from ever approving its own PR; and script-injection-safe
  workflow inputs (`env:` + quoted shell variables, never a raw `${{ }}` interpolated into `run:`
  text) throughout the three deploy workflows. See the runbook's "Repository hardening" section
  for the full, one-time manual checklist.

### Added (spec 005 — visual design)

- A calm, professional, AstroPaper-inspired visual theme ported as a visual layer only (design
  tokens/layout patterns, no Tailwind, no source code from that project) — `src/styles/
  tokens.css` becomes the single source of every colour/radius/font token, enforced by a new
  `tests/unit/no-hardcoded-colors.test.ts` guard against stray colour literals elsewhere.
- Light/dark theme toggle (sun/moon button in the header), persisted via `localStorage`, with
  no flash of the wrong theme on reload and no freezing of a live OS theme change for a visitor
  who hasn't made an explicit choice — the only client-side JavaScript on the site, split across
  a `<head>` script (`BaseLayout.astro`) and a toggle-button script (`Header.astro`).
- Restyled components: project cards now render on an actual elevated card surface (not a bare
  list item), tag chips, primary/secondary link buttons (assigned by link type —
  `live` > `docs` > `repo` priority, not DOM position), CV page sections, and the CV download
  button, all restyled purely from the token file with no markup/test-id changes.
- Skip-to-content link, active-nav-link state (`aria-current="page"`), and a `flex-wrap`-based
  responsive nav needing no JavaScript or collapsing mechanism at any width. Footer gains a
  GitHub link alongside email/LinkedIn/copyright.
- Self-hosted JetBrains Mono (latin + latin-ext, weight 400) added for `code`/`pre`, alongside
  the existing self-hosted Inter; only the above-the-fold Inter 400 files are preloaded.
  `THIRD_PARTY_NOTICES.md` added at the repo root, crediting Inter, JetBrains Mono and
  AstroPaper's MIT-licensed design language.
- A new, Docker-pinned Playwright visual-regression suite (`tests/visual/`, `make visual`/
  `make visual-update`, a new CI job) distinct from the existing documentation-screenshot
  capture — see [ADR-0004](adr/0004-visual-regression-docker.md).
- **Known open item:** no baseline screenshots are committed yet for the new visual-regression
  suite — neither the implementing nor the testing session had local Docker access, which the
  suite requires. The CI `visual` job therefore currently runs with `continue-on-error: true`
  and is not yet a blocking gate; it becomes one once someone with local Docker access runs
  `make visual-update` and commits real baseline PNGs.

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
  at different times. The stripping itself runs as a plugin on Astro's native Sätteri Markdown
  processor (`createSatteriTodoParagraphPlugin`), wired up via a small inline Astro integration;
  the build warning is emitted independently, from an `astro:build:start` scan of
  `content/projects/*.md` on disk that reuses the same paragraph-matching logic, so it fires
  reliably on every build regardless of Astro's content-layer cache state. See ADR-0003 for the
  full design and its rationale.
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
- Need a merge into main to test actions
