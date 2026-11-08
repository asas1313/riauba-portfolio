---
name: ship
description: Runs the full delivery cycle for one spec – plan, approval gate, TDD implementation, testing, review loop, docs, PR. Invoke as /ship docs/specs/NNN-name.md
disable-model-invocation: true
---
Deliver the spec at: $ARGUMENTS

You are the orchestrator. Delegate each phase to the named subagent and pass it the spec path.
Keep a short progress log in `docs/specs/<spec-id>.log.md` (phase, outcome, iteration count).

1. **Branch** – `git switch -c feat/<spec-id>` from an up-to-date main.
2. **Plan** – run the `planner` subagent. Show me the plan summary and open questions.
   **STOP. Wait for me to reply "patvirtinu" (or answer the questions). Do not continue without it.**
3. **Implement** – run the `implementer` subagent on the approved plan.
4. **Test** – run the `tester` subagent. If it reports bugs, send them to `implementer`, then re-run `tester`.
5. **Review loop** – run the `reviewer` subagent. If CHANGES REQUESTED, send findings to `implementer`
   and review again. Maximum 3 review iterations; if still not APPROVED, stop and summarise for me.
6. **Docs** – run the `doc-writer` subagent.
7. **Final gate** – run `make test lint security docs` yourself. All must pass.
8. **PR** – push the branch and `gh pr create` with: link to spec, acceptance criteria checklist (✅),
   summary of design decisions, reviewer iteration count, and anything I should look at manually.
9. Report the PR URL. Do not merge. Do not deploy.
