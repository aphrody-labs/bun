#!/usr/bin/env bash
set -euo pipefail
repository=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
owner="$repository/factory/artifacts/nginx-sdk/linux-x64-portable/compatibility"
llvm=/usr/lib/llvm-23/bin
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD
mkdir -p "$owner"
for target in linux-x64 linux-arm64 linux-x64-musl linux-arm64-musl; do
  case "$target" in
    linux-x64) sysroot=/opt/linux-sysroot-glibc; triple=x86_64-linux-gnu; gcc="$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" ;;
    linux-arm64) sysroot=/opt/linux-sysroot-glibc-arm64; triple=aarch64-linux-gnu; gcc="$sysroot/usr/lib/gcc/aarch64-linux-gnu/13" ;;
    linux-x64-musl) sysroot=/opt/linux-sysroot-musl; triple=x86_64-linux-musl; gcc="$sysroot/usr/lib/gcc/x86_64-linux-musl/15.2.0" ;;
    linux-arm64-musl) sysroot=/opt/linux-sysroot-musl-arm64; triple=aarch64-linux-musl; gcc="$sysroot/usr/lib/gcc/aarch64-linux-musl/15.2.0" ;;
  esac
  flags=(--target="$triple" --sysroot="$sysroot" --gcc-install-dir="$gcc" -std=c++17 -O2 -UNDEBUG -fPIC -ffunction-sections -fdata-sections -D_GNU_SOURCE)
  extra=(-fuse-ld=lld -Wl,--gc-sections)
  if [[ "$target" == *musl ]]; then flags+=(-nostdinc++); extra+=(-static -nostdlib++); else extra+=(-static-libstdc++ -static-libgcc -ldl -lpthread -lm -Wl,--wrap=syscall); fi
  timeout 60 taskset -c 0,1 "$llvm/clang++" "${flags[@]}" -c "$repository/src/jsc/bindings/workaround-missing-symbols.cpp" -o "$owner/$target.o"
  if [[ "$target" != *musl ]]; then
    mapfile -t symbols < <(nm --defined-only --extern-only "$owner/$target.o" | awk '$3 ~ /^__wrap_/ { sub(/^__wrap_/, "", $3); print $3 }')
    for symbol in "${symbols[@]}"; do extra+=("-Wl,--wrap=$symbol"); done
  fi
  timeout 60 taskset -c 0,1 "$llvm/clang++" "${flags[@]}" "$repository/test/integration/glibc-compat/probe.cpp" "$owner/$target.o" "${extra[@]}" -o "$owner/$target-probe"
  if [[ "$target" == *arm64* ]]; then timeout 20 qemu-aarch64 -L "$sysroot" "$owner/$target-probe" > "$owner/$target.log" 2> "$owner/$target.stderr.log"; else timeout 20 "$owner/$target-probe" > "$owner/$target.log" 2> "$owner/$target.stderr.log"; fi
  readelf --version-info "$owner/$target-probe" > "$owner/$target.versions.txt"
  readelf --file-header "$owner/$target-probe" > "$owner/$target.header.txt"
  sha256sum "$owner/$target-probe" "$owner/$target.o" > "$owner/$target.sha256.txt"
  cat "$owner/$target.log"
done
printf '%s\n' four-sysroot-probes-complete > "$owner/status.txt"
