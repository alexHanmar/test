#!/usr/bin/env bash
# PostToolUse hook: run tests after Claude edits a file.
cd "$CLAUDE_PROJECT_DIR" || exit 0
log=".claude/hooks/hook.log"

if out=$(npm test 2>&1); then
  echo "$(date '+%F %T') PASS" >> "$log"
  echo '{"systemMessage": "✅ hook: npm test 通过"}'
else
  echo "$(date '+%F %T') FAIL" >> "$log"
  echo "$out" | tail -30 >&2
  exit 2
fi
