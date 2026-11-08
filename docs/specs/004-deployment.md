# 004 – Hosting, staging and production deployment

Status: Draft  ·  Owner: Andrius  ·  Date: 2026-11-08

## Goal
Automatic deploy to staging.riauba.org on every merge to main and a manual, one-click production deploy to riauba.org.

## Acceptance criteria
- **AC-1** Given a merge to main, when CI is green, then deploy-staging.yml publishes dist/ to the staging host and the smoke test passes.
- **AC-2** Given the "deploy-production" workflow run with confirm=deploy, then dist/ is published to production and the smoke test passes.
- **AC-3** Given a Caddy config committed in infra/Caddyfile, then both hosts serve HTTPS, HSTS, a strict Content-Security-Policy, gzip/zstd compression and long cache headers for hashed assets.
- **AC-4** Given staging.riauba.org, then it sends `X-Robots-Tag: noindex` and is not indexed.
- **AC-5** Given docs/technical/runbook.md, then it explains first-time server setup, DNS records, deploy, rollback (redeploy previous commit) and how to rotate the deploy key.
- **AC-6** Given the production site, then /docs serves the MkDocs documentation build.

## Constraints
- Hetzner Cloud VPS (EU), Caddy, deploy user restricted to the web root via SSH key. DNS on Cloudflare.

## Open questions
- Hetzner VPS: shared with future Atsidėk production or a separate small instance?
- Staging on the same VPS (separate directory) or on the homelab via Cloudflare Tunnel?
