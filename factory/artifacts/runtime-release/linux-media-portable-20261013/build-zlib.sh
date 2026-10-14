#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
source=/home/ubuntu/build/bun-os-obscura-4634063/vendor/zlib
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/zlib-linux-x64-portable
sysroot=/opt/linux-sysroot-glibc
[[ $(cat "$source/.ref") == 21426576697e7e84 ]]
printf '%s  %s\n' 095dfb3b21c4402d39cfc1e928893d2ffc53713ea897048617818a7a8b6eaec9 "$source/CMakeLists.txt" | sha256sum -c -
timeout 120 cmake -S "$source" -B "$owner/build" -G Ninja \
  -DCMAKE_C_COMPILER=/usr/lib/llvm-23/bin/clang -DCMAKE_C_COMPILER_TARGET=x86_64-linux-gnu \
  -DCMAKE_SYSROOT="$sysroot" "-DCMAKE_C_FLAGS=--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" \
  '-DCMAKE_EXE_LINKER_FLAGS=-fuse-ld=lld -static-libgcc' -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$owner/prefix" -DZLIB_COMPAT=ON -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF
timeout 600 taskset -c 0,1 cmake --build "$owner/build" --parallel 2
timeout 120 cmake --install "$owner/build"
mkdir -p "$owner/prefix/share/licenses/zlib-ng"
cp "$source/LICENSE.md" "$owner/prefix/share/licenses/zlib-ng/"
printf '%s\n' build-complete > "$owner/build-status.txt"
