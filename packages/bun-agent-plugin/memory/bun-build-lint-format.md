---
name: bun-build-lint-format
description: "Rust workspace layout (Cargo.toml, rust-toolchain, profiles, workspace lints, clippy.toml bans), rustfmt, mordant, hawk, miri, rust:check-all, oxlint, prettier, clang-format, source-lints"
metadata:
 type: reference
---

# Rust workspace, lints and formatters

CI jobs running these: `bun-build-ci`. Build integration of Rust: `bun-build-system-internals`.

## Cargo workspace (`<bun>\Cargo.toml`, 455 lines)
- `resolver = "2"`, ~103 members all under `src/` (e.g. src/runtime = `bun_runtime` root crate, src/jsc, src/bun_core, src/sys, src/install, src/install/windows-shim, src/bundler, src/js_parser, src/css, src/sema{,/baselines,/driver,/standalone}, src/*_sys, src/*_jsc …). `exclude = ["vendor"]`; `lol_html = { path = "vendor/lolhtml" }`, `rust-argon2 = { path = "vendor/rust-argon2" }` are non-member path deps.
- `[workspace.package] edition = "2024"`. Crates named `bun_<dir>`; `[workspace.dependencies]` lists each internal crate by path plus 3rd-party (hashbrown 0.15 w/ allocator-api2, bstr, libc, rustix 0.38, bitflags, thiserror 2, smallvec, strum, enumset, encoding_rs, bcrypt, getrandom …).
- Profiles: `release` {lto="off", codegen-units=1, debug="line-tables-only", strip="none", panic="abort"} (LTO is done by the final lld link via `-C linker-plugin-lto`); `dev` {panic="abort", split-debuginfo="unpacked"}; `release-profiling`; `shim` (windows-shim: opt-level z, lto=true, strip symbols, debug-assertions/overflow-checks false).
- `rust-toolchain.toml`: `channel = "nightly-2026-09-15"`, components rust-src, rustfmt, clippy, miri, llvm-tools; targets: {aarch64,x86_64}-unknown-linux-{gnu,musl}, {aarch64,x86_64}-linux-android, x86_64-unknown-freebsd, {aarch64,x86_64}-apple-darwin, {aarch64,x86_64}-pc-windows-msvc. Must move together with `pins.rust` in ci-images/spec.ts, `RUSTUP_TOOLCHAIN` in `.github/workflows/format.yml` and `rust-lints.yml`, and pins.llvm (same LLVM major). Bump checklist in `.github/workflows/CLAUDE.md`.

## Workspace lints (every warning is an error)
`[workspace.lints.rust]`: `warnings = deny`, `dead_code`, `unreachable_pub` (non-imported `pub` must be `pub(crate)`), unused_* , unreachable_code/patterns = deny; `unexpected_cfgs` registers `bun_asan`, `bun_debug`, `socket_fault_injection`, `bun_sema_mimalloc`; `linker_messages = allow`.
`[workspace.lints.clippy]` deny highlights: ptr_as_ptr, ptr_cast_constness, ref_as_ptr, borrow_as_ptr (use `.cast`/`ptr::from_ref`), undocumented_unsafe_blocks (every `unsafe {}` needs `// SAFETY:`), mem_forget, redundant_clone, needless_pass_by_value, large_stack_frames, large_enum_variant, trivially_copy_pass_by_ref, clone_on_ref_ptr, todo/unimplemented/dbg_macro, vec_box/boxed_local (`#[expect]` with reason), disallowed_methods/types/macros. Many style lints allowed (Zig-port style: collapsible_if, too_many_arguments, needless_return, new_without_default, self_named_constructors …).

## clippy.toml bans (use the Bun equivalent)
- std::fs::* (read, write, read_to_string, remove_file, create_dir*, metadata, rename, read_dir, read_link, …) → `bun_sys::file` / `bun_sys::dir`; `canonicalize` → `bun_paths`. Skill `rust-system-calls`.
- `std::env::var[_os]` → `bun_core::env_var`; `std::thread::spawn` → `bun_threading::spawn_named` / ThreadPool; `std::mem::zeroed` → MaybeUninit.
- `String::from_utf8[_lossy]` → keep bytes (`bstr::BStr` for display, `bun_core::String::clone_utf8` for JS).
- All str/bstr/memchr substring & byte searches (`str::find/contains/split/lines/replace`, `slice::windows`, `memchr::*`, `bstr::ByteSlice::find*`) → `bun_core::strings::{index_of, index_of_char, index_of_any, last_index_of, contains, split, split_once, replace_owned}` (highway SIMD). Element-generic forms covered by `test/internal/source-lints/byte-search.test.ts`.
- `bun_core::output::pretty_fmt_rt/pretty/prettyln/warn…` runtime fns → macros `pretty!`, `prettyln!`, `pretty_errorln!`, `warn!`, `pretty_fmt!`.
- Types: std/parking_lot Mutex/RwLock → `bun_threading::{Mutex,RwLock}`; std HashMap/HashSet → `bun_collections` (wyhash); `std::fs::File` → `bun_sys::File`; `std::process::Command` → `bun_core::util::spawn_sync_inherit` / `bun_spawn_sys`; `std::backtrace::Backtrace` → `bun_core::dump_current_stack_trace`.
- Macros: println!/eprintln!/print!/eprint! → `bun_core::output`; dbg! banned.
- Thresholds: pass-by-value 64, stack-size 131072, enum-variant-size 128, too-large-for-stack 4096. build.rs files `#![allow(clippy::disallowed_*)]`.

## Rust tooling scripts
- `bun run rust:check` (host), `bun run rust:check-all [triples…]` (`scripts/rust-check-all.ts`: `cargo check --workspace --keep-going --target <t>` per `allRustTargets`; skips triples whose std isn't installed and prints the `rustup target add` line; Tier 3 adds `-Zbuild-std=…`). Needed after any `#[cfg]`-gated change (cfg'd code isn't type-checked otherwise).
- Plain cargo needs generated files: run `bun bd` first (or set `BUN_CODEGEN_DIR`).
- `bun run rust:clippy` = `cargo clippy --workspace --no-deps --keep-going`.
- `bun run rust:miri` (`scripts/rust-miri.ts`): `cargo miri test` with `-Zmiri-tree-borrows` over a curated crate list; `-p <crate>` passes through.
- `bun run rust:mordant` (`scripts/rust-mordant.ts`): `cargo mordant` (github scarletindustries/mordant, toolchain `MORDANT_TOOLCHAIN` in `.github/workflows/rust-lints.yml`) over x86_64-linux-gnu + x86_64-pc-windows-msvc + aarch64-apple-darwin, `RUSTFLAGS=-A unknown_lints`. Config `mordant.toml` (ratchet `baseline = "mordant-baseline.toml"`, disabled: wildcard_over_own_enum, bool_cluster, stale_safety_comment, unread_error_variant, runtime_typestate). PR fails only if it adds findings; regenerate with `bun run rust:mordant:baseline`.
- hawk (`hawk.toml`, `tools/hawk/README.md`, `tools/hawk/analysis-root.patch`): astral-sh/hawk cross-crate dead-public analysis over release × 11 targets; root = throwaway `bun_hawk_root` bin (apply patch, `fn main{}` in src/runtime/hawk_root.rs, `BUN_CODEGEN_DIR=$PWD/build/debug/codegen cargo hawk check …`, then revert). ` comment = "HOST_EXPORT("`; overrides for enum variants that are external code tables.
- `rustfmt.toml`: only `ignore = ["/vendor", "/test", "/build"]`; `bun run fmt:rust` = `cargo fmt --all`.

## JS/TS/C++ lint & format
- oxlint 1.70.0: `oxlint.json` (categories correctness=error; jsPlugins `scripts/oxlint-plugins/bun.js`, tested by `test/internal/oxlint-plugin-bun.test.ts`; ignores vendor, build, bench, verbatim Node ports like src/js/node/repl.js, readline*). `bun run lint` = `oxlint --config=oxlint.json --format=github src/js`. User preference: run via `bun $(which oxlint)`.
- Prettier 3.6.2 + prettier-plugin-organize-imports: `.prettierrc` (printWidth 120, arrowParens avoid, trailingComma all, quoteProps preserve; md printWidth 80). `bun run prettier` formats scripts packages src docs + test/**/*.test.*.
- clang-format: `scripts/run-clang-format.sh format|check|diff` requires `clang-format-23` (`LLVM_VERSION_MAJOR` override); file list from `bun scripts/glob-sources.ts cxx` + headers, excludes napi, libuv, sqlite, ffi headers, vendor.
- TypeScript 6.0.2: `bun run typecheck`; src/js typecheck needs `bun run build:types` first.
- Source lints: `bun test test/internal/source-lints/` (≈38 tests: byte-search, workspace-lints, ci-image-pins, host-export-callers, no-std-stdio, comment-cop, port-era-markers, webkit-prebuilt-url, windows-cross-config, …; README/CLAUDE.md inside). Runs with system bun (no native build needed).
- jsc exception-scope lint: `scripts/jsc-exception-lint/` (run.ts, clang tool cpp, nothrow.txt, rust-externs.ts); runtime check `BUN_JSC_validateExceptionChecks=1 BUN_JSC_dumpSimulatedThrows=1 bun bd …`.
