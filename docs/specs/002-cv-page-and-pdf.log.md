# Ship log – 002-cv-page-and-pdf

Branch: feat/002-cv-page-and-pdf

| Phase | Outcome | Iterations |
|---|---|---|
| Branch | created from main | - |
| Plan | approved with 9 amendments (schema-aware TODO stripping, unify home page, links-as-href-text, JSON-LD escaping, Lithuanian font proof, filename andrius-riauba-cv.pdf, hard 2-page ceiling, styled download button) | 1 |
| Implement | done, 12 tasks, 7 commits, TDD throughout; make test/e2e/lint/security all green locally; 5 deviations flagged (see commits) | 1 |
| Test | 1 real bug found (basics-required-field TODO crashes build), 5 deviations confirmed fine, tester closed 3 coverage gaps itself (education/languages fixtures, cv/print screenshots, regex boundary tests), 2 gaps flagged for implementer (vacuous home.spec.ts TODO test, stale filename in CLAUDE.md/docs); all suites green otherwise | 1 |
| Fix (tester bug) | done: `stripTodoFields` now throws a clear build-time error naming the exact field path instead of nulling `basics` (or a nested non-array object under it) when a required top-level `basics` field is TODO; fixed stale `andrius-r-cv.pdf` filename in CLAUDE.md and docs/technical/index.md; replaced the vacuous `home.spec.ts` "hides profiles marked TODO" test with assertions that hold regardless of real content/cv.yaml state; make test/lint green, targeted e2e suites green, make build confirmed (including a manual repro of the original crash, now a clear thrown error) | 1 |
| Re-test | independently re-verified by a fresh tester pass: diff matches claims, crash repro now a clear thrown error, no stale filenames remain, make test/lint/security/build/e2e all green (78 unit + 48 e2e). No bugs found. | 1 |
| Review 1 | CHANGES REQUESTED — code/logic fully approved, no bugs; all blockers are stale docs (docs/technical/index.md, docs/user-guide/index.md still describe /cv as unbuilt and document the superseded TODO-matching rule), plus 2 SHOULD items (missing user-guide CV section for already-captured screenshots, missing CHANGELOG entry) | 1 |
| Docs fix (review blockers) | done — docs/technical/index.md and docs/user-guide/index.md updated to describe shipped /cv, /cv/print, cv.publish.ts, structured-data.ts, real build-pdf.mjs; CHANGELOG entry added; make docs/lint/test green (commit 2b49450) | 1 |
| Review 2 | APPROVED — independently re-verified all 7 prior findings fixed (cross-checked doc claims against real cv.publish.ts regex/logic and build-pdf.mjs), make docs/lint clean, no stale spec-002 claims remain anywhere in docs/technical or docs/user-guide | 2 |
| Docs (doc-writer) | done — closed 2 gaps (TODO-stripping rationale, JSON-LD diagram completeness) in docs/technical/index.md; everything else already accurate; make docs clean (commit 4f7fb9c) | 1 |
| Final gate | done — make test (78/78), lint, security (exit 0, pre-existing moderate devDep advisories only), docs, and build all green, run fresh by orchestrator | - |
