# 004 – Homelab hosting, staging and production deployment: implementation plan

Spec: [docs/specs/004-deployment.md](./004-deployment.md) · ADR (new, drafted alongside this
plan): [docs/adr/0005-homelab-self-hosted-runner-deployment.md](../adr/0005-homelab-self-hosted-runner-deployment.md)

Status: **Approved by Andrius (2026-11-09)**, with the decisions below resolving every open question
and adding new security-hardening scope. See "Resolved decisions" and "Security hardening" at the end
of this document.

## Summary

Spec 004 replaces the Hetzner-VPS/SSH/rsync deployment draft already partially encoded in this
repo (`Makefile`'s `deploy` target, `deploy-staging.yml`, `deploy-prod.yml`) with a homelab
design: a self-hosted GitHub Actions runner inside an unprivileged Proxmox LXC deploys
immutable, SHA-named release directories with an atomically-switched `current` symlink, for
both a staging and a production environment, both reachable today only via temporary
`*.riaubyne.eu` hostnames behind the existing Cloudflare Tunnel. Builds (including the
`SITE_URL`-driven absolute URLs and the embedded MkDocs `/docs/` site) stay on GitHub-hosted
runners; only the deploy/rollback steps touch the homelab, and need no secrets at all because
the runner's connection to GitHub is outbound-only. Three new shell scripts
(`infra/deploy.sh`, `infra/rollback.sh`, `infra/setup-lxc.sh`) and a shared `infra/Caddyfile`
are added, each with the smallest test coverage that is actually possible for its nature
(automated filesystem-behaviour tests for the first two; manual, runbook-driven verification
for the third, which provisions a real LXC). A new `docs/technical/runbook.md` walks Andrius
through every manual step, including the "switch to riauba.org later" checklist the spec's
third user story asks for.

## Acceptance criteria → tests

| AC | Criterion (short) | Tests |
| --- | --- | --- |
| AC-1 | `SITE_URL` build variable drives every absolute URL; build fails if missing | `tests/unit/site-url.test.ts` (new): a pure `resolveSiteUrl(env, command)` helper throws when `command === "build"` and `SITE_URL` is unset/empty, returns the trimmed value when set, and falls back to a documented local-dev default (`http://localhost:4321`) for every other Astro command (`dev`/`preview`/`check`/`sync`) so `astro dev`/`astro check` keep working without it. `tests/e2e/seo.spec.ts` (existing, unchanged) continues to assert `https://riauba.org` canonicals — proving the `Makefile`'s `SITE_URL` default (see Resolved decisions) doesn't change today's build output when no override is supplied. `tests/unit/seo.test.ts`/`tests/unit/structured-data.test.ts` (existing, unchanged) still cover the canonical/OG/JSON-LD builders themselves. |
| AC-2 | `deploy-staging.yml`: build (GitHub-hosted, staging `SITE_URL`) → artifact → deploy (self-hosted) → smoke | Workflow YAML is not unit-testable; covered by (a) `tests/unit/self-hosted-runner-isolation.test.ts`'s companion assertion that `deploy-staging.yml`'s *build* job's `runs-on` is `ubuntu-latest` while only its *deploy* job's `runs-on` includes `homelab-riauba`, and (b) first real run observed manually against the homelab once Andrius completes the runbook (no CI can exercise a real self-hosted runner before that). |
| AC-3 | `deploy-production.yml`: manual, `confirm=deploy`, optional `ref` defaulting to staging's live SHA | Same category as AC-2: static-structure check (`self-hosted-runner-isolation.test.ts`: build job on `ubuntu-latest`, resolve-ref/deploy jobs on `homelab-riauba`) plus manual first-run verification. The "default `ref`" logic (read `/srv/riauba/staging/DEPLOYED`) only exists on the real runner filesystem and cannot be unit-tested in this repo; documented as a manual runbook verification step instead. |
| AC-4 | `infra/deploy.sh <env> <sha> <dist-dir>`: copies to `releases/<sha>/`, atomically switches `current`, prunes to 5 newest, writes `DEPLOYED`, rejects bad `<env>` | `tests/unit/infra-deploy.test.ts` (new): spawns the real script (`node:child_process`) against a `fs.mkdtempSync` temp directory standing in for `/srv/riauba`, asserting: `current` resolves to `releases/<sha>/`'s contents; a second deploy switches `current` atomically (no window where it's missing) and keeps both releases; a 7th deploy leaves exactly 5 release directories, always keeping the one `current` points at even if it isn't among the 5 most recent by mtime; `DEPLOYED` contains the sha and a parseable UTC timestamp; `releases/<sha>/version.txt` exists and contains exactly the sha (AC-8's `/version.txt`); invoking with `env=preprod` (or any value other than `staging`/`production`) exits non-zero and writes nothing. |
| AC-5 | `infra/rollback.sh <env> [sha]` + `deploy-rollback.yml`: repoints `current` without rebuilding | `tests/unit/infra-rollback.test.ts` (new, same harness as AC-4): after 3 sequential `infra/deploy.sh` calls, `infra/rollback.sh <env>` (no `sha`) repoints `current` to the release deployed immediately before the currently-live one (not just "second newest by mtime" — see Resolved decisions for why log order, not mtime, decides this); `infra/rollback.sh <env> <olderSha>` repoints to that exact release and fails loudly (non-zero exit, `current` unchanged) if `<olderSha>` doesn't exist under `releases/`; either form rewrites `DEPLOYED` to the sha it rolled back to. Workflow structure (`deploy-rollback.yml`: `workflow_dispatch`, inputs `env`+optional `sha`, single job on `homelab-riauba`) is a manual review item, not unit-testable. |
| AC-6 | `infra/Caddyfile`: Host-based routing from `PROD_HOSTS`/`STAGING_HOSTS` env vars, strict CSP (no third-party origins), security headers, compression, immutable asset caching, short HTML caching, custom 404 | `tests/unit/csp-script-hashes.test.ts` (new): extracts the exact literal text of the two `<script is:inline>` blocks from `src/components/BaseLayout.astro` and `src/components/Header.astro` (spec 005), SHA-256/base64-hashes each, and asserts both resulting `'sha256-...'` tokens appear in `infra/Caddyfile`'s `Content-Security-Policy` header line — so the CSP can never silently drift out of sync with the two inline scripts it must allow (decided: sha256 hashes, not `unsafe-inline` — see Resolved decisions). No automated test can exercise Caddy itself (it never runs in CI/local dev, only on the homelab); hostnames-from-env-vars, compression, caching headers and the custom-404 handler are manual runbook verification items, cross-checked by `make smoke` (AC-8) once deployed. |
| AC-7 | Staging (and production while `PROD_NOINDEX=true`) send `X-Robots-Tag: noindex, nofollow` on every response; `robots.txt` disallows everything | `tests/unit/robots.test.ts` (new): `src/pages/robots.txt.ts`'s content-building function returns `Disallow: /` when its `noindex` flag is true, `Allow: /` when false. `tests/e2e/` cannot exercise the HTTP header (Caddy, not Astro, sets it — see Resolved decisions) or a real deployed `robots.txt`'s content for a *specific* environment, since `astro preview` always builds with whichever `SITE_URL`/`NOINDEX` the local `make build` used; manual `curl -I` against the real staging URL (documented in the runbook) is the only end-to-end proof, cross-checked by `make smoke ENV=staging` (AC-8). |
| AC-8 | `make smoke ENV=<env>`: `/`, `/cv`, `/projects`, the CV PDF, `/docs/` return 200; deployed SHA matches `/version.txt`; staging sends the noindex header | No Vitest/Playwright coverage (it's a `curl`-based Makefile target exercised against a real deployed URL, not a local build) — correctness is demonstrated by the manual first deploy in the runbook and by every subsequent `deploy-staging.yml`/`deploy-production.yml` run invoking it as a required step. The PDF filename typo in the original AC text was fixed in spec 004 (see Resolved decisions). |
| AC-9 | `/docs/` serves the MkDocs build, produced in the same build job | `tests/unit/mkdocs-site-dir.test.ts` (new): asserts `make docs SITE_DIR=dist/docs` is a supported invocation by checking the `Makefile`'s `docs` target expands a `SITE_DIR` variable (default `site`, preserving today's behaviour for the plain `make docs`/CI usage) into `mkdocs build`'s `--site-dir` flag. Manual verification: running `make build && make docs SITE_DIR=dist/docs` locally produces `dist/docs/index.html`. |
| AC-10 | `infra/setup-lxc.sh`: idempotent, creates `deploy` user + `/srv/riauba/{staging,production}`, installs Caddy + `infra/Caddyfile`, prints runner-registration commands | `bash -n infra/setup-lxc.sh` (syntax-only check, wired into `make lint` — see Resolved decisions) is the only automated coverage possible; the script provisions a real Debian LXC as root and cannot run in CI. Idempotency (safe to run twice) and the printed runner-registration commands are manual runbook verification items, to be confirmed by Andrius against the real LXC. |
| AC-11 | `docs/technical/runbook.md`: LXC creation → setup-lxc.sh → runner registration → Tunnel hostnames → GitHub Environment variables → first deploy → rollback → logs → "Switch to riauba.org" checklist | `make docs` (existing, `mkdocs build --strict`) fails the build if the new page isn't linked into `mkdocs.yml`'s nav or has a broken internal link — the only mechanical check available for a prose runbook; content completeness against the AC's checklist is a manual review item for the PR. |
| AC-12 | `ci`/`claude-review` never run on the self-hosted runner | `tests/unit/self-hosted-runner-isolation.test.ts` (new): parses every `.github/workflows/*.yml` file's job definitions and asserts `ci.yml` and `claude-review.yml` have zero jobs whose `runs-on` includes the `homelab-riauba` label (string or array form), while each deploy/rollback workflow has at least one job that does. |

