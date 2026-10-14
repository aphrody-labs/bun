#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/src/typesafe-sdk-js
unset TYPESAFE_API_KEY TYPESAFE_BASE_URL TYPESAFE_MODEL TYPESAFE_DEFAULT_MODEL TYPESAFE_LOG_LEVEL TYPESAFE_API_KEY_FILE
export OMP_NUM_THREADS=1
for gate in lint typecheck check:version build; do
  printf 'SDK_GATE %s\n' "$gate"
  timeout 90 taskset -c 2 /home/ubuntu/.bun/bin/bun --bun run "$gate"
done
printf 'SDK_GATE distribution\n'
timeout 90 taskset -c 2 /home/ubuntu/.bun/bin/bun --bun node_modules/vitest/vitest.mjs run --config vitest.dist.config.ts --maxWorkers=1 --no-file-parallelism
printf 'SDK_GATE package\n'
timeout 90 taskset -c 2 /home/ubuntu/.bun/bin/bun --bun run check:package
printf 'SDK_CHECKS_PASS\n'
