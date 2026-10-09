---
name: bun-build-ci
description: "Bun CI — Buildkite pipeline (.buildkite/ci.ts), build/test platforms, commit-subject tags, artifacts, test runner, ci:* / pr:comments scripts, GitHub Actions workflows"
metadata:
 type: reference
---

# CI (Buildkite + GitHub Actions)

Lint jobs detail: `bun-build-lint-format`. Build profiles: `bun-build-commands`.

## Buildkite pipeline
- Pipeline step command (set in the Buildkite UI) = `node .buildkite/ci.mjs`, which just `import "./ci.ts"`; `.buildkite/ci.ts` (≈1970 lines) generates and uploads the pipeline. Helpers: `scripts/buildkite.ts` (getCommit, isMainBranch, isPullRequest, isMergeQueue, startGroup, uploadArtifact…), `scripts/agent.ts`, `scripts/ci-image.ts`. Org/pipeline in `.bk.yaml` (org `bun`, pipeline `bun`). Hooks: `.buildkite/hooks/pre-exit`; scripts `.buildkite/scripts/sign-windows-artifacts.ps1`, `upload-release.sh`.
- **All build lanes share a debian-13 arm64 Linux host (getBuildArgs always passes --os/--arch[/--abi]), cross-compiling** darwin (xmac SDK + ld64.lld), Windows (clang-cl + xwin sysroot + lld-link), android (NDK), freebsd (base.txz). There is NO native Windows or macOS build lane: those fleets only test, sign and verify baseline.
- buildPlatforms: darwin aarch64/x64 (crossCompile), linux aarch64/x64 gnu, linux x64 asan, linux aarch64/x64 musl, linux aarch64/x64 android, freebsd x64/aarch64, windows x64/aarch64 (crossCompile). Windows x64 release uses ThinLTO + cross-language LTO; arm64 no LTO.
- testPlatforms: darwin aarch64 26 (latest) + 14 (previous), darwin x64 14; debian 13 aarch64/x64 + x64 asan; ubuntu 25.04 aarch64/x64; alpine 3.23 musl aarch64/x64; windows x64 2019 (oldest), windows aarch64 11.
- Build step `<target>-build-bun`: `node scripts/build.ts --profile=ci-build --os=<os> --arch=<arch> [--abi=gnu|musl|android] [--baseline=on] [--asan=on] [--canary=off]`, then packages/uploads zips (`scripts/build/ci.ts packageAndUpload`), uploads `timings-<step>.html`.
- Test step `<platform>-test-bun`: `./scripts/runner.node.ts --step=<target>-build-bun [--build-id=] [--include=…] [--exclude=integration/bun-types --exclude=internal/source-lints]`; Windows: `pwsh -NoProfile -File .\scripts\vs-shell.ps1 node .\scripts\runner.node.ts …`; darwin via `./scripts/runner.node.mjs` (tart host hook `scripts/darwin-ci/`). parallelism: darwin 2, windows 8, others 20, beta 1.
- Other steps: `<target>-verify-baseline` (`scripts/verify-baseline.ts`, emulator for no-AVX), `<target>-trace-order` (symbol order file, `scripts/orderfile/`), image `bake-image`/`wait-for-image` (`scripts/build/ci-images/spec.ts`, Packer for Windows, AMIs for Linux), `windows sign` (smctl, x64 only), `binary-size` (`scripts/binary-size.ts`), release.
- Commit-subject tags (BUILDKITE_MESSAGE = subject line only, not body): `[skip ci]`/`[no ci]`, `[skip build(s)]`/`[no builds]`/`[only tests]`, `[force builds]`, `[skip tests]`/`[no tests]`/`[only builds]`, `[skip size]`/`[skip size check]`/`[allow size]`, `[sign windows]`, `[release]`/`[build release]`/`[release build]` (non-canary). Manual UI builds get an options block step (Release / Release with Assertions / Release with ASAN / Debug profiles, platform selection).
- Artifacts (zip contract): `bun-<os>-<arch>[-musl][-baseline]-profile.zip` (bun-profile[.exe], features.json, linker map.pdb/.map on Windows.dSYM on mac, linker.order, testFFI), `bun-<triplet>.zip` (stripped bun, plain release only), `bun-<triplet>-asan.zip`. Test steps download `**` and pick any bun*.zip.
- Build failures: compiler errors parsed into annotations (`scripts/build/annotations.ts`); every build prints "Build timings" group.

