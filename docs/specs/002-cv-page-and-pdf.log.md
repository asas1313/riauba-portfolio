# Ship log – 002-cv-page-and-pdf

Branch: feat/002-cv-page-and-pdf

| Phase | Outcome | Iterations |
|---|---|---|
| Branch | created from main | - |
| Plan | approved with 9 amendments (schema-aware TODO stripping, unify home page, links-as-href-text, JSON-LD escaping, Lithuanian font proof, filename andrius-riauba-cv.pdf, hard 2-page ceiling, styled download button) | 1 |
| Implement | done, 12 tasks, 7 commits, TDD throughout; make test/e2e/lint/security all green locally; 5 deviations flagged (see commits) | 1 |
| Test | 1 real bug found (basics-required-field TODO crashes build), 5 deviations confirmed fine, tester closed 3 coverage gaps itself (education/languages fixtures, cv/print screenshots, regex boundary tests), 2 gaps flagged for implementer (vacuous home.spec.ts TODO test, stale filename in CLAUDE.md/docs); all suites green otherwise | 1 |
| Fix (tester bug) | done: `stripTodoFields` now throws a clear build-time error naming the exact field path instead of nulling `basics` (or a nested non-array object under it) when a required top-level `basics` field is TODO; fixed stale `andrius-r-cv.pdf` filename in CLAUDE.md and docs/technical/index.md; replaced the vacuous `home.spec.ts` "hides profiles marked TODO" test with assertions that hold regardless of real content/cv.yaml state; make test/lint green, targeted e2e suites green, make build confirmed (including a manual repro of the original crash, now a clear thrown error) | 1 |
