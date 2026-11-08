---
title: "Spec-to-deploy AI delivery pipeline"
tagline: "Claude Code agents that plan, build, test, review and document software"
status: "active"
order: 2
featured: true
links: { live: null, docs: null, repo: null }
stack: ["Claude Code", "Subagents", "Hooks", "GitHub Actions", "Make"]
---
A reusable project template where a written specification goes in and a reviewed pull request comes out.
Specialised agents (planner, implementer, tester, reviewer, doc-writer) work test-first, deterministic hooks
enforce formatting and green tests, and two human gates keep control: plan approval and production deploy.
This site itself was built with it — see "How this site was built".