## Tasks

1. **`SITE_URL` build variable.** Add `src/lib/site-url.ts` exporting `resolveSiteUrl(env, command)`
   (throws a descriptive error when `command === "build"` and `env.SITE_URL` is missing/empty;
   trims and returns it otherwise; falls back to `http://localhost:4321` for every other command).
   Rewire `astro.config.mjs`: remove the static top-level `site: "https://riauba.org"` line, add a
   second small inline integration (alongside the existing TODO-stripping one, same file, same
   `astro:config:setup({ command, updateConfig })` pattern already documented in this file's own
   header comment) that calls `updateConfig({ site: resolveSiteUrl(process.env, command) })`.
   `Makefile`'s `build` target gets a default so every *existing* `make build`/`make e2e`/CI `ci`
   and `visual` job keeps producing `https://riauba.org` output unchanged (no test-file edits
   needed — see Resolved decisions): `SITE_URL=$${SITE_URL-https://riauba.org} npm run build`.
   Deliberately **no colon** in the parameter expansion (`${VAR-default}`, not `${VAR:-default}`):
   a GitHub Environment variable that's configured but left empty must still reach
   `resolveSiteUrl` as an empty string and fail the build loudly, rather than silently falling
   back to `https://riauba.org` the way `:-` would.
   Files: `src/lib/site-url.ts` (new), `tests/unit/site-url.test.ts` (new), `astro.config.mjs`
   (edit), `Makefile` (edit, `build` target only).
