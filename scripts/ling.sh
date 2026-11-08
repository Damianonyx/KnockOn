#!/bin/bash
cd "$(dirname "$0")/.." && mkdir -p backend && cd backend
export ANTHROPIC_BASE_URL=https://api.ant-ling.com/anthropic
export ANTHROPIC_AUTH_TOKEN="$LING_API_KEY"
export ANTHROPIC_API_KEY="$LING_API_KEY"
export ANTHROPIC_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_OPUS_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_SONNET_MODEL=Ling-3.2-flash
export ANTHROPIC_DEFAULT_HAIKU_MODEL=Ling-3.2-flash
claude -p "$1" --model Ling-3.2-flash --permission-mode acceptEdits --allowedTools "Bash"
