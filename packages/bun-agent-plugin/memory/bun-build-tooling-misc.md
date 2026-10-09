---
name: bun-build-tooling-misc
description: "Bun auxiliary tooling — misctools (lldb printers, completions, unicode tables), bench/, packages/, tools/hawk, and the scripts/ helpers (orderfile, verify-baseline, binary-size, debug-coredump, gamble, trace, sync-*, update-*)"
metadata:
 type: reference
---

# Auxiliary tooling (outside the main build)

Main build: `bun-build-commands`, `bun-build-system-internals`. CI wiring of these scripts: `bun-build-ci`. Lint tooling (hawk, mordant, jsc-exception-lint): `bun-build-lint-format`.

## misctools/ (own package.json: @unicode/unicode-{3.0.0,13.0.0,15.1.0}, semver — `bun install` inside misctools/ first)
- `lldb/`: `init.lldb` (ignores SIGPWR/SIGUSR1/SIGUSR2 used by JSC GC/signals, imports `lldb_webkit.py` + `bun_pretty_printer.py`). The printers cover bun.String, WTFStringImpl, ZigString (tagged pointer UTF8/Latin1/UTF16), BabyList, and WebKit types. Load with `lldb -s misctools/lldb/init.lldb` or `command source` (see the README).
- `generate-cli-completions.ts`: runs `--help` for every bun command (subcommands, aliases) → `completions/bun-cli.json`. `completions/bun.{bash,zsh,fish}` are hand-maintained and embedded compressed (codegen step `emitCompressedEmbeds`, see `bun-build-codegen`).
- `generate-add-completions.ts`: package-name letter-group table for `bun add` completion.
- `gen-unicode-table.ts`, `unicode-generator.ts`: identifier start/continue tables (ES5 / ESNext) for the lexer, a port of the Zig-era generator.
- `cold-jsc-start.cpp`: micro-benchmark of a bare JSC global object startup (`write` + eval only).

## bench/ (own package.json + bun.lock; root install does not cover it)
`cd bench && bun install && bun run <name>` (ffi, log, gzip, async, sqlite…). Override the binary with `BUN=path/to/bun` or `.env`. Uses mitata 1.0.20, benchmark, esbuild, @swc/core, fastify, react 19… Dirs per area: async, bundle, crypto, deepEqual, fetch, ffi, fs-cp, glob, grpc-server, gzip, http2, image, install, json5, module-loader, postgres, quic, snippets, sqlite, stress, websocket-server, xml, yaml, etc. `runner.mjs` is the shared runner. oxlint ignores bench/.
Rust micro-benches: `scripts/bench-json-rust.sh [--xml|--test]` = criterion `src/parsers/benches/{json,xml}_parse.rs`. It needs vendor/ populated, so run `bun bd` once first.

## packages/
@aphrody/bun-types (the .d.ts; test `bun test test/integration/bun-types/bun-types.test.ts`, no build needed), bun-error (overlay, esbuilt by codegen), @aphrody/bun-inspector-protocol / bun-inspector-frontend / @aphrody/bun-debug-adapter-protocol, bun-vscode, bun-release, bun-lambda, bun-usockets + bun-uws (uSockets/uWS C/C++ sources compiled into bun), bun-native-plugin-rs, bun-native-bundler-plugin-api, bun-build-mdx-rs, @aphrody/bun-plugin-svelte, @aphrody/bun-plugin-yaml, h3blast. CI: `.github/workflows/packages-ci.yml`.

## tools/
Only `tools/hawk/` (README + `analysis-root.patch` for the dead-public analysis; see `bun-build-lint-format`).

## scripts/ helpers (run with system `bun` unless noted)
| script | purpose |
|---|---|
| `orderfile/generate.ts` (`bun run orderfile`) | Linker symbol-order file for startup-hot functions. A breakpoint tracer (`functrace.c` injected into the process; `functrace-windows.c` as a debugger on Windows) records the first entry of each function over several workloads, one of them on a pty (`ptyrun.c`). Names are mapped through nm or the Windows link maps (`windows-symbols.ts`). This roughly halves resident text pages. CI step `<target>-trace-order`. |
| `verify-baseline.ts --binary … --arch … --emulator …` | Checks that a baseline binary uses no CPU instructions above its baseline: QEMU Nehalem (linux x64), Cortex-A53 (linux arm64), Intel SDE `-nhm` (windows x64). Static variant: `verify-baseline-static/`. |
| `binary-size.ts` | Stripped-size comparison of every release platform against the latest finished main build. A CI step; `[skip size]` / `[allow size]` tags. |
| `features.ts` | Writes `features.json` (crash_handler feature data) after a build; shipped in the profile zip. |
| `debug-coredump.ts -p <pid> -b <bun-profile.zip URL> -c <bun-cores.tar.gz.age URL> [-d lldb]` | Downloads a CI crash core and opens it in the debugger. |
| `gamble.ts <attempts> <timeoutSec> <cmd…>` | Reruns a command N times to measure how often it fails or hangs. |
| `splitting-fuzz.ts <bun> <graphs> [seed]` | Bundler chunk-splitting fuzz (`test/bundler/splitting-fuzz.ts`). |
| `trace.sh` | macOS: builds, signs with debug entitlements and runs bun-debug under Instruments. |
| `lldb-inline.sh <exe> [args]` | Builds `lldb-inline-tool.cpp` once and runs the exe under it (non-interactive backtraces). |
| `generate-perf-trace-events.sh` | Regenerates the perf-trace event list from `bun_core::perf::trace("…")` / `bun_perf::trace(PerfEvent::…)` call sites. |
| `generate-stringwidth-tables.mjs` | Regenerates `src/jsc/bindings/stringWidthTables.h` (grapheme, width and emoji classes). |
| `update-typescript-libs.ts [dir]` | Rebuilds `src/runtime/cli/typescript_libs.bin` (the lib.*.d.ts files `bun check` embeds), from the `typescript7` package in test/package.json by default. |
| `update-test-durations.mjs` | Regenerates `test/expected-durations.json` from Buildkite. runner.node.ts uses it to bin-pack `--max-shards`. |
| `update-parallel-allowlist.mjs` (`bun run ci:parallel-allowlist`) | Allowlist of test files that may run in parallel. |
| `update-sqlite-amalgamation.sh` | Bumps the in-tree sqlite amalgamation. |
| `sync-webkit-source.ts` (`bun run sync-webkit-source`) | Checks out the pinned WEBKIT_VERSION in a `vendor/WebKit` clone (you clone oven-sh/WebKit there first). |
| `sync-react-compiler.sh` | Diffs the in-tree React Compiler port (`src/react_compiler/`) against upstream facebook/react. |
| `prefetch-deps.ts` | Warms a read-only download cache (`BUN_BUILD_PREFETCH_DIR`) at CI image bake time. |
| `agent.ts`, `ci-image.ts`, `darwin-ci/` (tart / bare macOS agents), `ci-remap-server/`, `ci-log-phase.mjs`, `ci-slowest-tests.ts`, `github-metrics.ts`, `auto-close-duplicates.ts` | CI infrastructure, see `bun-build-ci`. |
| `glob-sources.ts <field>` | Source lists for the build (see `bun-build-codegen`). |
| `run-clang-format.sh`, `oxlint-plugins/`, `jsc-exception-lint/`, `rust-{check-all,miri,mordant}.ts` | Lint tooling, see `bun-build-lint-format`. |
