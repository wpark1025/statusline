#!/usr/bin/env bash
# Thin wrapper: pipe Claude Code's statusLine JSON into the node renderer.
# Resolves statusline.js relative to this script so it works from any path.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/statusline.js"
