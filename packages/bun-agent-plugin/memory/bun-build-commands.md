---
name: bun-build-commands
description: "How to build/run/test Bun from <bun> — package.json scripts, `bun bd` arg routing, profiles, build dirs, exe names, ninja passthrough, clean"
metadata:
  type: reference
---

# Bun build commands (verified 2026-10-08, repo version 1.4.3)

Entry point: `scripts/build.ts` (configure + run pinned ninja + optionally exec the binary).
Architecture: `bun-build-system-internals`. Codegen: `bun-build-codegen`. Windows: `bun-build-windows`.

## package.json scripts (root)

| script                                                                              | expands to                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bd`                                                                                | `BUN_DEBUG_QUIET_LOGS=1 bun scripts/build.ts --profile=debug --quiet`                        |
| `bd:v`                                                                              | same, not quiet                                                                              |
| `build` / `build:debug`                                                             | `bun scripts/build.ts --profile=debug`                                                       |
| `build:debug:noasan`                                                                | `--profile=debug-no-asan`                                                                    |
| `build:debug:fuzzilli`                                                              | `--profile=debug --fuzzilli=on --build-dir=build/debug-fuzz`                                 |
| `build:release`                                                                     | `--profile=release` (ThinLTO on)                                                             |
| `build:ci`                                                                          | `--profile=release --ci=on --buildkite=on --build-dir=build/release-ci`                      |
| `build:assert`                                                                      | `--profile=release-assertions --build-dir=build/release-assert`                              |
| `build:asan`                                                                        | `--profile=release-asan --build-dir=build/release-asan`                                      |
| `build:logs`                                                                        | `--profile=release --logs=on --build-dir=build/release-logs`                                 |
| `build:smol`                                                                        | `--profile=release --build-type=MinSizeRel --build-dir=build/release-smol`                   |
| `build:local`                                                                       | `--profile=debug-local --build-dir=build/debug-local` (local WebKit in vendor/WebKit)        |
| `build:release:local`                                                               | `--profile=release-local --build-dir=build/release-local`                                    |
| `build:types`                                                                       | `--mode=codegen --target=generated-types` (codegen only, no toolchain)                       |
| `jsc:build` / `jsc:build:debug` / `jsc:build:lto`                                   | build only `--target=WebKit` locally                                                         |
| `test`                                                                              | `node scripts/runner.node.ts --exec-path ./build/debug/bun-debug` (one process per file)     |
| `test:release`                                                                      | runner with `./build/release/bun`                                                            |
| `testleak`                                                                          | debug bun with `BUN_DESTRUCT_VM_ON_EXIT=1 ASAN_OPTIONS=detect_leaks=1` + `test/leaksan.supp` |
| `rust:check`                                                                        | `cargo check --workspace --keep-going`                                                       |
| `rust:check-all`                                                                    | `bun scripts/rust-check-all.ts` (all 11 triples)                                             |
| `rust:clippy`                                                                       | `cargo clippy --workspace --no-deps --keep-going`                                            |
| `rust:mordant[:baseline]`, `rust:miri`                                              | see `bun-build-lint-format`                                                                  |
| `watch` / `watch-windows`                                                           | `cargo watch -x 'check --workspace ...'` (windows: `--target x86_64-pc-windows-msvc`)        |
| `bun fmt`, `fmt:cpp` (=clang-format), `fmt:rust` (`cargo fmt --all`)                | native JS/TS formatting; separate C++ and Rust formatters                                    |
| `bun lint` / `bun lint --fix`                                                       | native lint with `--config oxlint.json`                                                      |
| `bun check`                                                                         | native type checking                                                                         |
| `bun n2b`                                                                           | native migration                                                                             |
| `codegen:string-maps` / `codegen:verify`                                            | regenerate/check in-tree `*.generated.rs`                                                    |
| `clean`                                                                             | `bun scripts/build/clean.ts [preset] [--dry-run]`                                            |
| `ci:*`, `pr:comments`                                                               | see `bun-build-ci`                                                                           |
| `node:test`, `node:test:cp`                                                         | Node's own test suite runner / fetch node test                                               |
| `orderfile`, `uv-posix-stubs`, `sync-webkit-source`, `run:linux` (docker dev image) | misc                                                                                         |

Qualify the four native commands against checkout changes through `bun bd check`, `bun bd lint`, `bun bd fmt` and `bun bd n2b`. No subprocess backend, standalone Oxc, tsgo/tsc or external n2b fallback is permitted. Package scripts may expose the native commands but must not replace them with wrappers; `bunx` is reserved for unrelated packages. Native Windows Cargo operations use `bun scripts/build/rust/cargo-serial.ts --msvc`; the Bun build schedules Rust crates through ninja.

## Plugins and add-on submodules

`bun bd --target=plugins` builds every mounted plugin (`scripts/build/plugins.ts`: one `cargo build --profile plugin` per plugin workspace, then a copy of `bun-<name>` next to bun). Plugins are optional submodules (`plugins/uv|vpn|ssh|docker|just|winmd`, `update = none`, repositories aphrody-labs/bun-<name>); unmounted ones are skipped. Mount with `git submodule update --init --checkout --recursive plugins/<name>` (`plugins/ssh` too for docker). `packages/bun-video` (aphrody-labs/bun-video) is mounted the same way. Skill `bun-add-ons`, page `docs/project/add-ons.mdx`.

## Arg routing (`parseArgs` in scripts/build.ts)

`bun scripts/build.ts [build-flags] [exec-args...]` — the FIRST arg that is not a recognized build/ninja flag starts exec-args; it and everything after go to the built binary.

- `-j<N> -k<N> -l<N> -v -n` and `-d <stats|explain|keepdepfile|keeprsp|nostatcache|list>` → ninja. (`-d K:V` that isn't a ninja mode goes to bun as `--define`.)
- `-t <tool> [args…]` → runs that ninja tool on the build dir as-is (no configure/build): `bun run build -t query <target>`, `-t deps <obj>`, `-t targets`, `-t commands`.
- `--configure-only`, `--quiet`, `--timings`, `--help` → build.ts.
- `--<field>=<v>` / `--<field> <v>` for every `PartialConfig` field (`configFlags`): os, arch, abi, buildType, mode, lto, pgoGenerate, pgoUse, asan, assertions, logs, baseline, canary, staticSqlite, staticLibatomic, tinycc, valgrind, fuzzilli, socketFaultInjection, unifiedSources, archiveDeps, timeTrace, ci, buildkite, webkit, localDeps, packageManager, buildDir, cacheDir, androidNdk, androidApiLevel, freebsdSysroot, freebsdVersion, linuxSysroot, macosSdk, osxDeploymentTarget, winsysroot, nodejsVersion, nodejsAbiVersion, nodejsV8Version, webkitVersion. Kebab-case accepted (`--build-dir`, `--local-deps`). Booleans: on/off, true/false, yes/no, 1/0.
- `--profile=<name>` (default `debug`), `--target=<ninja-target>` (repeatable).
- Unknown `--foo=` → error (typo check). `--` forces the cutoff.
- Build flags must precede exec args: `bun bd --asan=off test foo.ts` OK; `bun bd test --asan=off foo.ts` sends the flag to bun-debug. Collision: `bun bd -- --target=browser x.ts`.
- With exec args present (or `--quiet`), build output is captured and only dumped on failure (not with -n/-d/-v). Without exec args: prints `[build] done`.
- The exec'd binary is the linked unstripped one (`bun-debug` / `bun-profile`); signals are re-raised.

## Profiles (`scripts/build/profiles.ts`)

`debug` (Debug, prebuilt WebKit; default), `debug-local`, `debug-no-asan`, `release` (LTO on), `release-local` (lto off), `release-assertions` (RelWithDebInfo + assertions + logs), `release-asan` (asan+assertions), `ci-build` (Release, ci, buildkite), cross: `android`, `android-release`, `freebsd`, `freebsd-arm64`, `freebsd-release`, `windows-x64`, `windows-arm64`, `windows-x64-release`, `windows-arm64-release`. Retired: `btg`, `ci-release` (error with replacement hint).

Defaults resolved in `scripts/build/config.ts`:

- ASAN default = debug && (linux || darwin arm64) → **off on Windows**; forced off for android, freebsd, darwin-cross, windows-cross.
- assertions default = debug || asan. logs default = debug. baseline default = x64 (sic: `partial.baseline ?? x64`).
- LTO default = release && !assertions && !asan; forced off for asan, android, freebsd, windows arm64.
- staticSqlite default = !darwin. tinycc off on android/freebsd. socketFaultInjection = asan. canary default true.
- clang LLVM major must equal rustc LLVM major (pins.llvm 23.1.1 ↔ nightly in rust-toolchain.toml).

## Output paths

- Build dir: `build/<debug|release|release-asan|release-assertions>` + `-windows-<arch>` for cross-Windows + `-codegen` for mode=codegen; `--build-dir` overrides.
- Exe (`bunExeName`): `bun-debug`, `bun-asan`, `bun-valgrind`, `bun-asan-valgrind`, `bun-assertions`, plain release `bun-profile` + stripped `bun` (only plain release strips). `.exe` on Windows.
- `<buildDir>/codegen/` generated sources; `build/types/` shared .d.ts (all profiles); `<buildDir>/rust-target/` Rust plan/units/rlibs; `<buildDir>/obj`, `pch`, `deps`, `unified`, `toolchain-identity/`, `configure.json` (`{profile, overrides}`), `build.ninja`, `compile_commands.json` (clangd reads `build/debug`).
- Debug runtime loads built-in JS from `<buildDir>/js` (`BUN_DYNAMIC_JS_LOAD_PATH`), so JS-only edits need just `bun run build` (codegen re-runs, little/no relink).
- Machine-shared cache: `$BUN_BUILD_CACHE_DIR` else `$BUN_INSTALL/build-cache` (`~/.bun/build-cache`): tarballs, prebuilt WebKit (`webkit-<ver16>[-arch]-debug|-lto[-asan]`), nodejs-headers, ccache, cargo. CI uses `<buildDir>/cache`. Don't nuke cache to debug — content-addressed.

## Useful invocations

```sh
bun bd # debug build only
bun bd test test/js/bun/http/serve.test.ts -t "name" # build + run test with debug bun
bun bd --asan=off test foo.test.ts
bun run build --target=bun-rust # only Rust; also: check, bun, <dep>, clone-<dep>, configure-<dep>, codegen, generated-types
bun run build -n -d explain # why would things rebuild
bun run build --timings # report + <buildDir>/timings.html
bun scripts/build.ts --configure-only # regenerate build.ninja only
bun bd --local-deps=mimalloc=~/code/mimalloc test x.ts
bun run clean [debug|release|debug-local|release-local|rust|cpp|cache|...] --dry-run
```

`clean` presets (scripts/build/clean.ts): per-profile dirs, `rust` (all `rust-target`, cache/cargo, root `target/`), `cpp` (obj+pch), `cache` (shared cache), `deep` (whole `build/`, `target/`, and every `vendor/<dep>` except user-managed WebKit). Default preset (no arg) = `debug` (removes build/debug!).

Never run two builds of the same build dir concurrently (rustc edges delete old .rlib). Always go through build.ts, never bare `ninja` (pinned oven-sh/ninja; other versions rewrite `.ninja_log`).
