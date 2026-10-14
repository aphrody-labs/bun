#!/usr/bin/env bash
set -euo pipefail
export OMP_NUM_THREADS=2
exec 9>/home/ubuntu/build/locks/heavy.lock
flock -n 9 || exit 75
source=/home/ubuntu/src/ffmpeg
pin=7e93014c5bbb61e7c22afebb478bf92f7a08d59a
if [[ ! -e "$source" ]]; then
  git init "$source"
  git -C "$source" remote add origin https://github.com/FFmpeg/FFmpeg
  timeout 180 git -c pack.threads=2 -C "$source" fetch --depth=1 origin "$pin"
  git -C "$source" checkout --detach FETCH_HEAD
fi
[[ $(git -C "$source" rev-parse HEAD) == "$pin" ]]
[[ -z $(git -C "$source" status --porcelain) ]]
git -C "$source" rev-parse HEAD HEAD^{tree}
sha256sum "$source"/configure "$source"/COPYING.LGPLv2.1 "$source"/COPYING.LGPLv3
