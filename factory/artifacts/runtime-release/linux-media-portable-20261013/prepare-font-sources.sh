#!/usr/bin/env bash
set -euo pipefail
artifacts=/home/ubuntu/builds/bun-os-factory/artifacts/media-sdk/dependency-sources
mkdir -p "$artifacts"
cd "$artifacts"
for spec in freetype:2.14.2+dfsg-1ubuntu0.2 harfbuzz:12.3.2-2 libass:1\:0.17.4-2 fribidi:1.0.16-5; do
  package=${spec%%:*}
  version=${spec#*:}
  owner=/home/ubuntu/src/$package
  [[ ! -e "$owner" ]] || { printf 'Source owner already exists: %s\n' "$owner" >&2; exit 1; }
  timeout 180 apt-get source --download-only --only-source "$package=$version"
  dsc=$(find . -maxdepth 1 -type f -name "${package}_*.dsc" -print)
  [[ -n "$dsc" && "$dsc" != *$'\n'* ]]
  timeout 120 dpkg-source -x "$dsc" "$owner"
  sha256sum "$dsc"
  printf 'SOURCE_READY %s %s\n' "$package" "$version"
done
