#!/bin/bash
# Run Claude Code with Ling 3.2 Flash as the model, from the repository root,
# so Ling can read the docs and create or edit files anywhere in the project.
#
# Usage:
#   scripts/ling.sh "your prompt" [extra claude flags...]
#   scripts/ling.sh - [extra claude flags...] < prompt.txt
cd "$(dirname "$0")/.." || exit 1

prompt="$1"
[ "$prompt" = "-" ] || [ -z "$prompt" ] && prompt="$(cat)"
shift

# Clear other Anthropic/Claude login and session variables so only the Ling key is used
for v in $(compgen -e | grep -E '^(ANTHROPIC_|CLAUDE)'); do unset "$v"; done

# In a cloud environment with a network secret for api.ant-ling.com, the proxy
# replaces this placeholder with the real key.
LING_API_KEY="${LING_API_KEY:-${ANTLING_API_KEY:-proxy-injected}}"

export ANTHROPIC_BASE_URL=https://api.ant-ling.com/anthropic
export ANTHROPIC_AUTH_TOKEN="$LING_API_KEY"
export ANTHROPIC_API_KEY="$LING_API_KEY"
export ANTHROPIC_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_OPUS_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_SONNET_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_HAIKU_MODEL=Ling-3.2-flash

exec claude -p "$prompt" --model Ling-3.2-flash \
  --permission-mode acceptEdits \
  --allowedTools "Bash" "Read" "Write" "Edit" "Glob" "Grep" "WebFetch" "WebSearch" "TodoWrite" \
  "$@"
