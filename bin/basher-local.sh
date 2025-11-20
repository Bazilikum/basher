#!/bin/bash
# Wrapper script for running Basher locally during development

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

exec node "$PROJECT_ROOT/dist/index.js" "$@"
