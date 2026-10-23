#!/usr/bin/env bash
# Runs one of context-mode's hook scripts (pretooluse, posttooluse, …) from the global install.
# Does nothing when context-mode is not installed yet, so a missing install never blocks a tool.
hook="$(npm root -g 2>/dev/null)/context-mode/hooks/$1.mjs"
[ -f "$hook" ] || { cat > /dev/null; exit 0; }
exec node "$hook"
