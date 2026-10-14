#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/src/typesafe-sdk-js
unset TYPESAFE_API_KEY TYPESAFE_BASE_URL TYPESAFE_MODEL TYPESAFE_DEFAULT_MODEL TYPESAFE_LOG_LEVEL TYPESAFE_API_KEY_FILE
export OMP_NUM_THREADS=1
timeout 120 taskset -c 2 /home/ubuntu/.bun/bin/bun --bun node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1 --no-file-parallelism
