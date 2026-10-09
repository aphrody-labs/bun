#!/usr/bin/env bash
# Clones and builds the aphrody-labs/bun fork in one command (Ubuntu/Debian, Alpine, macOS):
#
#   curl -fsSL https://aphrody.com/bun/setup.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install-dev.sh | bash
#   ... | bash -s -- --dry-run          # any scripts/aphrody/setup.ts option (--dir, --ref, --no-build, --packages)
#
# Installs the fork's bun when the machine has none (or an upstream one), then runs scripts/aphrody/setup.ts,
# which clones the repository (default ~/bun, or APHRODY_BUN_CHECKOUT), installs the toolchains (system packages,
# LLVM, rustup and the pinned nightly), fetches the native dependencies and ends with `bun bd --version`.
# Safe to run again: finished steps are skipped.
set -euo pipefail

repo=${APHRODY_BUN_REPO:-aphrody-labs/bun}
ref=${APHRODY_BUN_REF:-main}
raw="https://raw.githubusercontent.com/$repo/$ref/scripts/aphrody"
export BUN_INSTALL=${BUN_INSTALL:-$HOME/.bun}
export PATH="$BUN_INSTALL/bin:$PATH"

die() { echo "error: $*" >&2; exit 1; }
as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null; then sudo "$@"
  elif command -v doas >/dev/null; then doas "$@"
  else die "run as root or install sudo to get: $*"; fi
}

# install.sh needs curl and unzip, the clone needs git.
need=()
for tool in curl unzip git; do command -v "$tool" >/dev/null || need+=("$tool"); done
if [ ${#need[@]} -gt 0 ]; then
  if command -v apt-get >/dev/null; then
    as_root apt-get update -q
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates "${need[@]}"
  elif command -v apk >/dev/null; then
    as_root apk add --no-cache ca-certificates bash libstdc++ libgcc "${need[@]}"
  elif command -v brew >/dev/null; then
    brew install "${need[@]}"
  else
    die "install ${need[*]} first"
  fi
fi

is_fork() {
  # The fork resolves these npm names to built-in modules; upstream Bun cannot.
  (cd "${TMPDIR:-/tmp}" && bun -e "await import('picocolors'); await import('tiny-invariant'); console.log('aphrody')" 2>/dev/null) | grep -qx aphrody
}
if ! command -v bun >/dev/null || ! is_fork; then
  curl -fsSL "$raw/install.sh" | bash
  hash -r
fi
is_fork || die "$(command -v bun) is not the aphrody-labs/bun build"

# A --dir among the arguments comes last and wins over this default.
checkout=${APHRODY_BUN_CHECKOUT:-$HOME/bun}
if [ -f "$checkout/scripts/aphrody/setup.ts" ]; then
  exec bun "$checkout/scripts/aphrody/setup.ts" --dir "$checkout" "$@"
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/setup.ts" "$raw/setup.ts"
bun "$tmp/setup.ts" --dir "$checkout" --ref "$ref" "$@"