## Local CI commands (need `bk` CLI + `BUILDKITE_API_TOKEN` read token; `gh` for PR targets)
```sh
bun run ci:errors [#PR|URL|branch|build#] # rendered failures, [new] vs [also on main]
bun run ci:status # job counts, failed jobs/tests so far
bun run ci:logs # save failed job logs to ./tmp/ci-<build>/
bun run ci:find # build number(s): bk job log <uuid> -b $(bun run ci:find)
bun run ci:watch # follow current branch's build
bun run ci:slowest # scripts/ci-slowest-tests.ts (skill: slowest-tests)
bun run ci:images [key] # generate image bake scripts to build/ci-images/<key>/
bun run ci:parallel-allowlist # node scripts/update-parallel-allowlist.mjs
```
`scripts/find-build.ts` also accepts `--branch`, `--state`, `--limit`, `--json`; fix it directly if output looks mis-parsed.
PR feedback: `bun run pr:comments [N|'#N'|URL] [--include-resolved] [--json]` (`scripts/pr-comments.ts`; uses gh `--paginate` + GraphQL reviewThreads; filters robobun/CodeRabbit noise). Use it instead of `gh pr view --comments`.
Branch names must start with `claude/` for CI (repo CLAUDE.md rule).

## Test runner (`scripts/runner.node.ts`)
`bun run test [filters]` = `node scripts/runner.node.ts --exec-path ./build/debug/bun-debug` — each test file in its own process. Options: `--node-tests`, `--exec-path`, `--step`, `--build-id`, `--bail`, `--shard`, `--max-shards`, `--include`, `--exclude`, `--quiet`, `--smoke`, `--vendor`, `--retries`, `--junit*`, `--coredump-upload`, `--parallel`, `--results-json`. For single files prefer `bun bd test <file>`.
`bunfig.toml`: `[test] root = "test"`, `preload = "./test/preload.ts"`; `[install] linker = "isolated"`, `globalStore = false`, `minimumReleaseAge = 259200` (3 days, excludes typescript). `bunfig.node-test.toml`: preload `test/js/node/harness.ts` + preload.ts, `auto = "disable"`.

## GitHub Actions (`.github/workflows/`, guide `.github/workflows/CLAUDE.md`)
- `format.yml` (name autofix.ci): runs `bun run codegen:string-maps` then prettier + clang-format-23 + `cargo fmt --all` in parallel; autofix.ci pushes fixes to the PR (run fails if it had something to push).
- `lint.yml`: `bun lint` (oxlint) + `bun run build:types` + typecheck of src/js.
- `rust-lints.yml` (workflow `RUSTUP_TOOLCHAIN` pinned): `cargo clippy` (`bun run rust:clippy`), `cargo check --workspace --all-targets --keep-going`, `cargo miri test` (`bun run rust:miri`), lol-html `cargo test`, `mordant` (`cargo +$MORDANT_TOOLCHAIN install --git scarletindustries/mordant --rev $MORDANT_REV`, `bun scripts/rust-mordant.ts`).
- `source-lints.yml`: `bun test test/internal/source-lints/`.
- `bun-types.yml`: `bun test test/integration/bun-types/bun-types.test.ts` (no native build needed).
- `update-<dep>.yml` (cares, hdrhistogram, highway, libarchive, libdeflate, lolhtml, lshpack, sqlite3, zstd, vendor): auto-bump dep commits.
- Others: release.yml, packages-ci.yml, freebsd-smoke.yml, deploy-site.yml, vscode-release.yml, comment-cop.yml, on-slop.yml, claude-dedupe-issues.yml, claude-find-issues-for-pr.yml, auto-label-claude-prs.yml, auto-close-duplicates.yml, close-linked-issues.yml, close-stale-robobun-prs.yml, cancel-buildkite-on-pr-close.yml, stale.yaml, auto-assign-types.yml.

## This fork
`<bun>`: origin = `github.com/aphrody-labs/bun` (fork), upstream = `oven-sh/bun` (merged periodically via `upstream/main`); git user aphrody-dev. `ci:*` scripts query oven-sh's Buildkite (org `bun`); fork pushes are not expected to have Buildkite builds (unverified). User rules: commit+push directly on finish, no AI attribution.
