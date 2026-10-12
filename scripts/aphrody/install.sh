#!/usr/bin/env bash
# Installs the aphrody-labs/bun runtime from its releases, mirrored on https://dist.aphrody.app (Cloudflare R2), else GitHub.
#
#   curl -fsSL https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.sh | bash
#   ... | bash -s 1.4.4                       # exact stable release
#   ... | bash -s aphrody-v1.4.3-aphrody.1    # exact release tag
#
# BUN_INSTALL (default ~/.bun) receives bin/bun and bin/bunx. APHRODY_BUN_DIST overrides the mirror (empty: GitHub
# only), APHRODY_BUN_REPO the repository,
# GITHUB_TOKEN (or GH_TOKEN) enables authenticated downloads through an installed GitHub CLI.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

version=${1:-latest}
variant=${2:-${APHRODY_BUN_FLAVOR:-perf}}
repo=${APHRODY_BUN_REPO:-aphrody-labs/bun}
dist=${APHRODY_BUN_DIST-https://dist.aphrody.app/bun}
install_dir=${BUN_INSTALL:-$HOME/.bun}
token=${GITHUB_TOKEN:-${GH_TOKEN:-}}

command -v curl >/dev/null || die "curl is required"
command -v unzip >/dev/null || die "unzip is required"

case "$(uname -ms)" in
  'Darwin arm64') target=darwin-aarch64 ;;
  'Darwin x86_64')
    # Under Rosetta 2 the machine is arm64.
    if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]]; then target=darwin-aarch64; else target=darwin-x64; fi ;;
  'Linux aarch64' | 'Linux arm64') target=linux-aarch64 ;;
  'Linux x86_64') target=linux-x64 ;;
  *) die "unsupported platform $(uname -ms) (Windows: install.ps1)" ;;
esac
if [[ $target = linux-* ]] && { [[ -f /etc/alpine-release ]] || ldd --version 2>&1 | grep -qi musl; }; then
  target=$target-musl
fi
exe=bun
case "$variant" in
  perf) ;;
  full) target=$target-full ;;
  debug-info | profile) target=$target-profile; exe=bun-profile ;;
  *) die "variant must be perf, full, debug-info or profile" ;;
esac

api() {
  local args=(-fsSL -H 'Accept: application/vnd.github+json')
  [[ -n $token ]] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}" "https://api.github.com/repos/$repo/$1"
}

