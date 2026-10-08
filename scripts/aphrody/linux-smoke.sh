#!/usr/bin/env bash
# Smoke test of a Bun binary built natively on Linux (Alpine or Ubuntu):
# version, eval, a node: builtin, Bun.serve on port 0, and an offline
# `bun install` of a local package.
#
#   scripts/aphrody/linux-smoke.sh build/debug/bun-debug
set -euo pipefail

bun=$(realpath "${1:?usage: linux-smoke.sh <bun binary>}")
export BUN_DEBUG_QUIET_LOGS=1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

step() { printf '== %s\n' "$*"; }

step version
"$bun" --version
"$bun" --revision
ldd "$bun" 2>&1 | sed 's/^/   /' || true

step eval
[[ $("$bun" -e 'console.log(1 + 1)') = 2 ]]

step node:path
[[ $("$bun" -e 'const p = await import("node:path"); console.log(p.join("a", "b"))') = a/b ]]

step node:fs
[[ $("$bun" -e 'import { existsSync } from "node:fs"; console.log(existsSync("/"))') = true ]]

step Bun.serve
"$bun" -e '
  using server = Bun.serve({ port: 0, fetch: () => new Response("pong") });
  const text = await (await fetch(server.url)).text();
  if (text !== "pong") throw new Error(`got ${text}`);
  console.log(`served on port ${server.port}`);
'

step "bun install (offline, local package)"
mkdir -p "$tmp/dep" "$tmp/app"
echo '{"name":"local-dep","version":"1.0.0","main":"index.js"}' > "$tmp/dep/package.json"
echo 'module.exports = "local-dep ok";' > "$tmp/dep/index.js"
echo '{"name":"app","dependencies":{"local-dep":"file:../dep"}}' > "$tmp/app/package.json"
(cd "$tmp/app" && "$bun" install --no-save --cache-dir "$tmp/cache" --registry http://127.0.0.1:9/ \
  && [[ $("$bun" -e 'console.log(require("local-dep"))') = "local-dep ok" ]])

echo "smoke ok: $("$bun" --revision)"
