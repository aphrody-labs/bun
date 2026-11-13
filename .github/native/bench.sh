#!/usr/bin/env bash
# Non-regression bench: same machine, same inputs, every binary in turn.
# Usage: bench.sh <out.md> name=/path/to/bun ...
# A binary that does not start here (e.g. a musl build on a glibc host) is listed and skipped.
# OHA=<path> enables the HTTP load test.
set -uo pipefail
out=$1; shift
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cp -r "$here/fixtures/." "$work/"
cd "$work"

declare -a names bins
{
  echo "## Runner"; echo; echo '```'; uname -srm; nproc; free -m | head -2; cat /etc/os-release 2>/dev/null | grep '^PRETTY'; date -u +%FT%TZ; echo '```'; echo
  echo "## Binaries"; echo; echo "| name | version | revision | size (bytes) | linkage |"; echo "|---|---|---|---|---|"
} >> "$out"
for kv in "$@"; do
  n=${kv%%=*}; b=${kv#*=}
  if v=$("$b" --version 2>/dev/null); then
    names+=("$n"); bins+=("$b")
    echo "| $n | $v | $("$b" --revision 2>/dev/null) | $(stat -c %s "$b") | $(file -b "$b" | sed 's/, BuildID.*//' | cut -c1-110) |" >> "$out"
  else
    echo "| $n | does not start here | | $(stat -c %s "$b" 2>/dev/null) | $(file -b "$b" | sed 's/, BuildID.*//' | cut -c1-110) |" >> "$out"
  fi
done
echo >> "$out"
[ ${#bins[@]} -gt 0 ] || exit 0

hf() { # label template [hyperfine args]
  local label=$1 tpl=$2; shift 2
  local args=()
  for i in "${!bins[@]}"; do args+=(-n "${names[$i]}" "${tpl//\{B\}/${bins[$i]}}"); done
  if hyperfine -N --warmup 3 --runs "${RUNS:-30}" "$@" --export-markdown "hf-$label.md" "${args[@]}" > "hf-$label.log" 2>&1; then
    { echo "### $label"; echo; cat "hf-$label.md"; echo; } >> "$out"
  else
    { echo "### $label"; echo; echo '```'; tail -5 "hf-$label.log"; echo '```'; echo; } >> "$out"
  fi
}

hf startup-e "{B} -e 0"
hf startup-version "{B} --version"
hf shell "{B} shell.ts"
hf ffi "{B} ffi.ts"
hf test-runner "{B} test ./runner.test.ts"
RUNS=10 hf install-warm "{B} install" --prepare "rm -rf node_modules bun.lock"

if [ -n "${OHA:-}" ]; then
  { echo "### http (Bun.serve, oha -z 10s -c 64)"; echo; echo "| name | req/s | p99 ms |"; echo "|---|---|---|"; } >> "$out"
  for i in "${!bins[@]}"; do
    "${bins[$i]}" serve.ts & pid=$!
    for _ in $(seq 50); do curl -sf localhost:3901 > /dev/null && break; sleep 0.1; done
    "$OHA" -z 10s -c 64 --no-tui --output-format json http://localhost:3901/ > oha.json 2>/dev/null
    kill $pid; wait $pid 2>/dev/null
    echo "| ${names[$i]} | $(jq -r '.summary.requestsPerSec|floor' oha.json) | $(jq -r '.latencyPercentiles.p99*100000|floor/100' oha.json) |" >> "$out"
  done
  echo >> "$out"
fi

# Upstream test subset, run from the checkout.
if [ -n "${TESTS_DIR:-}" ]; then
  { echo "### upstream tests (test/js/bun/shell, test/js/bun/ffi, test/js/bun/http/serve.test.ts, test/cli/run)"; echo; echo "| name | pass | fail | skip |"; echo "|---|---|---|---|"; } >> "$out"
  for i in "${!bins[@]}"; do
    log="$TESTS_DIR/t-${names[$i]}.log"
    (cd "$TESTS_DIR" && timeout 1800 "${bins[$i]}" test test/js/bun/shell test/js/bun/ffi test/js/bun/http/serve.test.ts test/cli/run > "$log" 2>&1) || true
    c() { grep -Eo "^ *[0-9]+ $1" "$log" | tail -1 | grep -Eo '[0-9]+' || echo "?"; }
    echo "| ${names[$i]} | $(c pass) | $(c fail) | $(c skip) |" >> "$out"
  done
  echo >> "$out"
fi
