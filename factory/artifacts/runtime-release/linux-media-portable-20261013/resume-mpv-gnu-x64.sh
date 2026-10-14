#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/mpv-linux-x64-portable
prefix=$owner/prefix
ffmpeg=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/ffmpeg-linux-x64-portable/prefix
headers=$owner/headers
dpkg --verify libvulkan-dev
mkdir -p "$headers"
cp -a /usr/include/vulkan /usr/include/vk_video "$headers/"
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD PKG_CONFIG_SYSROOT_DIR
export PKG_CONFIG_PATH=''
export PKG_CONFIG_LIBDIR=$prefix/lib/pkgconfig:$ffmpeg/lib/pkgconfig
timeout 120 meson configure "$owner/build-libplacebo" "-Dc_args=['-I$headers']" "-Dcpp_args=['-I$headers']"
timeout 1200 taskset -c 0,1 meson compile -C "$owner/build-libplacebo" -j2
timeout 180 meson install -C "$owner/build-libplacebo"
timeout 300 meson setup "$owner/build-mpv" /home/ubuntu/src/mpv --cross-file "$owner/cross.ini" \
  --prefix="$prefix" --libdir=lib --buildtype=release --wrap-mode=nodownload -Ddefault_library=shared \
  -Dauto_features=disabled -Dlibmpv=true -Dcplayer=true -Dbuild-date=false -Dgpl=false -Dgl=disabled -Dvulkan=disabled
timeout 2400 taskset -c 0,1 meson compile -C "$owner/build-mpv" -j2
timeout 180 meson install -C "$owner/build-mpv"
for component in freetype fribidi harfbuzz libass libplacebo mpv gcc-runtime vulkan-headers; do mkdir -p "$prefix/share/licenses/$component"; done
cp /home/ubuntu/src/freetype/LICENSE.TXT /home/ubuntu/src/freetype/docs/FTL.TXT "$prefix/share/licenses/freetype/"
cp /home/ubuntu/src/fribidi/COPYING "$prefix/share/licenses/fribidi/"
cp /home/ubuntu/src/harfbuzz/COPYING "$prefix/share/licenses/harfbuzz/"
cp /home/ubuntu/src/libass/COPYING "$prefix/share/licenses/libass/"
cp /home/ubuntu/src/libplacebo/LICENSE "$prefix/share/licenses/libplacebo/"
cp /home/ubuntu/src/mpv/Copyright /home/ubuntu/src/mpv/LICENSE.LGPL "$prefix/share/licenses/mpv/"
cp /opt/linux-sysroot-glibc/usr/share/doc/gcc-13-base/copyright "$prefix/share/licenses/gcc-runtime/"
cp /usr/share/doc/libvulkan-dev/copyright "$prefix/share/licenses/vulkan-headers/"
cp -a "$ffmpeg/lib/"*.so* "$prefix/lib/"
cp -a "$ffmpeg/share/licenses/ffmpeg" "$prefix/share/licenses/"
# shellcheck disable=SC2016
find "$prefix/lib" -maxdepth 1 -type f -name '*.so*' -print0 | xargs -0 -r -n1 patchelf --set-rpath '$ORIGIN'
# shellcheck disable=SC2016
patchelf --set-rpath '$ORIGIN/../lib' "$prefix/bin/mpv"
printf '%s\n' build-complete > "$owner/build-status.txt"
