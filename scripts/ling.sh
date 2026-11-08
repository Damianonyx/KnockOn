#!/bin/bash
cd "$(dirname "$0")/.." && mkdir -p backend && cd backend
# Clear other Anthropic/Claude login and session variables so only the Ling key is used
for v in $(compgen -e | grep -E '^(ANTHROPIC_|CLAUDE)'); do unset "$v"; done
export ANTHROPIC_BASE_URL=https://api.ant-ling.com/anthropic
export ANTHROPIC_AUTH_TOKEN="$LING_API_KEY"
export ANTHROPIC_API_KEY="$LING_API_KEY"
export ANTHROPIC_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_OPUS_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_SONNET_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_HAIKU_MODEL=Ling-3.2-flash
claude -p "$1" --model Ling-3.2-flash --permission-mode acceptEdits --allowedTools "Bash"
