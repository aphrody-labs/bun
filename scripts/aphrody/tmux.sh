#!/usr/bin/env bash
# Compatibility entry point: the job runner is scripts/aphrody/tmux.ts (native
# psmux/tmux, no WSL).
set -euo pipefail
export PATH="${LOCALAPPDATA:-$HOME/AppData/Local}/Microsoft/WinGet/Links:$PATH"
exec bun "$(dirname "${BASH_SOURCE[0]}")/tmux.ts" "$@"
