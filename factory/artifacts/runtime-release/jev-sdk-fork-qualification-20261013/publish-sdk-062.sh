#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/src/typesafe-sdk-js
export GIT_TERMINAL_PROMPT=0 OMP_NUM_THREADS=1
timeout 60 git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git diff --check
git add -- package.json package-lock.json bun.lock jsr.json src/version.ts scripts/publish-npm.mjs
git -c user.name=aphrody-dev -c user.email=contact@aphrody.com commit --only \
  -m 'Prepare Bun-qualified SDK 0.6.2 publication' -- \
  package.json package-lock.json bun.lock jsr.json src/version.ts scripts/publish-npm.mjs
timeout 60 git push origin HEAD:main
local=$(git rev-parse HEAD)
remote=$(timeout 30 git ls-remote origin refs/heads/main | cut -f1)
[[ $local == "$remote" ]]
printf 'SDK_062_SOURCE_PUSH_VERIFIED %s\n' "$local"
[[ $(timeout 15 /home/ubuntu/.bun/bin/bun pm whoami --registry=https://registry.npmjs.org/) == yohan971 ]]
mkdir -p release
[[ -z $(find release -maxdepth 1 -name '*.tgz' -print) ]]
timeout 30 taskset -c 2 /home/ubuntu/.bun/bin/bun pm pack --destination release --quiet --ignore-scripts
timeout 30 taskset -c 2 /home/ubuntu/.bun/bin/bun publish ./release/aphrody-typesafe-sdk-0.6.2.tgz --dry-run --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org/
timeout 90 taskset -c 2 /home/ubuntu/.bun/bin/bun --bun scripts/publish-npm.mjs
printf 'SDK_062_PUBLICATION_COMMAND_PASS\n'
