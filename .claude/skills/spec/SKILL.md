---
name: spec
description: Interactively writes a new specification in docs/specs/ from a rough idea. Invoke as /spec <short idea>
disable-model-invocation: true
---
Help me turn this idea into a specification: $ARGUMENTS

1. Ask me focused questions (max 5 at a time) about goal, users, scope, non-goals and constraints. Talk to me in Lithuanian.
2. Find the next free number in docs/specs/ and write `docs/specs/NNN-<slug>.md` in English using docs/specs/_TEMPLATE.md.
3. Every acceptance criterion must be testable and written as Given/When/Then.
4. Show me the spec and iterate until I say it is final. Do not start implementation.
