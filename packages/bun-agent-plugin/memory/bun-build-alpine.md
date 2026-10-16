---
name: bun-build-alpine
description: "Bun OS native Linux build owners, GNU and musl targets, pinned toolchains and separate release gates"
metadata:
  type: reference
---

# Bun OS Linux builds

Read the selected source revision before using a build recipe. Toolchain and
image versions come from `rust-toolchain.toml`, `scripts/build/ci-images/spec.ts`
and the relevant Dockerfiles; historical version notes are not current pins.

`scripts/aphrody/tmux.ts` owns the existing Linux/container runner.
`scripts/build/config.ts` selects target ABI and sanitizer configuration;
`scripts/build/deps/webkit.ts` owns the corresponding native WebKit input.
Use the existing owner and cache, with one heavy build per host and the owner's
CPU/memory limits. Never start WSL for workstation builds.

GNU and musl are distinct targets. Inspect the explicit target and SDK source,
native library dependencies and libc/symbol requirements. A successful build
on a recent host does not qualify an older libc deployment floor.

Stage each target with the canonical release/media owners and retain hashes
and native receipts. Runtime behavior, media SDK closure, native ABI,
installation and archive consumption need separate gates on their actual
target. A target listed in the matrix is not a qualified release asset.

Related: `bun-os-runtime`, `bun-build-commands`, `bun-build-deps-vendor`.
