#!/usr/bin/env bash
set -euo pipefail
repository=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
owner="$repository/factory/artifacts/nginx-sdk/linux-x64-portable"
dependencies="$owner/dependencies"
sysroot=/opt/linux-sysroot-glibc
llvm=/usr/lib/llvm-23/bin
zlib=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/zlib-linux-x64-portable/prefix
runtime="$repository/build/release/bun-profile"
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD
export CARGO_BUILD_JOBS=2
export PKG_CONFIG_SYSROOT_DIR="$sysroot"
export PKG_CONFIG_LIBDIR="$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/share/pkgconfig"
export PKG_CONFIG_PATH=
mkdir -p "$dependencies"
printf '%s  %s\n' e4eec4b553a4471d5ed6ccac54612f964924dc3a3b9d78aa92a7d5a24ff097e3 "$repository/vendor/boringssl/CMakeLists.txt" | sha256sum -c -
[[ $(cat "$repository/vendor/boringssl/.ref") == fbfd7ac5266b38d4 ]]
timeout 180 "$runtime" "$repository/packages/bun-nginx/scripts/portable-sdk.ts" prepare-pcre "$dependencies"
timeout 120 cmake -S "$repository/vendor/boringssl" -B "$dependencies/boringssl-build" -G Ninja \
  -DCMAKE_SYSTEM_NAME=Linux -DCMAKE_SYSTEM_PROCESSOR=x86_64 -DCMAKE_SYSROOT="$sysroot" \
  -DCMAKE_C_COMPILER="$llvm/clang" -DCMAKE_C_COMPILER_TARGET=x86_64-linux-gnu \
  -DCMAKE_CXX_COMPILER="$llvm/clang++" -DCMAKE_CXX_COMPILER_TARGET=x86_64-linux-gnu \
  -DCMAKE_ASM_COMPILER="$llvm/clang" \
  "-DCMAKE_C_FLAGS=--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" \
  "-DCMAKE_CXX_FLAGS=--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" \
  "-DCMAKE_ASM_FLAGS=--target=x86_64-linux-gnu --sysroot=$sysroot --gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" \
  '-DCMAKE_EXE_LINKER_FLAGS=-fuse-ld=lld -static-libgcc -static-libstdc++' \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
  -DCMAKE_INSTALL_PREFIX="$dependencies/prefix"
timeout 1200 taskset -c 0,1 cmake --build "$dependencies/boringssl-build" --target ssl crypto bssl --parallel 2
timeout 120 cmake --install "$dependencies/boringssl-build"
mkdir -p "$dependencies/prefix/share/licenses/boringssl"
cp "$repository/vendor/boringssl/LICENSE" "$dependencies/prefix/share/licenses/boringssl/"
timeout 60 "$llvm/clang++" --target=x86_64-linux-gnu --sysroot="$sysroot" \
  "--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13" -std=c++17 -O2 -fPIC \
  -ffunction-sections -fdata-sections -D_GNU_SOURCE \
  -c "$repository/src/jsc/bindings/workaround-missing-symbols.cpp" \
  -o "$dependencies/prefix/lib/bun-glibc-compat.o"
timeout 60 "$runtime" "$repository/packages/bun-nginx/scripts/portable-sdk.ts" finalize "$dependencies" "$zlib"
export BUN_NGINX_HEAVY_LOCK_EXECUTION=held
timeout 2100 taskset -c 0,1 "$runtime" "$repository/packages/bun-nginx/scripts/build-provider.ts" locked-build "$owner" "$dependencies/sdk-receipt.json"
printf '%s\n' portable-build-complete > "$owner/build-status.txt"
