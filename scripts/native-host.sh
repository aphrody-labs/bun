#!/bin/sh
# Build host for aphrody-labs/bun: the steps of upstream's debian-13 aarch64 build image
# (scripts/build/ci-images/spec.ts, key linux-aarch64-debian) that a release build needs.
# Upstream bakes every step into an AMI; a GitHub runner only gets the toolchain ones.
# Usage (as root, in debian:13 arm64): sh scripts/native-host.sh
# windows-sysroot is left out: xwin needs --accept-license for the Microsoft SDK and CRT,
# which is for the owner to accept, not a build script.
set -eu
cd "$(dirname "$0")/.."
key=linux-aarch64-debian
src=build/ci-images/$key/bootstrap.sh
[ -f "$src" ] || { echo "missing $src: run 'bun scripts/build/ci-images/spec.ts $key' first" >&2; exit 1; }
keep="packages ca-certificates agent-account nodejs bun bun-ninja cmake llvm rust cross-compiler-rt glibc-sysroot musl-sysroot"
out=build/ci-images/$key/host.sh
awk -v keep=" $keep " '
  NR == 1 { print; next }
  /^# ---- / { name = $3; on = index(keep, " " name " ") > 0 }
  /^\[ \$# -eq 2 \]/ { next }
  /^REPO_COMMIT=|^IMAGE_NAME=/ { next }
  !started && !/^# ---- / { print; next }
  /^# ---- / { started = 1 }
  on { print }
' "$src" > "$out"
grep '^# ---- ' "$out"
exec sh "$out"
