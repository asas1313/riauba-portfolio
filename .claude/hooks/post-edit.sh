#!/usr/bin/env bash
# Runs after every Edit/Write. Formats the touched file. Never blocks the edit.
input=$(cat)
command -v jq >/dev/null || { echo "hook: jq not installed, skipping" >&2; exit 0; }
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
make -s format-file FILE="$file" >/dev/null 2>&1 || true
exit 0
