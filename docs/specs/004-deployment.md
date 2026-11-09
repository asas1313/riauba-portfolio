# 004 – Homelab hosting, staging and production deployment

Status: Final  ·  Owner: Andrius  ·  Date: 2026-11-09

## Goal
Host both staging and production of the site on Andrius' Proxmox homelab: automatic deploy to staging on
every merge to main, and a manual, one-click production deploy with instant rollback. The site must work
before riauba.org DNS exists, and switching to riauba.org later must be a configuration change only.

## Context
- Homelab: Proxmox VE 9 on a mini PC (Intel N95, 16 GB RAM). Public access to homelab services goes through
  the existing Cloudflare Tunnel (`vepryne-pve`) on the riaubyne.eu domain; Nginx Proxy Manager runs on LXC 100.
- A dedicated unprivileged LXC is created for the portfolio (referred to below as the **portfolio LXC**;
  ID chosen by Andrius, e.g. 105).
- riauba.org is registered but not yet pointed anywhere. Until it is, temporary hostnames on riaubyne.eu are used.
- Nothing is hosted on Hetzner for now.
- Claude must never deploy or access the server; only CI does (see claude-factory rules).
- **This spec explicitly authorises changes to `.github/workflows/`, the Makefile `deploy`/`smoke` targets and a new `infra/` folder.**

## Hostnames

| Environment | Now (temporary) | Later |
|---|---|---|
| Production | `portfolio.riaubyne.eu` | `riauba.org` (+ `www.riauba.org` → redirect) |
| Staging | `portfolio-staging.riaubyne.eu` | `staging.riauba.org` |

Flat (single-level) temporary subdomains are used so Cloudflare's free Universal SSL certificate covers them.

## Architecture

```
GitHub-hosted runner                         Homelab (portfolio LXC, no inbound ports)
┌───────────────────────┐   artifact   ┌──────────────────────────────────────────────┐
│ make setup/test/build │ ───────────► │ self-hosted GitHub runner (user: deploy)      │
│ SITE_URL per env      │              │   infra/deploy.sh → /srv/riauba/<env>/        │
└───────────────────────┘              │       releases/<sha>/   current → symlink     │
                                       │ Caddy :80  Host-based → <env>/current          │
                                       └──────────────────────────────────────────────┘
                                                     ▲
                    Cloudflare (TLS) ── Cloudflare Tunnel vepryne-pve ── (same route pattern as other homelab services)
```

- **Build** happens on GitHub-hosted runners (Playwright/Chromium never installed on the homelab).
- **Deploy** jobs run on a self-hosted runner inside the portfolio LXC with label `homelab-riauba`. The runner
  connects outbound to GitHub, so no SSH keys, open ports or deploy secrets are needed.
- **Releases** are immutable directories named by commit SHA; `current` is a symlink switched atomically.
  The last 5 releases per environment are kept; rollback = repoint the symlink.
- **TLS** terminates at Cloudflare; Caddy serves plain HTTP inside the LAN and sets security headers.

## User stories
- As Andrius, I want every merge to main to appear on staging automatically, so that I can check it on my phone.
- As Andrius, I want to promote to production with one click and roll back in seconds, so that a bad release is never a problem.
- As Andrius, I want to switch to riauba.org later without code changes.

## Acceptance criteria
- **AC-1** Given a site URL, when building, then all absolute URLs (canonical, Open Graph, sitemap, JSON-LD) use the
  `SITE_URL` build variable; it is set per GitHub Environment (`staging`, `production`) as an Environment
  variable, and the build fails if it is missing.
- **AC-2** Given a push to main with green CI, when `deploy-staging.yml` runs, then a GitHub-hosted job builds with the
  staging `SITE_URL` and uploads `dist/` as an artifact, and a job on `runs-on: [self-hosted, homelab-riauba]`
  deploys it with `infra/deploy.sh staging <sha>`, then the smoke test passes.
- **AC-3** Given `deploy-production.yml` run manually with input `confirm=deploy` and optional `ref`
  (default: the SHA currently live on staging, read from the runner), then the site is built from exactly that
  commit with the production `SITE_URL`, deployed with `infra/deploy.sh production <sha>`, and the smoke test passes.
