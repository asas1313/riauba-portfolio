#!/usr/bin/env bash
# Runs when Claude wants to finish a turn. If code changed and tests fail,
# exit 2 sends the failure back to Claude so it keeps working.
input=$(cat)
command -v jq >/dev/null || { echo "hook: jq not installed, skipping" >&2; exit 0; }
active=$(echo "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0          # avoid infinite loops
cd "$CLAUDE_PROJECT_DIR" || exit 0
# Only gate when source code changed (docs-only or planning turns pass).
changed=$(git status --porcelain | awk '{print $2}' | grep -vE '^(docs/|.*\.md$)' || true)
[ -z "$changed" ] && exit 0
if ! out=$(make -s test 2>&1); then
  echo "make test failed. Fix the failures before finishing:" >&2
  echo "$out" | tail -n 60 >&2
  exit 2
fi
exit 0
