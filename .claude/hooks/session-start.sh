#!/usr/bin/env bash
# SessionStart: make codegraph and context-mode ready in every session (cloud containers start
# fresh). Installs the pinned CLIs if missing, builds or syncs the codegraph index in the
# background, then hands the hook input to context-mode's own SessionStart hook.
CODEGRAPH_VERSION=1.6.2
CONTEXT_MODE_VERSION=1.0.169
export DO_NOT_TRACK=1 CODEGRAPH_TELEMETRY=0

input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

if ! command -v codegraph > /dev/null 2>&1 || [ ! -d "$(npm root -g)/context-mode" ]; then
  npm install -g --silent --no-fund --no-audit \
    "@colbymchenry/codegraph@$CODEGRAPH_VERSION" "context-mode@$CONTEXT_MODE_VERSION" > /dev/null 2>&1
fi

if command -v codegraph > /dev/null 2>&1; then
  if [ -d .codegraph ]; then
    (codegraph sync -q . > /dev/null 2>&1 &)
  else
    (codegraph init -y . > /dev/null 2>&1 &)
  fi
fi

printf '%s' "$input" | "$(dirname "$0")/context-mode.sh" sessionstart
exit 0
