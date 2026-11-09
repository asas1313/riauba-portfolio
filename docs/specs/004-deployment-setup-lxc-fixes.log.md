# Ship log – 004-deployment-setup-lxc-fixes

Follow-up to spec 004 (PR #6, merged). Andrius ran `infra/setup-lxc.sh` against the real homelab
LXC and hit an unclear error at Caddy reload time caused by `PROD_HOSTS`/`STAGING_HOSTS` not being
set in Caddy's own process environment. He added an "## Added requirements" section to
`docs/specs/004-deployment.md` (now in this branch) asking for: pre-install validation of required
env vars, `caddy validate` run with those vars actually exported before reload, and the script
generating a documented `EnvironmentFile`/systemd drop-in instead of manual setup.

| Phase | Outcome | Iteration |
|---|---|---|
| Branch | `feat/004-deployment-setup-lxc-fixes` created from up-to-date `main` (fast-forwarded 29 commits incl. merged spec 004 PR #6); spec addendum committed (`1cee996`) | - |
| Plan | drafted: `docs/specs/004-deployment-setup-lxc-fixes.plan.md`. 7 open questions raised for Andrius. | 1 |
| Plan approval | Andrius said "tesk toliau" (proceed), then interrupted to give explicit answers for questions 1-4 (two checked-in per-environment files, `infra/production.env`=`PROD_HOSTS=riauba.org` and `infra/staging.env`=`STAGING_HOSTS=staging.riauba.org` — the spec's final "Later" hostnames, not the temporary riaubyne.eu ones) and asked the orchestrator to decide 5-7. Plan updated in place with "Resolved decisions"; status changed to Approved. | - |
