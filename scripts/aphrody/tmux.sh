#!/usr/bin/env bash
# Long-running jobs (bun bd, cargo, docker build, CI watch) in one shared tmux
# session inside WSL, so any agent can start, list, read and stop them.
# Commands run on Windows by default (pwsh.exe through WSL interop, so the MSVC
# toolchain and Windows paths apply); `--linux` runs them in WSL itself.
# Every job also tees its output to tmp/tmux/<name>.log in the checkout.
#
#   scripts/aphrody/tmux.sh up
#   scripts/aphrody/tmux.sh run <name> [--linux] [--cwd <dir>] -- <command...>
#   scripts/aphrody/tmux.sh ls | logs <name> [lines] | wait <name> | kill <name> | attach

set -euo pipefail

SESSION="${APHRODY_TMUX_SESSION:-aphrody}"
DISTRO="${APHRODY_WSL_DISTRO:-Ubuntu-24.04}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="$ROOT/tmp/tmux"

in_wsl() { [[ -n "${WSL_DISTRO_NAME:-}" ]]; }

# From Windows (Git Bash), re-run this script inside WSL.
if ! in_wsl; then
  win_root="$(cygpath -m "$ROOT" 2>/dev/null || echo "$ROOT")"
  wsl_root="$(MSYS_NO_PATHCONV=1 wsl.exe -d "$DISTRO" -- wslpath -a "$win_root" | tr -d '\r')"
  MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*" exec wsl.exe -d "$DISTRO" -- bash "$wsl_root/scripts/aphrody/tmux.sh" "$@"
fi

mkdir -p "$LOGS"
tmux has-session -t "$SESSION" 2>/dev/null || tmux new-session -d -s "$SESSION" -n main -c "$ROOT"

cmd="${1:-ls}"
shift || true
case "$cmd" in
  up) echo "session $SESSION ready ($ROOT)" ;;
  run)
    name="${1:?name required}"
    shift
    linux=0
    cwd="$ROOT"
    while [[ $# -gt 0 && "$1" != "--" ]]; do
      case "$1" in
        --linux) linux=1 ;;
        --cwd) cwd="$2"; shift ;;
        *) echo "unknown option $1" >&2; exit 2 ;;
      esac
      shift
    done
    shift || true
    [[ $# -gt 0 ]] || { echo "command required after --" >&2; exit 2; }
    if tmux list-windows -t "$SESSION" -F '#W' | grep -qx "$name"; then
      echo "job $name already exists; kill it first" >&2
      exit 1
    fi
    log="$LOGS/$name.log"
    : >"$log"
    rm -f "$LOGS/$name.exit"
    user_cmd="$*"
    if [[ $linux -eq 1 ]]; then
      runner="cd $(printf %q "$cwd") && bash -lc $(printf %q "$user_cmd")"
    else
      wincwd="$(wslpath -w "$cwd")"
      runner="cd /mnt/c && pwsh.exe -NoProfile -Command $(printf %q "Set-Location '$wincwd'; $user_cmd; exit \$LASTEXITCODE")"
    fi
    tmux new-window -d -t "$SESSION" -n "$name" \
      "{ $runner; } 2>&1 | tee -a $(printf %q "$log"); echo \${PIPESTATUS[0]} > $(printf %q "$LOGS/$name.exit"); exec bash"
    echo "started $name → tmp/tmux/$name.log"
    ;;
  ls)
    { tmux list-windows -t "$SESSION" -F '#W' | grep -vx main || true; } | while read -r w; do
      if [[ -f "$LOGS/$w.exit" ]]; then echo "$w done exit=$(cat "$LOGS/$w.exit")"; else echo "$w running"; fi
    done
    ;;
  logs) tail -n "${2:-50}" "$LOGS/${1:?name required}.log" ;;
  wait)
    name="${1:?name required}"
    while [[ ! -f "$LOGS/$name.exit" ]]; do sleep 5; done
    exit "$(cat "$LOGS/$name.exit")"
    ;;
  kill) tmux kill-window -t "$SESSION:${1:?name required}" && rm -f "$LOGS/$1.exit" ;;
  attach) exec tmux attach -t "$SESSION" ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
