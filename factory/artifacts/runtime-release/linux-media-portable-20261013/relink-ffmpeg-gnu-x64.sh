#!/usr/bin/env bash
set -euo pipefail
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
owner=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/ffmpeg-linux-x64-portable
wraps=exp,exp2,expf,exp2f,log,log2,logf,log2f,pow,powf,fcntl64,glob64
flags=
IFS=, read -ra symbols <<< "$wraps"
for symbol in "${symbols[@]}"; do flags+=" -Wl,--wrap=$symbol"; done
flags+=" -lm"
for library in avutil avcodec avformat avdevice avfilter swscale swresample; do flags+=" -Llib$library"; done
cd "$owner/build"
# Reuse compiled sources; only SDK link outputs need the ABI adapters.
changed=()
for library in avutil avcodec avformat avdevice avfilter swscale swresample; do
  changed+=("--assume-new=lib$library/lib$library.ver")
done
timeout 900 taskset -c 0,1 make -j2 "${changed[@]}" --assume-new=fftools/ffmpeg.o --assume-new=fftools/ffprobe.o \
  libavutil/libavutil.so libavcodec/libavcodec.so libavformat/libavformat.so libavdevice/libavdevice.so libavfilter/libavfilter.so libswscale/libswscale.so libswresample/libswresample.so ffmpeg ffprobe \
  "LDFLAGS=$(sed -n 's/^LDFLAGS=//p' ffbuild/config.mak) /home/ubuntu/build/tmp/media-sdk-glibc-x64.o$flags" \
  "EXTRALIBS-avutil=-lm -Wl,-Bstatic -latomic -Wl,-Bdynamic -pthread" \
  "EXTRALIBS-avcodec=-pthread -lm -Wl,-Bstatic -latomic -Wl,-Bdynamic" \
  "EXTRALIBS-avformat=-lm -Wl,-Bstatic -latomic -Wl,-Bdynamic" \
  "EXTRALIBS-avdevice=-lm -Wl,-Bstatic -latomic -Wl,-Bdynamic" \
  "EXTRALIBS-avfilter=-pthread -lm -Wl,-Bstatic -latomic -Wl,-Bdynamic" \
  "EXTRALIBS-swscale=-lm -Wl,-Bstatic -latomic -Wl,-Bdynamic" \
  "EXTRALIBS-swresample=-lm -Wl,-Bstatic -latomic -Wl,-Bdynamic"
timeout 180 make install
# shellcheck disable=SC2016
find "$owner/prefix/lib" -maxdepth 1 -type f -name '*.so*' -print0 | xargs -0 -r -n1 patchelf --set-rpath '$ORIGIN'
for program in ffmpeg ffprobe; do
  # shellcheck disable=SC2016
  patchelf --set-rpath '$ORIGIN/../lib' "$owner/prefix/bin/$program"
done
printf '%s\n' abi-relink-complete > "$owner/build-status.txt"
