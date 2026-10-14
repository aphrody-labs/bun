#!/usr/bin/env bash
set -euo pipefail
owner=/home/ubuntu/build/tmp/media-sdk-abi-probes-20261013
mkdir -p "$owner"
wraps=exp,exp2,expf,exp2f,log,log2,logf,log2f,pow,powf,fcntl64,glob64
for target in x64-gnu arm64-gnu x64-musl arm64-musl; do
  arch=${target%-*}
  abi=${target##*-}
  machine=x86_64
  [[ $arch != arm64 ]] || machine=aarch64
  sysroot=/opt/linux-sysroot-glibc
  [[ $abi != musl ]] || sysroot=/opt/linux-sysroot-musl
  [[ $arch != arm64 ]] || sysroot+=-arm64
  gcc=("$sysroot/usr/lib/gcc/$machine-linux-$abi/"*)
  [[ ${#gcc[@]} == 1 && -d ${gcc[0]} ]]
  flags=(--target="$machine-linux-$abi" --sysroot="$sysroot" --gcc-install-dir="${gcc[0]}" -O2 -fno-builtin -Wall -Wextra -Werror)
  # clang's GNU triple uses gnu, matching its canonical toolchain owner.
  link=()
  if [[ $abi == gnu ]]; then
    timeout 20 /usr/lib/llvm-23/bin/clang "${flags[@]}" -fPIC -c /home/ubuntu/build/tmp/media-sdk-glibc.c -o "$owner/$target.o"
    link+=("$owner/$target.o")
    IFS=, read -ra symbols <<< "$wraps"
    for symbol in "${symbols[@]}"; do link+=("-Wl,--wrap=$symbol"); done
  fi
  timeout 20 /usr/lib/llvm-23/bin/clang "${flags[@]}" -fuse-ld=lld -static-libgcc /home/ubuntu/build/tmp/media-sdk-abi-probe.c "${link[@]}" -lm -o "$owner/$target"
  if [[ $arch == arm64 ]]; then
    timeout 20 qemu-aarch64 -L "$sysroot" "$owner/$target" > "$owner/$target.log"
  elif [[ $abi == musl ]]; then
    timeout 20 "$sysroot/lib/ld-musl-x86_64.so.1" --library-path "$sysroot/lib:$sysroot/usr/lib" "$owner/$target" > "$owner/$target.log"
  else
    timeout 20 "$owner/$target" > "$owner/$target.log"
  fi
  /usr/lib/llvm-23/bin/llvm-readelf --version-info "$owner/$target" > "$owner/$target.versions.txt"
  printf '%s ' "$target"
  cat "$owner/$target.log"
done
