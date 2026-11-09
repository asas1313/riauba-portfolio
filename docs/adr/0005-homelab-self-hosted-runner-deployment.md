# ADR-0005: Homelab deployment via a self-hosted GitHub Actions runner, immutable SHA releases

Status: Proposed · Date: 2026-11-09

## Context

Spec 004 was originally drafted around a Hetzner VPS reached over SSH (`DEPLOY_SSH_KEY`,
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH` secrets; `rsync -az --delete` from a GitHub-hosted
runner) — that draft is already partially encoded in the repo today: `Makefile`'s `deploy`
target, and `.github/workflows/deploy-staging.yml` / `deploy-prod.yml`. Spec 004 has since been
rewritten (this branch) to host both staging and production on Andrius' Proxmox homelab instead,
with no Hetzner hosting at all (`CLAUDE.md`: "European/self-hosted first... avoid adding US cloud
services without asking" — a homelab is the strongest possible reading of that preference).

A homelab LXC with no inbound ports open (per the existing Cloudflare Tunnel pattern already used
for other homelab services) cannot be reached by a GitHub-hosted runner over SSH without either
opening a port, provisioning a VPN, or minting long-lived deploy credentials as repo secrets —
each a bigger operational/security surface than this low-traffic personal site warrants. GitHub
Actions' self-hosted runner, by contrast, is an outbound-only long-poll connection initiated *from*
the LXC to GitHub: no inbound port, no SSH key, no deploy secret of any kind.

## Decision

- **Build stays on GitHub-hosted runners** (`ubuntu-latest`); only the **deploy** step of each
  workflow runs on a dedicated self-hosted runner (`runs-on: [self-hosted, homelab-riauba]`)
  inside an unprivileged Debian LXC on the homelab. The runner is registered once by Andrius
  (`infra/setup-lxc.sh` + the runbook), never by Claude or any CI job.
- **Releases are immutable, SHA-named directories** (`/srv/riauba/<env>/releases/<sha>/`) with a
  `current` symlink switched atomically (`ln -s ... tmp && mv -T tmp current`, or equivalent) —
  the standard "atomic symlink switch" deployment pattern (same idea as Capistrano/kamal-style
  releases). Rollback is "repoint the symlink," not "rebuild and redeploy," so it is fast (<10s,
  per the spec's non-functional requirement) and cannot fail for the same reason the original
  deploy failed.
- **No secrets at all are needed for deploy.** The runner's outbound-only connection to GitHub
  removes the SSH-key/host/path secrets the old draft required; the only configuration is two
  GitHub Environment *variables* (`SITE_URL`, `PROD_NOINDEX`), which are not secrets and are
  safe to see in logs.
- **TLS terminates at Cloudflare** (existing `vepryne-pve` Tunnel); Caddy inside the LXC serves
  plain HTTP on the LAN side and only sets security headers/compression/caching — it is not
  responsible for certificates.
- This **supersedes the Hetzner-VPS/SSH/rsync draft** already partially present in the repo
  (`Makefile`'s `deploy` target, `deploy-staging.yml`, `deploy-prod.yml`) — those are rewritten,
  not kept as an alternate path.

## Alternatives considered

- **Keep the SSH/rsync approach, just point it at the homelab LXC instead of Hetzner.** Rejected:
  would require opening an inbound port through the Cloudflare Tunnel/Nginx Proxy Manager
  specifically for SSH (a bigger attack surface than any other homelab service currently exposes),
  plus a long-lived private key stored as a GitHub secret — exactly what spec 004's rewrite set
  out to avoid.
- **A VPN (e.g. Tailscale) between GitHub-hosted runners and the homelab.** Rejected: adds a new
  external dependency/account and a persistent network path into the LAN for every CI run, for no
  benefit over a self-hosted runner's outbound-only model, which GitHub already provides natively.
- **`rsync`/overwrite-in-place deployment (no release directories).** Rejected: no atomic switch,
  no instant rollback — a bad deploy would require a full rebuild-and-redeploy to fix, violating
  the spec's "rollback in under 10 seconds" requirement.

## Consequences

- Andrius must create the LXC, register the runner and configure the Cloudflare Tunnel hostnames
  manually (documented in `docs/technical/runbook.md`) — this cannot be automated from CI, by
  design (Claude/CI must never have server access, per `CLAUDE.md` and the spec's own framing).
- The self-hosted runner executing arbitrary workflow code is a real risk if it ever ran a job
  triggered by an external pull request; mitigated by (a) only wiring the `homelab-riauba` label
  into `push`-to-`main`/`workflow_dispatch` triggered jobs, never `pull_request`, and (b) the
  runbook instructing Andrius to enable "Require approval for fork pull request workflows" and to
  keep the LXC firewalled to outbound-internet-only / inbound-from-tunnel-only.
- Switching to `riauba.org` later is a configuration-only change (new Cloudflare Tunnel hostnames,
  `PROD_HOSTS`/`STAGING_HOSTS`/`SITE_URL` values, `PROD_NOINDEX=false`) — no code or architecture
  change, which was one of spec 004's explicit user stories.
