#!/usr/bin/env python3
"""Send one prompt to Ling 3.2 Flash and stream the reply.

This is a single chat request: Ling answers in text and cannot read or edit
files in the repository. To have Ling work on the code, use scripts/ling.sh.

Usage:
    scripts/ling_stream.py "your prompt"
    scripts/ling_stream.py < prompt.txt

Requires: pip install anthropic
Key: LING_API_KEY or ANTLING_API_KEY. In a Claude Code cloud environment with
a network secret saved for api.ant-ling.com, any placeholder works because the
proxy injects the real key; that placeholder is the default here.
"""
import os
import sys

from anthropic import Anthropic

prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else sys.stdin.read()
if not prompt.strip():
    sys.exit("Usage: scripts/ling_stream.py \"your prompt\"  (or pipe the prompt on stdin)")

client = Anthropic(
    api_key=os.environ.get("LING_API_KEY")
    or os.environ.get("ANTLING_API_KEY")
    or "proxy-injected",
    base_url="https://api.ant-ling.com/anthropic",
)

with client.messages.stream(
    model="Ling-3.2-flash",
    max_tokens=4096,
    system="你是一个专业、准确的 AI 助手。",
    messages=[{"role": "user", "content": prompt}],
    # Current anthropic SDK versions no longer accept these as arguments here,
    # so they are sent in the request body for Ling's server.
    extra_body={
        "temperature": 1,
        "top_k": 20,
        "top_p": 0.95,
        "thinking": {"type": "enabled"},
    },
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
print()