2. **`NOINDEX` build flag + `robots.txt`.** Add `src/lib/robots.ts` exporting a pure
   `buildRobotsTxt(noindex: boolean): string` (returns `User-agent: *\nDisallow: /\n` or
   `.../Allow: /\n`), and `src/pages/robots.txt.ts` (an Astro static endpoint) that calls it with
   `import.meta.env.NOINDEX === "true"`. Also write a build-time sentinel file at `dist/.noindex`
   (empty file, present only when `NOINDEX=true`) that `infra/Caddyfile` (task 6) uses to decide
   the `X-Robots-Tag` header per release — see Resolved decisions for why the header itself can't be
   set from inside the static build. Files: `src/lib/robots.ts` (new), `src/pages/robots.txt.ts`
   (new), `astro.config.mjs` (edit: a tiny `astro:build:done` hook writing the sentinel file next
   to `robots.txt.ts`'s own output, or a small Node script invoked as part of `npm run build`).
   Tests: `tests/unit/robots.test.ts` (new, AC-7).
3. **`infra/deploy.sh`.** Bash script: validates `env` is `staging`|`production` (exits 2
   otherwise); copies `<dist-dir>` to `/srv/riauba/<env>/releases/<sha>/`; writes
   `releases/<sha>/version.txt` containing exactly `<sha>`; appends `<sha>  <ISO-8601 UTC
   timestamp>  deploy\n` to `/srv/riauba/<env>/releases.log` (append-only, never rewritten in
   place); atomically switches `current` (write a new symlink under a temp name, then `mv -T`
   over the old one — never a window with no `current` at all); prunes `releases/*` to the 5
   most-recently-*logged* entries (per `releases.log`, not directory mtime — see Resolved
   decisions), always preserving whichever release `current` points at even if it would
   otherwise be pruned; writes `/srv/riauba/<env>/DEPLOYED` as `<sha>  <ISO-8601 UTC
   timestamp>\n`. Files: `infra/deploy.sh` (new), `tests/unit/infra-deploy.test.ts` (new, AC-4;
   also asserts `releases.log` gets one append-only line per deploy and pruning/rollback order
   derive from it, not from `stat` timestamps).
4. **`infra/rollback.sh` + `deploy-rollback.yml`.** Bash script: with no `sha`, reads
   `/srv/riauba/<env>/releases.log` to find the entry immediately *before* the one `current`
   currently points at (log order, not directory mtime — correct after repeated rollbacks too,
   since each rollback also appends its own `rollback` line) and rolls back to that; with an
   explicit `sha`, repoints to that exact `releases/<sha>/` or fails loudly (non-zero, `current`
   untouched) if it doesn't exist in the log; either form appends `<sha>  <timestamp>  rollback\n`
   to `releases.log` and rewrites `DEPLOYED` to match. New workflow `deploy-rollback.yml`:
   `workflow_dispatch` with `env` (required) and `sha` (optional) inputs, single job with
   `environment: production` when `env == 'production'` (see Security hardening), gated by
   `if: github.actor == github.repository_owner`, on `runs-on: [self-hosted, homelab-riauba]`
   running `infra/rollback.sh`. Files: `infra/rollback.sh` (new), `.github/workflows/
   deploy-rollback.yml` (new), `tests/unit/infra-rollback.test.ts` (new, AC-5; also asserts
   rollback-after-rollback walks further back through `releases.log` rather than bouncing
   between the same two releases).
5. **`infra/Caddyfile`.** Global options block: `auto_https off` (TLS terminates at Cloudflare;
   Caddy only ever speaks plain HTTP inside the LAN — see Resolved decisions). Two site blocks
   whose **addresses are the env vars themselves**, substituted directly by Caddy
   (`{$PROD_HOSTS}` / `{$STAGING_HOSTS}`), not a `host` request matcher: Caddy's site-address
   list already accepts a comma-separated set of hostnames, which is exactly `PROD_HOSTS`'/
   `STAGING_HOSTS`' documented format (AC-6), so no comma→space transform is needed. Each block
   serves `/srv/riauba/<env>/current` via `file_server`, with: `file_server { hide .noindex }`
   (task 2's sentinel must never be served as a real response body — see Resolved decisions); a
   strict CSP (`default-src 'self'`; `script-src 'self' 'sha256-<head-script-hash>'
   'sha256-<toggle-script-hash>'` — computed once now, kept in sync by task 6's test; no
   third-party origins anywhere in the policy), `X-Content-Type-Options: nosniff`, a
   `Referrer-Policy`, a `Permissions-Policy`, zstd/gzip compression (`encode zstd gzip`),
   long-lived immutable caching for hashed asset paths (Astro's content-hashed `_astro/*` output)
   and short caching for `.html`, an `@noindex { file {http.vars.webroot}/.noindex }` matcher
   adding `X-Robots-Tag: noindex, nofollow` when task 2's sentinel file is present in the current
   release, and `handle_errors` serving the built `404.html` with a real 404 status. File:
   `infra/Caddyfile` (new).
6. **CSP/script-hash sync test + CSP enforcement test.** Set `build.inlineStylesheets: 'never'`
   in `astro.config.mjs` so Astro never inlines a `<style>` block's CSS into the HTML (which
   would need its own `style-src` hash/`unsafe-inline` and silently widen the CSP) — every
   stylesheet stays an external, content-hashed `_astro/*.css` file, matching the existing
   `script-src 'self'` posture. Add `tests/unit/csp-script-hashes.test.ts`: reads
   `src/components/BaseLayout.astro` and `src/components/Header.astro`, extracts each
   `<script is:inline>...</script>` block's exact inner text via regex, computes
   `sha256-<base64>` the same way a browser would for CSP matching, and asserts both tokens are
   present in `infra/Caddyfile`. Add `tests/e2e/csp.spec.ts` (new): runs against `astro preview`,
   intercepts every response via Playwright's `page.route`, re-applies `infra/Caddyfile`'s exact
   `Content-Security-Policy` header value (parsed out of the Caddyfile, not hand-copied, so it
   can't drift) onto the intercepted response, and asserts zero `page.on('console')` messages
   matching `/Content Security Policy|CSP/i` after loading `/`, `/cv`, `/projects` — the real
   mechanism a CSP-violation would surface in a browser. Files: `astro.config.mjs` (edit),
   `tests/unit/csp-script-hashes.test.ts` (new, AC-6), `tests/e2e/csp.spec.ts` (new, AC-6).
7. **`deploy-staging.yml` rewrite.** Two jobs: `build` (`ubuntu-latest`, `environment: staging`) —
   checkout, `make setup`, `SITE_URL=${{ vars.SITE_URL }} NOINDEX=true make build`, `make docs
   SITE_DIR=dist/docs`, upload `dist/` as an artifact; `deploy` (`runs-on: [self-hosted,
   homelab-riauba]`, `needs: build`, `if: github.actor == github.repository_owner` — see
   Security hardening) — download the artifact, `infra/deploy.sh staging ${{ github.sha }}`,
   then `make smoke ENV=staging`. Trigger stays `push: branches: [main]`. File: `.github/
   workflows/deploy-staging.yml` (rewrite).
8. **`deploy-production.yml` rewrite (renamed from `deploy-prod.yml`).** Three jobs, with the
   confirmation gate moved onto the *first* job so nothing — not even `resolve-ref` — runs on the
   homelab runner without it (see Security hardening): `resolve-ref` (`runs-on: [self-hosted,
   homelab-riauba]`, `if: github.event.inputs.confirm == 'deploy' && github.actor ==
   github.repository_owner`) — reads the `ref` input if given, else reads
   `/srv/riauba/staging/DEPLOYED` on the runner's own filesystem; either way, runs `git fetch
   origin main && git merge-base --is-ancestor <resolved-sha> origin/main` and fails the job
   (exit non-zero, no output set) if the resolved sha is not an ancestor of `origin/main` — a
   `ref` input can never deploy an arbitrary/unmerged commit; outputs the resolved, verified sha;
   `build` (`ubuntu-latest`, `environment: production`, `needs: resolve-ref`) — checkout at
   `needs.resolve-ref.outputs.sha`, `make setup`, `SITE_URL=${{ vars.SITE_URL }}
   NOINDEX=${{ vars.PROD_NOINDEX || 'true' }} make build`, `make docs SITE_DIR=dist/docs`, upload
   artifact (this job only runs at all because `needs: resolve-ref` and jobs don't run if a
   dependency is skipped); `deploy` (`runs-on: [self-hosted, homelab-riauba]`,
   `environment: production`, `needs: build`, `if: github.actor == github.repository_owner`) —
   download artifact, `infra/deploy.sh production ${{ needs.resolve-ref.outputs.sha }}`,
   `make smoke ENV=production`. Files: `.github/workflows/deploy-production.yml` (new, replacing
   `deploy-prod.yml`), `.github/workflows/deploy-prod.yml` (deleted). Also add a unit-testable
   assertion in task 9's workflow-structure test: every job in `deploy-production.yml` and
   `deploy-rollback.yml` whose `runs-on` includes `homelab-riauba` has an `if` containing
   `github.actor == github.repository_owner`.
9. **Self-hosted-runner isolation + actor-gating test.** Add `tests/unit/
   self-hosted-runner-isolation.test.ts`: parses every `.github/workflows/*.yml`, asserts
   `ci.yml`/`claude-review.yml` have no job whose `runs-on` includes `homelab-riauba`, that each
   deploy/rollback workflow has at least one job that does while its build job(s) stay on
   `ubuntu-latest`, and (Security hardening) that every job whose `runs-on` includes
   `homelab-riauba` across `deploy-staging.yml`/`deploy-production.yml`/`deploy-rollback.yml` has
   an `if` expression containing `github.actor == github.repository_owner`. File: `tests/unit/
   self-hosted-runner-isolation.test.ts` (new, AC-2/AC-3/AC-12 + Security hardening).
10. **`Makefile`'s `deploy`/`smoke` targets.** Remove the old rsync/SSH-based `deploy` target
    entirely (superseded by `infra/deploy.sh`, invoked directly by the workflow on the runner —
    there is no meaningful "local" `make deploy" against a homelab LXC). Rewrite `smoke`: given
    `ENV`, resolve the public URL (`STAGING_URL`/`PROD_URL` env vars, falling back to the
    `*.riaubyne.eu` temporary hostnames so the target works before any GH Environment variable
    naming is finalised), `curl -fsS` each of `/`, `/cv`, `/projects`, `/andrius-riauba-cv.pdf`
    (spec AC-8's text had a typo — fixed in spec 004, see Resolved decisions), `/docs/`; fetch
    `/version.txt` and compare it to `$SHA` (new required arg/env for
    the target) if provided; for `ENV=staging`, additionally assert the response carries
    `X-Robots-Tag: noindex, nofollow`. File: `Makefile` (edit).
11. **`infra/setup-lxc.sh`.** Idempotent bash script (checks `id deploy` / directory existence /
    `caddy version` before acting, each as a no-op when already satisfied): creates the
    unprivileged `deploy` system user, `/srv/riauba/{staging,production}/releases` owned by it,
    installs Caddy from its official apt repository, installs `infra/Caddyfile` to
    `/etc/caddy/Caddyfile` and reloads it, then prints the exact `./config.sh`/systemd-service
    commands to register this LXC as a GitHub Actions runner labelled `homelab-riauba`, running as
    the `deploy` user. File: `infra/setup-lxc.sh` (new). Add `bash -n infra/setup-lxc.sh &&
    bash -n infra/deploy.sh && bash -n infra/rollback.sh` as a new step in `make lint`
    (syntax-only, no new local toolchain requirement — see Resolved decisions). Separately, add a
    `shellcheck infra/*.sh` step to `.github/workflows/ci.yml`'s lint job — `ubuntu-latest` ships
    `shellcheck` preinstalled, so CI gets full linting without requiring Andrius or Claude to
    install anything locally.
12. **`docs/technical/runbook.md`.** New page covering, in order: creating the LXC in Proxmox
    (template, 1 vCPU/1 GB RAM/8 GB disk, unprivileged, firewall rules per the spec's
    non-functional requirements), running `infra/setup-lxc.sh`, registering the runner,
    adding the two Cloudflare Tunnel public hostnames (following the existing `vepryne-pve`
    routing pattern), setting the GitHub Environment variables (`SITE_URL`, `PROD_NOINDEX`) for
    both `staging` and `production` environments, the first manual deploy, rollback
    (`deploy-rollback.yml`), viewing logs (`journalctl -u caddy`, `journalctl -u
    actions.runner.*`), and the **"Switch to riauba.org" checklist** verbatim from the spec (add
    domain to Cloudflare, add tunnel hostnames, update `PROD_HOSTS`/`STAGING_HOSTS`/`SITE_URL`,
    set `PROD_NOINDEX=false`, redeploy, verify). File: `docs/technical/runbook.md` (new),
    `mkdocs.yml` (edit: add it to `nav`).
13. **Docs and changelog.** Update `docs/technical/index.md`'s spec-004 scope note (remove "not
    built on this branch", add `SITE_URL`/`NOINDEX` to the Configuration section, document
    `robots.txt.ts`, link to the new runbook) and add a "spec 004" section to
    `docs/CHANGELOG.md`. (Doc-writer agent's job per project convention, per spec 005's plan
    precedent — listed here for completeness, not as this plan's own task.)
14. **Final pass.** `make lint`, `make test`, `make security`, `make docs`, `make e2e` all green
    locally (unchanged `SITE_URL` default keeps every existing e2e/unit assertion passing — task
    1's explicit design goal); confirm `npm audit --audit-level=high` stays clean (no new npm
    dependency — everything new in this spec is a shell script, a Caddy config file or a tiny
    Astro endpoint). Manual-only verification (cannot run in this repo's CI): first real run of
    `deploy-staging.yml` and a manual `deploy-production.yml`/`deploy-rollback.yml` cycle against
    the actual homelab LXC, by Andrius, following `docs/technical/runbook.md`.

## Resolved decisions

Andrius approved the plan on 2026-11-09 ("patvirtinu") with the following decisions, resolving
every item that was previously listed under Open questions:

- **`Makefile`'s `build` target defaults `SITE_URL` to `https://riauba.org` only when the
  variable is truly unset**, using `${SITE_URL-https://riauba.org}` (no colon) rather than
  `${SITE_URL:-https://riauba.org}` — so every existing `make build`/`make e2e`/CI `ci`/`visual`
  invocation (where `SITE_URL` is genuinely unset) keeps producing exactly today's output with
  zero test-file changes, while the two deploy workflows explicitly export the real
  per-environment `SITE_URL` (a GitHub Environment *variable*) before calling `make build`. If
  that GitHub Environment variable exists but is left empty, the no-colon form passes the empty
  string straight through instead of substituting the default, and `resolveSiteUrl` throws —
  AC-1's "fails if missing" therefore covers "configured but empty," not just "never set."
- **AC-8's `/andrius-r-cv.pdf` was confirmed as a spec typo** and is fixed in `docs/specs/
  004-deployment.md` itself to `/andrius-riauba-cv.pdf`, matching the real generated filename
  used everywhere else in the repo. `make smoke` checks the real filename.
- **`X-Robots-Tag` is set by Caddy via a file-existence matcher, not by the Astro build directly**,
  because the build only ever produces static files with no server at request time — only Caddy
  (the one long-lived process) can set a response header. The build writes a `dist/.noindex`
  sentinel file whenever `NOINDEX=true` (staging: always; production: driven by `PROD_NOINDEX`),
  and `infra/Caddyfile`'s `@noindex { file {http.vars.webroot}/.noindex }` matcher adds the header
  only when that file is present in the *currently deployed* release — so the same, environment-
  agnostic Caddyfile logic serves both environments, and the "switch to riauba.org" checklist's
  "set `PROD_NOINDEX=false`, redeploy" step is sufficient on its own (no separate Caddy-level
  toggle to remember). `robots.txt`'s content is driven by the same `NOINDEX` build flag, so the
  file and the header can never disagree within one deployed release.
- **CSP uses `sha256-` hashes for the two spec-005 inline scripts, not `unsafe-inline`** (decided,
  not just the plan's preference), per the forward-looking note already left in `docs/technical/
  index.md` by spec 005 ("if a CSP is ever added... `unsafe-inline` would defeat the point"). A
  new unit test (task 6) keeps the two hashes in the Caddyfile honest against the actual script
  source, and a new e2e test (task 6) loads the real pages with the real CSP header applied and
  asserts no CSP-violation console message appears — so both "the hash is right" and "the
  browser actually accepts it" are covered. `astro.config.mjs` additionally sets
  `build.inlineStylesheets: 'never'` so no future `<style>` block silently needs its own
  `style-src` allowance.
- **`infra/deploy.sh`/`infra/rollback.sh` are tested with Vitest spawning the real bash scripts
  against a temp directory** (`node:child_process` + `fs.mkdtempSync`), not a new shell-testing
  framework (e.g. bats) — keeps every test in this repo on one tool, consistent with how
  `tests/unit/playwright-docker-version.test.ts`/`third-party-notices.test.ts` already read
  non-TypeScript project files directly.
- **The three `infra/*.sh` scripts get `bash -n` syntax checking in local `make lint` and full
  `shellcheck` in CI only** — `shellcheck` isn't installed by `make setup` today and this plan
  avoids adding a new local toolchain requirement for scripts nobody runs more than a handful of
  times ever (unlike spec 005's Docker requirement, which gates an everyday-ish `make visual`
  target), while CI (`ubuntu-latest`, which ships `shellcheck` preinstalled) still gets full
  linting on every push.
- **`PROD_HOSTS`/`STAGING_HOSTS` stay comma-separated (AC-6's literal wording) and are used
  directly as Caddy site-block addresses** (`{$PROD_HOSTS} { ... }`), not as a `host` request
  matcher — Caddy's site-address list already accepts a comma-separated set of hostnames, so no
  comma→space transform is needed and the spec's wording is implementable as-is. `infra/
  Caddyfile` also sets global `auto_https off`, since TLS terminates at Cloudflare and Caddy only
  ever serves plain HTTP on the LAN side of the tunnel; a new CI step runs `caddy validate`
  against the official `caddy:2` Docker image with representative test values for
  `PROD_HOSTS`/`STAGING_HOSTS`, so a Caddyfile syntax error is caught before merge even though
  Caddy itself never runs in this repo's tests.
- **Rollback and pruning order derive from an append-only `releases.log` per environment, never
  from directory `mtime`.** `infra/deploy.sh` appends one line per deploy, `infra/rollback.sh`
  appends one line per rollback; "previous release" means "the log entry immediately before the
  one `current` now points at," and pruning to 5 keeps the 5 most-recently-*logged* releases
  (always preserving `current`'s target). Log order survives a rollback-of-a-rollback correctly
  (walks further back through history instead of bouncing between the same two releases the way
  mtime comparison would, since every rollback also touches mtimes); mtime is explicitly never
  read by either script. The test suite (tasks 3–4) exercises this directly.
- **`infra/Caddyfile`'s `file_server` for both environments sets `hide .noindex`** so the
  build-time sentinel file (task 2) that drives the `X-Robots-Tag` header can never also be
  served as a literal response body at `/.noindex`.
- **`make deploy` (the old rsync/SSH target) is deleted outright, not deprecated-in-place.** It
  has no meaningful "local" equivalent once deploy only ever happens from `infra/deploy.sh` on the
  runner itself, and keeping a dead target around would be a standing invitation to run it against
  nothing.

## Risks

- **`caddy validate` in CI (task 5/Resolved decisions) exercises Caddyfile syntax with
  representative `PROD_HOSTS`/`STAGING_HOSTS` values, not the real homelab hostnames or TLS
  setup** — it catches syntax errors and matcher mistakes, not misconfigured Cloudflare Tunnel
  routing, which remains a manual runbook verification item (AC-11).
- **Nothing in this repo's CI can exercise a real self-hosted runner, `infra/setup-lxc.sh` against
  a real LXC, or Caddy itself** — by construction (no server access from Claude/CI). The test
  coverage table above is honest about this: several ACs (AC-2, AC-3 beyond its static-structure
  slice, AC-8, AC-10, AC-11's content completeness) can only be verified by Andrius manually,
  following the runbook, after merge. This is inherent to the spec's own "Claude must never
  deploy or access the server" constraint, not a gap in this plan.
- **The CSP hash approach (Resolved decisions) adds ongoing maintenance**: any future edit to either
  inline script's exact text requires recomputing its hash and updating `infra/Caddyfile` — the
  new test catches a forgotten update (it fails loudly) but doesn't do the recomputation
  automatically.
- **`resolve-ref`'s "SHA currently live on staging" (AC-3) depends on reading a file
  (`/srv/riauba/staging/DEPLOYED`) from the self-hosted runner's own filesystem inside a GitHub
  Actions job** — this only works because the deploy and resolve-ref jobs run on the *same*
  machine (the one `homelab-riauba`-labelled LXC); if Andrius ever adds a second self-hosted
  runner for redundancy, this logic would need revisiting (out of scope for this spec, noted for
  future awareness only).
- **Pruning to 5 releases while never deleting the one `current` points at** can transiently keep
  6 directories on disk right after a rollback to an old release followed by a new deploy — a
  deliberate, documented behaviour (correctness over strict count), not a bug; the test suite
  (task 3) asserts "never delete `current`'s target," not "always exactly 5."

## Open questions

None remaining — all six items raised in the first draft of this plan were resolved by Andrius'
2026-11-09 approval; see "Resolved decisions" above. The LXC ID / Cloudflare Tunnel hostname
fill-in-the-blank runbook style (the sixth, lower-priority item) was confirmed acceptable as-is.

## Security hardening (additional scope, beyond the spec's own ACs)

Andrius asked for the following, on top of AC-1 through AC-12, covering both the new deploy
workflows and the repository itself:

15. **Actor gating on every homelab-runner job.** Every job whose `runs-on` includes
    `homelab-riauba`, across `deploy-staging.yml`, `deploy-production.yml` and
    `deploy-rollback.yml`, gets `if: github.actor == github.repository_owner` — so only Andrius'
    own GitHub actions can ever cause a workflow run to execute on the homelab runner, regardless
    of who can trigger the workflow itself. Covered by task 9's extended
    `self-hosted-runner-isolation.test.ts`.
16. **`deploy-production.yml`'s and `deploy-rollback.yml`'s production-targeting jobs use
    `environment: production`**, which GitHub enforces required-reviewer approval for once
    Andrius configures that environment protection rule (manual GitHub setting, documented in the
    runbook's new "Repository hardening" section below — not something a workflow YAML file can
    express on its own).
17. **`.github/CODEOWNERS`** (new file): a single rule, `* @asas1313`, so every PR requires that
    review per branch-protection settings (see task 18).
18. **`docs/technical/runbook.md` gets a new "Repository hardening" section** (alongside task 12's
    deployment content) documenting, as manual one-time GitHub settings Andrius applies himself
    (none of this is expressible in a workflow file, and Claude/CI must never change repository
    settings):
    - A main-branch ruleset: PR required before merging, the `ci` status check required, no force
      push, administrators can bypass only for the PR-required rule (never for status checks or
      force-push protection), and 1 approval plus code-owner review required.
    - Actions settings: "Require approval for fork pull request workflows," default
      `GITHUB_TOKEN` permissions set to read-only, and "Actions cannot approve pull requests."
    - Environment protection: `production` requires reviewer `@asas1313`; both `staging` and
      `production` environments are limited to deployments from the `main` branch only.
    - Setting up `riauba-bot` as the machine user the self-hosted runner and CODEOWNERS review
      flow run as (scope, token/PAT handling if any, and why it's separate from Andrius' personal
      account).

Files: `.github/CODEOWNERS` (new, task 17), `docs/technical/runbook.md` (extended, task 18 —
folds into task 12's file), `.github/workflows/deploy-staging.yml`/`deploy-production.yml`/
`deploy-rollback.yml` (the `if: github.actor == ...` and `environment: production` additions are
folded into tasks 7/8/4 above, not a separate diff). No new AC number — this is hardening Andrius
asked for beyond the spec text, verified by task 9's test (actor gating) and by manual review of
the runbook content (environment protection, CODEOWNERS, ruleset, riauba-bot) in the Review phase.
