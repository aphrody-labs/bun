#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/mpv-linux-x64-portable
prefix=$owner/prefix
ffmpeg=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/ffmpeg-linux-x64-portable/prefix
unset PKG_CONFIG_SYSROOT_DIR
export PKG_CONFIG_PATH=''
export PKG_CONFIG_LIBDIR=$prefix/lib/pkgconfig:$ffmpeg/lib/pkgconfig
args="['-fuse-ld=lld', '-static-libgcc', '-static-libstdc++', '-Wl,--gc-sections', '/home/ubuntu/build/tmp/media-sdk-glibc-x64.o', '-Wl,--wrap=exp', '-Wl,--wrap=exp2', '-Wl,--wrap=expf', '-Wl,--wrap=exp2f', '-Wl,--wrap=log', '-Wl,--wrap=log2', '-Wl,--wrap=logf', '-Wl,--wrap=log2f', '-Wl,--wrap=pow', '-Wl,--wrap=powf', '-Wl,--wrap=fcntl64', '-Wl,--wrap=glob64', '-lm']"
timeout 120 meson configure "$owner/build-libplacebo" "-Dcpp_link_args=$args"
timeout 120 taskset -c 0,1 meson compile -C "$owner/build-libplacebo" -j2
timeout 120 meson install -C "$owner/build-libplacebo"
# shellcheck disable=SC2016
patchelf --set-rpath '$ORIGIN' "$prefix/lib/libplacebo.so.375"
PATH=/usr/lib/llvm-23/bin:$PATH /home/ubuntu/.bun/bin/bun /home/ubuntu/build/tmp/qualify-sdk.js linux-x64 "$prefix" "$owner/linux-abi.json"
