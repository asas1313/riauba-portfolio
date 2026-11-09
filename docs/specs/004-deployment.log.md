# Ship log – 004-deployment

| Phase | Outcome | Iteration |
|---|---|---|
| Branch | `feat/004-deployment` created from up-to-date `main` (fast-forwarded 19 commits incl. merged spec 005) | - |
| Plan | drafted: `docs/specs/004-deployment.plan.md`, ADR-0005 (`docs/adr/0005-homelab-self-hosted-runner-deployment.md`). 6 open questions raised for Andrius. | 1 |
| Plan approval | Andrius replied "patvirtinu" 2026-11-09 with explicit answers to all 6 questions plus additional scope: deploy.sh/rollback.sh releases.log, resolve-ref ancestor check + confirm-gate on first job, Caddyfile hide .noindex, plus a new "Security hardening" block (actor gating on homelab jobs, environment: production required reviewers, CODEOWNERS, runbook "Repository hardening" section). Plan + spec AC-8 typo updated in place; status changed to Approved. | - |
