#!/usr/bin/env bash
set -euo pipefail

cloudflare_env="${APHRODY_HOME:-$HOME/.aphrody}/config/cloudflare.env"
test -r "$cloudflare_env" || { echo "Missing protected Cloudflare environment: $cloudflare_env" >&2; return 1 2>/dev/null || exit 1; }
set -a
# shellcheck disable=SC1090
. "$cloudflare_env"
set +a

export SCCACHE_DIR="${SCCACHE_DIR:-$HOME/build/cache/sccache}"
export SCCACHE_CACHE_SIZE="${SCCACHE_CACHE_SIZE:-50G}"
export SCCACHE_BASEDIRS="${SCCACHE_BASEDIRS:-$HOME/src/bun:$HOME/src}"
export SCCACHE_IDLE_TIMEOUT=0
export SCCACHE_CLIENT_SIDE=1
export SCCACHE_MULTILEVEL_CHAIN=disk,s3
export SCCACHE_MULTILEVEL_WRITE_ERROR_POLICY=l0
export SCCACHE_BUCKET=aphrody-dist
export SCCACHE_ENDPOINT="$R2_ENDPOINT"
export SCCACHE_REGION=auto
export SCCACHE_S3_USE_SSL=true
export SCCACHE_S3_KEY_PREFIX=bun-v1
export RUSTC_WRAPPER="$(command -v sccache)"
