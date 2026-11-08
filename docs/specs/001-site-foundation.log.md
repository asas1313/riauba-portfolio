# Ship log – 001-site-foundation

| Phase      | Outcome | Iterations | Notes                                                           |
| ---------- | ------- | ---------- | --------------------------------------------------------------- |
| Branch     | done    | -          | feat/001-site-foundation from main (08803a0)                    |
| Plan       | done    | 1          | plan.md + ADR-0001; 3 open Qs confirmed by Andrius with changes |
| Implement  | done    | 1          | 14 tasks, 13 commits; local test/lint/security/build/e2e green. Deviation: Astro 5→7 (unpatched audit advisories on 5.x/6.x), confirmed by Andrius; CLAUDE.md updated |
| Test       | done    | 1          | All AC-1..9 PASS w/ added edge-case tests (39 unit/29 e2e green). 3 minor findings (not regressions): canonical/OG protocol-relative path escape in seo.ts, no trailing-slash normalization, case/whitespace-sensitive "TODO" match in cv.ts/Footer.astro. Sent to implementer. |
| Review     | done    | 2          | Iter 1: CHANGES REQUESTED (2 SHOULD, 2 NIT) → fixed (d20fcc6). Iter 2: APPROVED, 1 trivial NIT (ADR status line) fixed directly by orchestrator (4540218). |
| Docs       | done    | 1          | technical/index.md, user-guide/index.md, CHANGELOG.md (4a68fda); make docs strict build verified green via venv |
| Final gate | done    | -          | test/lint/security/build/docs/e2e all green. Found+fixed: eslint didn't exclude generated site/ dir (7d22d73) |
| PR         | done    | -          | https://github.com/asas1313/riauba-portfolio/pull/2            |
