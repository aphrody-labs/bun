#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
source=/home/ubuntu/src/ffmpeg
sysroot=/opt/linux-sysroot-glibc
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/ffmpeg-linux-x64-portable
build=$owner/build
prefix=$owner/prefix
[[ $(git -C "$source" rev-parse HEAD) == 7e93014c5bbb61e7c22afebb478bf92f7a08d59a ]]
[[ -z $(git -C "$source" status --porcelain) ]]
mkdir -p "$build" "$prefix/share/licenses/ffmpeg"
export OMP_NUM_THREADS=2
export PKG_CONFIG_SYSROOT_DIR=$sysroot
export PKG_CONFIG_LIBDIR=$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/lib/pkgconfig:$sysroot/usr/share/pkgconfig
export PKG_CONFIG_PATH=
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD
cd "$build"
/usr/bin/timeout 300 bash "$source/configure"   --prefix="$prefix" --arch=x86_64 --target-os=linux --enable-cross-compile   --sysroot="$sysroot" --cc=/usr/lib/llvm-23/bin/clang --cxx=/usr/lib/llvm-23/bin/clang++   --ar=/usr/lib/llvm-23/bin/llvm-ar --ranlib=/usr/lib/llvm-23/bin/llvm-ranlib --nm=/usr/lib/llvm-23/bin/llvm-nm   --extra-cflags="--target=x86_64-linux-gnu --gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13 -fPIC"   --extra-ldflags="--target=x86_64-linux-gnu --gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13 -fuse-ld=lld -static-libgcc"   --disable-autodetect --enable-shared --disable-static --disable-doc --disable-debug --disable-ffplay --disable-checkasm   --disable-gpl --disable-nonfree
/usr/bin/timeout 7200 taskset -c 0,1 make -j2
/usr/bin/timeout 180 make install
cp "$source"/COPYING.LGPLv2.1 "$source"/COPYING.LGPLv3 "$source"/LICENSE.md "$prefix/share/licenses/ffmpeg/"
find "$prefix/lib" -maxdepth 1 -type f -name '*.so*' -print0 | xargs -0 -r -n1 patchelf --set-rpath '$ORIGIN'
patchelf --set-rpath '$ORIGIN/../lib' "$prefix/bin/ffmpeg" "$prefix/bin/ffprobe"
for file in "$prefix/lib"/*.so.* "$prefix/bin/ffmpeg" "$prefix/bin/ffprobe"; do
  [[ -f "$file" ]] || continue
  printf '%s ' "$file"
  /usr/lib/llvm-23/bin/llvm-readelf --version-info "$file" | rg -o 'GLIBC_[0-9.]+' | sort -Vu | tail -1
 done
printf '%s\n' build-complete > "$owner/build-status.txt"
