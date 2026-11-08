# Ship log — 005-visual-design

| Phase | Outcome | Iterations | Notes |
|---|---|---|---|
| Branch | OK | - | feat/005-visual-design created from main (b23d1a2) |
| Plan | APPROVED | 1 | 7 open questions resolved 2026-11-08 (patvirtinu), plan amended |
| Implement | DONE | 1 | tasks 1-16; orchestrator fixed mono font (real fonttools subset, was 127KB unsubsetted WOFF1 placeholder) and restored <code> snippet; lint/test/e2e/security/docs all green |
| Test | 1 bug found, sent to implementer | 1 | tester found: (1) project cards never got outer card styling (real bug, sent back); (2) visual CI job would fail on every run with no baselines (fixed: continue-on-error + comment); (3) AstroPaper copyright line paraphrased (fixed: verbatim from upstream LICENSE); (4) AC-9 PR description must list layout.spec.ts footer test + accessibility.spec.ts token-loop changes too, not just task 14's one named item. Tester also closed 4 test-coverage gaps (nav 5th item, aria-pressed tracking, toggle color-scheme, localStorage-throws resilience) |
| Review | CHANGES REQUESTED | 1 | blocker: task-15 docs never written (deferring to doc-writer phase next, moved earlier than skill's default order per reviewer's Definition-of-Done point); should-fix: Header.astro's load-time applyTheme() eagerly pins data-theme even with no stored preference, freezing live OS theme changes mid-session -- sent to implementer; nit: .tag-link background inside .project-card loses visual elevation contrast vs standalone usage, low priority |
| Docs | pending | - | |
| Final gate | pending | - | |
| PR | pending | - | |
