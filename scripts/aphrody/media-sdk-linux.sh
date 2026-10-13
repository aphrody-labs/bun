#!/usr/bin/env bash
# Native SDK factory runner. Sources and SDK/sysroot artifacts keep their owners.
set -euo pipefail
[[ $# -ge 4 ]] || { echo 'usage: media-sdk-linux.sh TARGET ffmpeg|mpv SOURCE_ROOT OUTPUT [FFMPEG_PREFIX]' >&2; exit 2; }
target=$1 component=$2 sources=$3 owner=$4
ffmpeg=${5:-}
llvm=${BUN_MEDIA_LLVM_BIN:-/usr/lib/llvm-23/bin}
lock=${BUN_MEDIA_HEAVY_LOCK:?Set the existing host heavy.lock path}
for path in "$sources" "$owner" "$llvm" "$lock"; do
  [[ $path =~ ^/[A-Za-z0-9_./+-]+$ ]] || exit 2
done
case $target in
  linux-x64) machine=x86_64 abi=gnu root=/opt/linux-sysroot-glibc ;;
  linux-arm64) machine=aarch64 abi=gnu root=/opt/linux-sysroot-glibc-arm64 ;;
  linux-x64-musl) machine=x86_64 abi=musl root=/opt/linux-sysroot-musl ;;
  linux-arm64-musl) machine=aarch64 abi=musl root=/opt/linux-sysroot-musl-arm64 ;;
  *) echo 'Unsupported Linux media SDK target' >&2; exit 2 ;;
