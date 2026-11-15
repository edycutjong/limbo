#!/usr/bin/env bash
# Thin shim: see kiro-run.mjs for what the wrapper does.
exec node "$(dirname "$0")/kiro-run.mjs" "$@"