- **AC-4** Given `infra/deploy.sh <env> <sha> <dist-dir>`, then it copies the build to
  `/srv/riauba/<env>/releases/<sha>/`, atomically switches `/srv/riauba/<env>/current`, keeps the 5 newest releases,
  and writes `/srv/riauba/<env>/DEPLOYED` (sha, UTC timestamp). It refuses any env other than `staging|production`.
  Behaviour is covered by automated tests that run the script against a temporary directory.
- **AC-5** Given `infra/rollback.sh <env> [sha]` and a `deploy-rollback.yml` workflow (manual, inputs env + optional sha),
  then `current` is pointed to the given or the previous release without rebuilding. Covered by the same test suite.
- **AC-6** Given `infra/Caddyfile`, then Caddy serves each environment by Host header from its `current` directory, with
  hostnames taken from environment variables (`PROD_HOSTS`, `STAGING_HOSTS`, comma-separated) so riauba.org can be
  added without editing the file; it sets a strict Content-Security-Policy (no third-party origins),
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, compression (zstd/gzip), long-lived immutable
  caching for hashed assets, short caching for HTML, and serves the custom 404 page.
- **AC-7** Given the staging hostname, then every response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt`
  disallows everything. Production gets the same while `PROD_NOINDEX=true` (default until riauba.org is live).
- **AC-8** Given `make smoke ENV=<env>`, then it checks over the public URL that `/`, `/cv`, `/projects`,
  `/andrius-r-cv.pdf` and `/docs/` return 200, that the deployed SHA matches the one just deployed
  (exposed at `/version.txt`), and that staging returns the noindex header.
- **AC-9** Given the production site, then `/docs/` serves the MkDocs build, produced in the same build job.
- **AC-10** Given `infra/setup-lxc.sh` (run manually by Andrius as root inside a fresh Debian LXC), then it creates the
  unprivileged `deploy` user, `/srv/riauba/{staging,production}` owned by it, installs Caddy with `infra/Caddyfile`,
  and prints the exact commands to register the GitHub runner as a systemd service running as `deploy`.
  It is idempotent (safe to run twice).
- **AC-11** Given `docs/technical/runbook.md`, then it explains, step by step: creating the LXC in Proxmox
  (template, resources, unprivileged, firewall), running setup-lxc.sh, registering the runner, adding the two
  Cloudflare Tunnel public hostnames following the existing homelab routing pattern, setting GitHub Environment
  variables, first deploy, rollback, viewing logs (`journalctl` for Caddy and the runner), and a
  **"Switch to riauba.org" checklist** (add domain to Cloudflare, add tunnel hostnames, update `PROD_HOSTS`,
  `STAGING_HOSTS`, `SITE_URL`, set `PROD_NOINDEX=false`, redeploy, verify).
- **AC-12** Given the existing `claude-review` and `ci` workflows, then neither ever runs on the self-hosted runner.

## Non-goals
- Hetzner or any cloud hosting. Uptime monitoring and analytics. Backups of releases (they are reproducible from git).

## Non-functional requirements
- Security: the self-hosted runner only executes jobs triggered by `push` to main or `workflow_dispatch` in this
  repository, never by pull requests; the runbook includes enabling "Require approval for fork pull request
  workflows" and keeping the runner in an unprivileged LXC with Proxmox firewall rules that block access to
  other LAN hosts (outbound internet only, inbound only from the tunnel/proxy).
- Resources: portfolio LXC fits in 1 vCPU, 1 GB RAM, 8 GB disk.
- A deploy (artifact download + switch) completes in under 1 minute; a rollback in under 10 seconds.

## Constraints
- Debian LXC on Proxmox VE 9, Caddy from the official Debian repository or Caddy's apt repo, GitHub Actions runner.
- No secrets required for deploy. GitHub Environment variables: `SITE_URL` (also used by the smoke test), `PROD_NOINDEX`.

## Open questions
- None. (Andrius creates the LXC, the Cloudflare Tunnel hostnames and registers the runner manually by following the runbook.)
