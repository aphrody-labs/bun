#!/usr/bin/env bash
# Installs the aphrody-labs/bun runtime from its GitHub releases.
#
#   curl -fsSL https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.sh | bash
#   ... | bash -s 1.4.3                       # newest aphrody.N build of upstream base 1.4.3
#   ... | bash -s aphrody-v1.4.3-aphrody.1    # exact release tag
#
# BUN_INSTALL (default ~/.bun) receives bin/bun and bin/bunx. APHRODY_BUN_REPO overrides the repository,
# GITHUB_TOKEN (or GH_TOKEN) authenticates the release lookup.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

version=${1:-latest}
variant=${2:-}
repo=${APHRODY_BUN_REPO:-aphrody-labs/bun}
install_dir=${BUN_INSTALL:-$HOME/.bun}
token=${GITHUB_TOKEN:-${GH_TOKEN:-}}

command -v curl >/dev/null || die "curl is required"
command -v unzip >/dev/null || die "unzip is required"

case "$(uname -ms)" in
  'Darwin arm64') target=darwin-aarch64 ;;
  'Darwin x86_64')
    [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]] || die "no darwin-x64 build; use an arm64 Mac"
    target=darwin-aarch64 ;;
  'Linux aarch64' | 'Linux arm64') target=linux-aarch64 ;;
  'Linux x86_64') target=linux-x64 ;;
  *) die "unsupported platform $(uname -ms) (Windows: install.ps1)" ;;
esac
if [[ $target = linux-* ]] && { [[ -f /etc/alpine-release ]] || ldd --version 2>&1 | grep -qi musl; }; then
  [[ -e /lib/ld-linux-x86-64.so.2 || -e /lib/ld-linux-aarch64.so.1 ]] ||
    die "musl system without glibc loader: apk add gcompat libstdc++ libgcc"
fi
exe=bun
if [[ $variant = debug-info || $variant = profile ]]; then target=$target-profile; exe=bun-profile; fi

api() {
  local args=(-fsSL -H 'Accept: application/vnd.github+json')
  [[ -n $token ]] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}" "https://api.github.com/repos/$repo/$1"
}

case "$version" in
  latest) tag=$(api releases/latest | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 || true) ;;
  aphrody-v*) tag=$version ;;
  *)
    version=${version#bun-}
    version=${version#v}
    [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be latest, X.Y.Z or aphrody-vX.Y.Z-aphrody.N"
    tag=$(api 'releases?per_page=100' | grep -o '"tag_name": *"aphrody-v'"$version"'-aphrody\.[0-9]*"' |
      cut -d'"' -f4 | sort -t. -k4 -n | tail -1 || true) ;;
esac
[[ -n ${tag:-} ]] || die "no $repo release for $version"

base="https://github.com/$repo/releases/download/$tag"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/bun.zip" "$base/bun-$target.zip" || die "download failed: $base/bun-$target.zip"
if curl -fsSL --retry 3 -o "$tmp/SHA256SUMS.txt" "$base/SHA256SUMS.txt"; then
  want=$(grep " bun-$target.zip\$" "$tmp/SHA256SUMS.txt" | cut -d' ' -f1)
  if command -v sha256sum >/dev/null; then got=$(sha256sum "$tmp/bun.zip" | cut -d' ' -f1)
  else got=$(shasum -a 256 "$tmp/bun.zip" | cut -d' ' -f1); fi
  [[ -n $want && $want = "$got" ]] || die "checksum mismatch for bun-$target.zip"
fi

unzip -oqd "$tmp" "$tmp/bun.zip"
mkdir -p "$install_dir/bin"
mv -f "$tmp/bun-$target/$exe" "$install_dir/bin/bun"
chmod +x "$install_dir/bin/bun"
ln -sf bun "$install_dir/bin/bunx"
revision=$("$install_dir/bin/bun" --revision) || die "$install_dir/bin/bun does not run on this system (glibc $(ldd --version 2>/dev/null | head -1 | grep -o '[0-9.]*$'))"
echo "Installed $tag ($revision) to $install_dir/bin/bun"
case ":$PATH:" in *":$install_dir/bin:"*) ;; *) echo "Add $install_dir/bin to PATH" ;; esac
