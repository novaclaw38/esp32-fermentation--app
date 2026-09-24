#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Dashboard: typecheck, lint, test and build all run from dashboard/.
npm install --prefix dashboard --no-audit --no-fund

# claude-flow MCP server (.mcp.json runs the global `claude-flow` binary).
# Skip onnxruntime-node's optional CUDA download: api.nuget.org is not
# reachable through the session proxy and the MCP server doesn't need it.
if ! command -v claude-flow >/dev/null 2>&1; then
  ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install -g claude-flow@3.44.0 --no-audit --no-fund
fi
