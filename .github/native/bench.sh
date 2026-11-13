#!/usr/bin/env bash
# Non-regression bench: same runner, same inputs, every binary in turn.
# Usage: bunx/bench.sh <out.md> name=/path/to/bun ...
set -uo pipefail
out=$1; shift
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cp -r "$here/fixtures/." "$work/"
cd "$work"

declare -a names bins
for kv in "$@"; do names+=("${kv%%=*}"); bins+=("${kv#*=}"); done

hf() { # label, then one command per binary (with {B})
  local label=$1 tpl=$2; shift 2
  local args=()
  for i in "${!bins[@]}"; do args+=(-n "${names[$i]}" "${tpl//\{B\}/${bins[$i]}}"); done
  hyperfine -N --warmup 3 --runs "${RUNS:-30}" "$@" --export-markdown "hf-$label.md" "${args[@]}" > /dev/null 2>&1 \
    || hyperfine --warmup 3 --runs "${RUNS:-30}" "$@" --export-markdown "hf-$label.md" "${args[@]}" > /dev/null
  { echo "### $label"; echo; cat "hf-$label.md"; echo; } >> "$out"
}

{
  echo "## Runner"; echo; echo '```'; uname -srm; nproc; free -m | head -2; date -u +%FT%TZ; echo '```'; echo
  echo "## Binaries"; echo; echo "| name | version | revision | size (bytes) | linkage |"; echo "|---|---|---|---|---|"
  for i in "${!bins[@]}"; do
    b=${bins[$i]}
    echo "| ${names[$i]} | $($b --version) | $($b --revision 2>/dev/null) | $(stat -c %s "$b") | $(file -b "$b" | sed 's/, BuildID.*//' | cut -c1-90) |"
  done
  echo
} >> "$out"

hf startup-e "{B} -e 0"
hf startup-version "{B} --version"
hf shell "{B} shell.ts"
hf ffi "{B} ffi.ts"
hf test-runner "{B} test ./runner.test.ts" -i
RUNS=10 hf install-warm "{B} install --frozen-lockfile=false" --prepare "rm -rf node_modules"

# HTTP: Bun.serve hello world, oha load for 10 s, requests/s.
{ echo "### http (Bun.serve, oha -z 10s -c 64)"; echo; echo "| name | req/s | p99 ms |"; echo "|---|---|---|"; } >> "$out"
for i in "${!bins[@]}"; do
  "${bins[$i]}" serve.ts & pid=$!
  for _ in $(seq 50); do curl -sf localhost:3901 > /dev/null && break; sleep 0.1; done
  oha -z 10s -c 64 --no-tui -j http://localhost:3901/ > oha.json 2>/dev/null
  kill $pid; wait $pid 2>/dev/null
  echo "| ${names[$i]} | $(jq -r '.summary.requestsPerSec|floor' oha.json) | $(jq -r '.latencyPercentiles.p99*1000|.*100|floor/100' oha.json) |" >> "$out"
done
echo >> "$out"