esac
sysroot=${BUN_MEDIA_SYSROOT:-$root}
[[ $sysroot =~ ^/[A-Za-z0-9_./+-]+$ ]] || exit 2
gcc=("$sysroot/usr/lib/gcc/$machine-linux-$abi/"*)
[[ ${#gcc[@]} == 1 && -d ${gcc[0]} ]]
exec 9>"$lock"
flock -n 9 || exit 75
prefix=$owner/prefix
mkdir -p "$prefix"
printf '%s\n' build-in-progress > "$owner/build-status.txt"
unset CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH LD_LIBRARY_PATH LD_PRELOAD PKG_CONFIG_SYSROOT_DIR
export PKG_CONFIG_PATH='' OMP_NUM_THREADS=2
export PKG_CONFIG_LIBDIR=$prefix/lib/pkgconfig
flags=(--target="$machine-linux-$abi" --sysroot="$sysroot" --gcc-install-dir="${gcc[0]}")
link=(-fuse-ld=lld -static-libgcc '-Wl,--gc-sections')
if [[ $abi == gnu ]]; then
  timeout 30 "$llvm/clang" "${flags[@]}" -O2 -fPIC -fno-builtin -c "$(dirname "$0")/media-sdk-glibc.c" -o "$owner/glibc.o"
  link+=("$owner/glibc.o")
  for symbol in exp exp2 expf exp2f log log2 logf log2f pow powf fcntl64 glob64; do link+=("-Wl,--wrap=$symbol"); done
  link+=(-lm)
fi
verify_source() {
  [[ $(git -C "$sources/$1" rev-parse HEAD) == "$2" ]]
  [[ -z $(git -C "$sources/$1" status --porcelain) ]]
}
normalize() {
  # shellcheck disable=SC2016
  find "$prefix/lib" -maxdepth 1 -type f -name '*.so*' -print0 | xargs -0 -r -n1 patchelf --set-rpath '$ORIGIN'
  for program in "$prefix/bin/"*; do
    [[ -f $program && -x $program ]] || continue
    # shellcheck disable=SC2016
    patchelf --set-rpath '$ORIGIN/../lib' "$program"
  done
  # pkg-config must remain valid after relocating the distribution.
  for pc in "$prefix/lib/pkgconfig/"*.pc; do
    [[ -f $pc ]] || continue
    # shellcheck disable=SC2016
    sed -i 's|^prefix=.*|prefix=${pcfiledir}/../..|' "$pc"
  done
}
if [[ $component == ffmpeg ]]; then
  verify_source ffmpeg 7e93014c5bbb61e7c22afebb478bf92f7a08d59a
  zlib=${BUN_MEDIA_ZLIB_PREFIX:?Provide the qualified zlib SDK prefix from its existing source owner}
  [[ $zlib =~ ^/[A-Za-z0-9_./+-]+$ ]]
  zlib_pc=${BUN_MEDIA_ZLIB_PKGCONFIG:-$zlib/lib/pkgconfig}
  [[ $zlib_pc =~ ^/[A-Za-z0-9_./+-]+$ && -f $zlib_pc/zlib.pc ]]
  export PKG_CONFIG_LIBDIR=$zlib_pc:$prefix/lib/pkgconfig
  pkg-config --exists zlib
  zlib_cflags=$(pkg-config --cflags zlib)
  zlib_libs=$(pkg-config --static --libs zlib)
  mkdir -p "$owner/build"
  cd "$owner/build"
  timeout 300 bash "$sources/ffmpeg/configure" --prefix="$prefix" --arch="$machine" --target-os=linux \
    --enable-cross-compile --sysroot="$sysroot" --cc="$llvm/clang" --cxx="$llvm/clang++" \
    --ar="$llvm/llvm-ar" --ranlib="$llvm/llvm-ranlib" --nm="$llvm/llvm-nm" \
    --extra-cflags="${flags[*]} -fPIC $zlib_cflags" --extra-ldflags="${flags[*]} ${link[*]} -L$zlib/lib" \
    --extra-libs="$zlib_libs -latomic" --enable-zlib \
    --disable-autodetect --enable-shared --disable-static --disable-doc --disable-debug --disable-ffplay \
    --disable-checkasm --disable-gpl --disable-nonfree
  timeout 7200 make -j2
  timeout 180 make install
  mkdir -p "$prefix/share/licenses/ffmpeg"
  cp "$sources/ffmpeg/"{COPYING.LGPLv2.1,COPYING.LGPLv3,LICENSE.md} "$prefix/share/licenses/ffmpeg/"
  if [[ -d $zlib/share/licenses ]]; then cp -a "$zlib/share/licenses/"* "$prefix/share/licenses/"
  else mkdir -p "$prefix/share/licenses/zlib-ng"; cp -a "$zlib/licenses/"* "$prefix/share/licenses/zlib-ng/"; fi
elif [[ $component == mpv ]]; then
  verify_source mpv c3ac7f39514c7f45bc38a18e66887240539ee33c
  verify_source libplacebo 1dd022687b9ac1dd996855b51433bf770ae76aab
  [[ $ffmpeg =~ ^/[A-Za-z0-9_./+-]+$ && -f $ffmpeg/lib/pkgconfig/libavcodec.pc ]]
  vulkan=${BUN_MEDIA_VULKAN_HEADERS:?Provide the pinned Vulkan header include directory for libplacebo stubs}
  [[ $vulkan =~ ^/[A-Za-z0-9_./+-]+$ && -f $vulkan/vulkan/vulkan.h ]]
  export PKG_CONFIG_LIBDIR=$prefix/lib/pkgconfig:$ffmpeg/lib/pkgconfig
  c_link='' cpp_link=''
  for flag in "${link[@]}"; do c_link+="'$flag', "; done
  cpp_link="$c_link'-static-libstdc++', "
  cat > "$owner/cross.ini" <<EOF
[binaries]
c = ['$llvm/clang', '--target=$machine-linux-$abi', '--sysroot=$sysroot', '--gcc-install-dir=${gcc[0]}']
cpp = ['$llvm/clang++', '--target=$machine-linux-$abi', '--sysroot=$sysroot', '--gcc-install-dir=${gcc[0]}']
ar = '$llvm/llvm-ar'
strip = '$llvm/llvm-strip'
pkg-config = 'pkg-config'
[host_machine]
system = 'linux'
cpu_family = '$machine'
cpu = '$machine'
endian = 'little'
[properties]
needs_exe_wrapper = true
pkg_config_libdir = ['$prefix/lib/pkgconfig', '$ffmpeg/lib/pkgconfig']
[built-in options]
c_args = ['-I$vulkan']
cpp_args = ['-I$vulkan']
c_link_args = [$c_link]
cpp_link_args = [$cpp_link]
EOF
  build_meson() {
    local dependency=$1
    shift
    timeout 300 meson setup "$owner/build-$dependency" "$sources/$dependency" --cross-file "$owner/cross.ini" \
      --prefix="$prefix" --libdir=lib --buildtype=release --wrap-mode=nodownload \
      -Ddefault_library=shared -Dauto_features=disabled "$@"
    timeout 2400 meson compile -C "$owner/build-$dependency" -j2
    timeout 180 meson install -C "$owner/build-$dependency"
  }
  build_meson freetype -Dharfbuzz=disabled -Dzlib=internal
  build_meson fribidi -Ddocs=false -Dbin=false -Dtests=false
  build_meson harfbuzz -Dfreetype=enabled -Dtests=disabled -Dutilities=disabled -Ddocs=disabled -Dintrospection=disabled
  build_meson libass -Dfontconfig=disabled -Dlibunibreak=disabled -Drequire-system-font-provider=false -Dasm=enabled
  build_meson libplacebo -Ddemos=false -Dtests=false -Dbench=false -Dvulkan=disabled -Dopengl=disabled -Dd3d11=disabled \
    -Dglslang=disabled -Dshaderc=disabled -Dlcms=disabled -Ddovi=disabled -Dlibdovi=disabled -Dunwind=disabled -Dxxhash=disabled
  build_meson mpv -Dlibmpv=true -Dcplayer=true -Dbuild-date=false -Dgpl=false -Dgl=disabled -Dvulkan=disabled
  for dependency in freetype fribidi harfbuzz libass libplacebo mpv; do mkdir -p "$prefix/share/licenses/$dependency"; done
  cp "$sources/freetype/LICENSE.TXT" "$sources/freetype/docs/FTL.TXT" "$prefix/share/licenses/freetype/"
  cp "$sources/fribidi/COPYING" "$prefix/share/licenses/fribidi/"
  cp "$sources/harfbuzz/COPYING" "$prefix/share/licenses/harfbuzz/"
  cp "$sources/libass/COPYING" "$prefix/share/licenses/libass/"
  cp "$sources/libplacebo/LICENSE" "$prefix/share/licenses/libplacebo/"
  cp "$sources/mpv/Copyright" "$sources/mpv/LICENSE.LGPL" "$prefix/share/licenses/mpv/"
  cp -a "$ffmpeg/lib/"*.so* "$prefix/lib/"
  cp -a "$ffmpeg/share/licenses/"* "$prefix/share/licenses/"
else
  echo 'Unsupported Linux media SDK component' >&2
  exit 2
fi
normalize
runtime_license=${BUN_MEDIA_GCC_RUNTIME_LICENSE:-$sysroot/usr/share/doc/gcc-13-base/copyright}
[[ -f $runtime_license ]] || { echo 'Provide the target GCC runtime license owner via BUN_MEDIA_GCC_RUNTIME_LICENSE' >&2; exit 1; }
mkdir -p "$prefix/share/licenses/gcc-runtime"
cp "$runtime_license" "$prefix/share/licenses/gcc-runtime/"
printf '%s\n' build-complete-awaiting-elf-functional-license-gates > "$owner/build-status.txt"
