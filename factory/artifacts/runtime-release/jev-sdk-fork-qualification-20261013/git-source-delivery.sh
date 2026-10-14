#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/src/typesafe-sdk-js
export GIT_TERMINAL_PROMPT=0
# Keep transport errors in the bounded task log, never expose credential values.
timeout 60 git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git diff --check
git add -- src/runtime.ts test/runtime.test.ts test/helpers.ts test/client.test.ts test/logging.test.ts scripts/check-package.mjs scripts/publish-npm.mjs
git -c user.name=aphrody-dev -c user.email=contact@aphrody.com commit --only \
  -m 'Qualify native runtime detection and headers under Bun' -- \
  src/runtime.ts test/runtime.test.ts test/helpers.ts test/client.test.ts test/logging.test.ts scripts/check-package.mjs scripts/publish-npm.mjs
timeout 60 git push origin HEAD:main
local=$(git rev-parse HEAD)
remote=$(timeout 30 git ls-remote origin refs/heads/main | cut -f1)
[[ $local == "$remote" ]]
printf 'SDK_SOURCE_PUSH_VERIFIED %s\n' "$local"
