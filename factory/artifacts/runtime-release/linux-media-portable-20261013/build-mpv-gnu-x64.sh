#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
sysroot=/opt/linux-sysroot-glibc
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/mpv-linux-x64-portable
prefix=$owner/prefix
ffmpeg=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/ffmpeg-linux-x64-portable/prefix
shim=/home/ubuntu/build/tmp/media-sdk-glibc-x64.o
[[ $(git -C /home/ubuntu/src/mpv rev-parse HEAD) == c3ac7f39514c7f45bc38a18e66887240539ee33c ]]
[[ -z $(git -C /home/ubuntu/src/mpv status --porcelain) ]]
[[ $(git -C /home/ubuntu/src/libplacebo rev-parse HEAD) == 1dd022687b9ac1dd996855b51433bf770ae76aab ]]
[[ -z $(git -C /home/ubuntu/src/libplacebo status --porcelain) ]]
mkdir -p "$prefix" "$owner"
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD PKG_CONFIG_SYSROOT_DIR
export PKG_CONFIG_PATH=
export PKG_CONFIG_LIBDIR=$prefix/lib/pkgconfig:$ffmpeg/lib/pkgconfig
export OMP_NUM_THREADS=2
cat > "$owner/cross.ini" <<EOF
[binaries]
c = ['/usr/lib/llvm-23/bin/clang', '--target=x86_64-linux-gnu', '--sysroot=$sysroot', '--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13']
cpp = ['/usr/lib/llvm-23/bin/clang++', '--target=x86_64-linux-gnu', '--sysroot=$sysroot', '--gcc-install-dir=$sysroot/usr/lib/gcc/x86_64-linux-gnu/13']
ar = '/usr/lib/llvm-23/bin/llvm-ar'
strip = '/usr/lib/llvm-23/bin/llvm-strip'
pkg-config = '/usr/bin/pkg-config'
[host_machine]
system = 'linux'
cpu_family = 'x86_64'
cpu = 'x86_64'
endian = 'little'
[properties]
needs_exe_wrapper = true
pkg_config_libdir = ['$prefix/lib/pkgconfig', '$ffmpeg/lib/pkgconfig']
[built-in options]
c_link_args = ['-fuse-ld=lld', '-static-libgcc', '$shim', '-Wl,--wrap=exp', '-Wl,--wrap=exp2', '-Wl,--wrap=expf', '-Wl,--wrap=exp2f', '-Wl,--wrap=log', '-Wl,--wrap=log2', '-Wl,--wrap=logf', '-Wl,--wrap=log2f', '-Wl,--wrap=pow', '-Wl,--wrap=powf', '-Wl,--wrap=fcntl64', '-Wl,--wrap=glob64', '-lm']
cpp_link_args = ['-fuse-ld=lld', '-static-libgcc', '-static-libstdc++', '$shim', '-Wl,--wrap=exp', '-Wl,--wrap=exp2', '-Wl,--wrap=expf', '-Wl,--wrap=exp2f', '-Wl,--wrap=log', '-Wl,--wrap=log2', '-Wl,--wrap=logf', '-Wl,--wrap=log2f', '-Wl,--wrap=pow', '-Wl,--wrap=powf', '-Wl,--wrap=fcntl64', '-Wl,--wrap=glob64', '-lm']
EOF
build_meson() {
  local component=$1 source=$2
  shift 2
  timeout 300 meson setup "$owner/build-$component" "$source" --cross-file "$owner/cross.ini" \
    --prefix="$prefix" --libdir=lib --buildtype=release --wrap-mode=nodownload \
    -Ddefault_library=shared -Dauto_features=disabled "$@"
  timeout 2400 taskset -c 0,1 meson compile -C "$owner/build-$component" -j2
  timeout 180 meson install -C "$owner/build-$component"
}
build_meson freetype /home/ubuntu/src/freetype -Dharfbuzz=disabled -Dzlib=internal
build_meson fribidi /home/ubuntu/src/fribidi -Ddocs=false -Dbin=false -Dtests=false
build_meson harfbuzz /home/ubuntu/src/harfbuzz -Dfreetype=enabled -Dtests=disabled -Dutilities=disabled -Ddocs=disabled -Dintrospection=disabled
build_meson libass /home/ubuntu/src/libass -Dfontconfig=disabled -Dlibunibreak=disabled -Drequire-system-font-provider=false -Dasm=enabled
build_meson libplacebo /home/ubuntu/src/libplacebo -Ddemos=false -Dtests=false -Dbench=false \
  -Dvulkan=disabled -Dopengl=disabled -Dd3d11=disabled -Dglslang=disabled -Dshaderc=disabled -Dlcms=disabled -Ddovi=disabled -Dlibdovi=disabled -Dunwind=disabled -Dxxhash=disabled
build_meson mpv /home/ubuntu/src/mpv -Dlibmpv=true -Dcplayer=true -Dbuild-date=false -Dgpl=false -Dgl=disabled -Dvulkan=disabled
for component in freetype fribidi harfbuzz libass libplacebo mpv gcc-runtime; do mkdir -p "$prefix/share/licenses/$component"; done
cp /home/ubuntu/src/freetype/LICENSE.TXT /home/ubuntu/src/freetype/docs/FTL.TXT "$prefix/share/licenses/freetype/"
cp /home/ubuntu/src/fribidi/COPYING "$prefix/share/licenses/fribidi/"
cp /home/ubuntu/src/harfbuzz/COPYING "$prefix/share/licenses/harfbuzz/"
cp /home/ubuntu/src/libass/COPYING "$prefix/share/licenses/libass/"
cp /home/ubuntu/src/libplacebo/LICENSE "$prefix/share/licenses/libplacebo/"
cp /home/ubuntu/src/mpv/Copyright /home/ubuntu/src/mpv/LICENSE.LGPL "$prefix/share/licenses/mpv/"
cp /opt/linux-sysroot-glibc/usr/share/doc/gcc-13-base/copyright "$prefix/share/licenses/gcc-runtime/"
# The relocatable libmpv distribution contains its complete FFmpeg closure.
cp -a "$ffmpeg/lib/"*.so* "$prefix/lib/"
cp -a "$ffmpeg/share/licenses/ffmpeg" "$prefix/share/licenses/"
# shellcheck disable=SC2016
find "$prefix/lib" -maxdepth 1 -type f -name '*.so*' -print0 | xargs -0 -r -n1 patchelf --set-rpath '$ORIGIN'
# shellcheck disable=SC2016
patchelf --set-rpath '$ORIGIN/../lib' "$prefix/bin/mpv"
printf '%s\n' build-complete > "$owner/build-status.txt"
