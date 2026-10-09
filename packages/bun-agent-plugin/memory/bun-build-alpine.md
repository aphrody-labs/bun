---
name: bun-build-alpine
description: "Native Linux builds of the fork, Alpine 3.24 first (musl) + Ubuntu 26.04 — images, tmux runner flags, ASAN/musl, CI, release musl-primary"
metadata:
 type: project
---

Chantier N (2026-10-09, commit fd278401fca). Alpine = primary Linux target, Ubuntu 26.04 (glibc 2.43) must build too.

- Images: `scripts/aphrody/aphrody-alpine.Dockerfile` -> `ghcr.io/aphrody-labs/alpine` (remplace `aphrody/build-alpine:3.24` et `alpine.Dockerfile`); `scripts/aphrody/linux.Dockerfile` ->
 `aphrody/build-linux:26.04`. Build arg `RUST_CHANNEL` = channel of rust-toolchain.toml (nightly-2026-09-15).
 - LLVM must be 23.1.x (`pins.llvm` in scripts/build/ci-images/spec.ts; findLlvmTool rejects others, rustc LLVM major
 must equal clang's). Alpine 3.24 apk only has 22 -> `@edge` tag (edge/main) for llvm23/clang23/lld23/compiler-rt
 (23.1.3). Ubuntu: apt.llvm.org `llvm-toolchain-resolute-23` + sqv SHA-1 workaround (sequoia config to 2028).
 - Both carry nodejs (nektos/act runs JS actions with node inside the job image), go, nasm, perl, python3, bun 1.4.2.
- Runner `scripts/aphrody/tmux.ts run <job> --linux|--alpine|--ubuntu [--sync|--sync-head] [--volume v] [--cpus n]
 [--memory 6g] -- '<cmd>'`. --linux = Alpine. --sync: named volume `aphrody-src-<distro>`, fetches host HEAD then
 rsyncs working-tree changes (lists tmp/tmux/<job>.changed/.deleted); --sync-head = HEAD only (avoids other agents'
 WIP). Defaults 6 CPU / 6g, cap 10g. Cache volume `aphrody-build-cache-<distro>` at /root/.bun/build-cache. On
 Windows docker args are pwsh-quoted (psmux runs pwsh). Test: test/internal/aphrody-tmux.test.ts.
- scripts/build/config.ts: ASAN forced off on musl (compiler-rt has no musl ASAN, no `-musl-*-asan` WebKit prebuilt);
 ASAN default on for linux-gnu debug. Native Alpine: detectLinuxAbi reads /etc/alpine-release; no sysroot = native.
- WebKit prebuilt names: `bun-webkit-linux-<amd64|arm64>[-musl][-debug|-lto]`.
- CI: .github/workflows/aphrody-linux-build.yml (alpine-3.24/ubuntu-26.04 x x64/arm64, ubuntu-24.04-arm for arm64)
 build, scripts/aphrody/linux-smoke.sh <bun>, then bun bd test which/require/fetch. .actrc `-P alpine-3.24=...`.
- Release (owned by chantier B): aphrody-release.yml fails if a requested `-musl` asset is missing; notes list musl
 first. publish-runtime.ts launcher isMusl and install.sh already pick musl on Alpine, glibc otherwise.
 ci-images alpineRelease = 3.24; build-host.ts musl containers alpine:3.24.
- glibc audit of src/**: all glibc-only calls guarded (`__GNU_LIBRARY__`, `target_env = "gnu"`); nothing to fix.
- Status: native debug/release builds not yet run (user directive "no builds during work", 2026-10-09). Pending for
 main's single pass: `tmux.ts run bd-alpine-N --alpine --sync-head --cpus 8 --memory 10g -- 'bun install && bun run
 build'`, then same with --ubuntu.
- Gotcha: a fork Windows release once replaced ~/.bun/bin/bun.exe and segfaulted on named `node:fs` imports; fix in the fork and reinstall a fork release (`scripts/aphrody/install.ps1`), never upstream .