download() {
  local destination=$1 url=$2 asset=${2##*/} args=(-fsSL --retry 3)
  if [[ -n $token ]]; then
    command -v gh >/dev/null || die "authenticated release downloads require the GitHub CLI"
    [[ $asset =~ ^[a-zA-Z0-9.-]+$ ]] || die "invalid release asset name"
    url=$(GH_TOKEN="$token" gh api --hostname github.com "repos/$repo/releases/tags/$tag" --jq \
      "[.assets[] | select(.name == \"$asset\") | .url] | if length == 1 then .[0] else error(\"release asset must be unique\") end") \
      || die "release must contain exactly one asset named $asset"
    [[ $url == "https://api.github.com/repos/$repo/releases/assets/"* ]] || die "release asset URL does not belong to the selected repository"
    [[ ${url#"https://api.github.com/repos/$repo/releases/assets/"} =~ ^[0-9]+$ ]] || die "invalid release asset id"
    args+=(-H "Authorization: Bearer $token" -H 'Accept: application/octet-stream')
  fi
  curl "${args[@]}" -o "$destination" "$url"
}

case "$version" in
  # The repository also publishes other releases (tools, n2b): the newest runtime release, not GitHub's "latest".
  latest)
    [[ -z $dist ]] || tag=$(curl -fsSL --retry 2 "$dist/latest.json" 2>/dev/null | grep -oE '"tag": *"[^"]+"' | head -1 | cut -d'"' -f4 || true)
    [[ -n ${tag:-} ]] || tag=$(api 'releases?per_page=100' | grep -oE '"tag_name": *"(bun-v[0-9]+\.[0-9]+\.[0-9]+|aphrody-v[0-9]+\.[0-9]+\.[0-9]+-aphrody\.[0-9]+)"' |
      head -1 | cut -d'"' -f4 || true) ;;
  aphrody-v*) tag=$version ;;
  bun-v*) tag=$version ;;
  *)
    version=${version#bun-}
    version=${version#v}
    [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be latest, X.Y.Z or aphrody-vX.Y.Z-aphrody.N"
    tag=$(api "releases/tags/bun-v$version" 2>/dev/null | grep -o '"tag_name": *"bun-v'"$version"'"' | cut -d'"' -f4 || true)
    if [[ -z $tag ]]; then
      tag=$(api 'releases?per_page=100' | grep -o '"tag_name": *"aphrody-v'"$version"'-aphrody\.[0-9]*"' |
        cut -d'"' -f4 | sort -t. -k4 -n | tail -1 || true)
    fi ;;
esac
[[ -n ${tag:-} ]] || die "no $repo release for $version"

base="https://github.com/$repo/releases/download/$tag"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# The mirror holds the same bytes as the release; SHA256SUMS.txt below verifies whichever source answered.
if [[ -z $dist ]] || ! curl -fsSL --retry 2 -o "$tmp/bun.zip" "$dist/$tag/bun-$target.zip" 2>/dev/null ||
  ! curl -fsSL --retry 2 -o "$tmp/SHA256SUMS.txt" "$dist/$tag/SHA256SUMS.txt" 2>/dev/null; then
  download "$tmp/bun.zip" "$base/bun-$target.zip" || die "download failed: $base/bun-$target.zip"
  download "$tmp/SHA256SUMS.txt" "$base/SHA256SUMS.txt" || die "release checksums are required"
fi
want=$(awk -v asset="bun-$target.zip" '$2 == asset { print $1 }' "$tmp/SHA256SUMS.txt")
[[ $want =~ ^[[:xdigit:]]{64}$ ]] || die "release checksum must name the archive exactly once"
want=$(printf "%s" "$want" | tr '[:upper:]' '[:lower:]')
if command -v sha256sum >/dev/null; then got=$(sha256sum "$tmp/bun.zip" | cut -d' ' -f1)
else got=$(shasum -a 256 "$tmp/bun.zip" | cut -d' ' -f1); fi
[[ $want = "$got" ]] || die "checksum mismatch for bun-$target.zip (SHA256SUMS.txt: $want, downloaded: $got)"

unzip -oqd "$tmp" "$tmp/bun.zip"
candidate="$tmp/bun-$target/$exe"
chmod +x "$candidate"
revision=$("$candidate" --revision) || die "downloaded runtime does not run on this system"
"$candidate" -e 'if (Bun.resolveSync("picocolors", ".") !== "picocolors") process.exit(1)' || die "downloaded runtime is not the Aphrody fork"
expected_version=${tag#bun-v}
expected_version=${expected_version#aphrody-v}
actual_version=$("$candidate" --version) || die "downloaded runtime version could not be read"
[[ $actual_version = "$expected_version" ]] || die "downloaded runtime version does not match the selected release"
if [[ $variant = full ]]; then
  "$candidate" -e 'const m = await Bun.file(process.argv[1]).json(); if (m.flavor !== "full" || m.compiledFeatures?.coreutils !== true) process.exit(1)' "$tmp/bun-$target/release-flavor.json" \
    || die "full archive must contain its compiled feature manifest"
fi
mkdir -p "$install_dir/bin"
stage="$install_dir/bin/.bun-stage-$$"
backup="$install_dir/bin/.bun-backup-$$"
[[ ! -d "$install_dir/bin/bun" && ! -d "$install_dir/bin/bunx" ]] || die "runtime paths must not be directories"
[[ ! -e $stage && ! -L $stage && ! -e $backup && ! -L $backup ]] || die "installation staging paths already exist"
cp "$candidate" "$stage"
if [[ -e "$install_dir/bin/bun" || -L "$install_dir/bin/bun" ]]; then cp -Pp "$install_dir/bin/bun" "$backup"; fi
if ! mv -f "$stage" "$install_dir/bin/bun" || ! ln -sf bun "$install_dir/bin/bunx"; then
  if [[ -e $backup || -L $backup ]]; then mv -f "$backup" "$install_dir/bin/bun"; else rm -f "$install_dir/bin/bun"; fi
  rm -f "$stage"
  die "installation failed; the previous runtime was retained"
fi
rm -f "$backup"
echo "Installed $tag ($revision) to $install_dir/bin/bun"
case ":$PATH:" in *":$install_dir/bin:"*) ;; *) echo "Add $install_dir/bin to PATH" ;; esac
