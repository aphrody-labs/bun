---
name: bun-build-system-internals
description: "Architecture of scripts/build/** (TS → build.ninja): phases, module inventory, Rust-per-crate ninja graph, flags tables, toolchain checks, how to add a flag/profile/config field/rule/workaround"
metadata:
 type: reference
---

# scripts/build internals (source of truth: `scripts/build/CLAUDE.md`, 328 lines)

The TS scripts DESCRIBE the build and emit `build/<profile>/build.ninja`; ninja PERFORMS it. Commands: `bun-build-commands`. Codegen steps: `bun-build-codegen`. Deps: `bun-build-deps-vendor`.

## Principles
- Configure ALWAYS runs on every `bun run build` (~200 ms); `writeIfChanged` keeps mtimes so ninja sees no change. `restat = 1` on fetch/codegen/dep rules prunes downstream. A `regen` generator rule re-runs configure (`--config-file=<buildDir>/configure.json`) when a build script changes.
- One flat `Config` struct resolved once in `resolveConfig` (`config.ts`); one flat table per flag category in `flags.ts` (`{flag, when: c => ..., desc, lang?}`): `cpuTargetFlags`, `globalFlags`, `bunOnlyFlags`, `linkFlags`, `stripFlags`. Grep the flag text to find why it's set.
- Configure-time must not compile or compare mtimes (spawnSync only for probing: `clang --version`, git rev, xcrun). Anything that produces files = ninja edge.
- Runs under Node 25+ too (`cfg.jsRuntime` = bun execPath or `node --experimental-strip-types`). CI runs `node scripts/build.ts`.

## Phases
0. `scripts/build.ts`: Windows → MSVC env loaded natively by `loadNativeMsvcEnv` / `bun msvc sync` (was a vs-shell.ps1 re-exec before 57752e1611c). Parse args. `maybeBypassProxyForCratesIo` (adds crates.io to NO_PROXY if a proxy is set and direct works).
1. `configure.ts::configure`: `resolveToolchain` (clang/ar/lld/strip/cmake/cargo/bun/esbuild; `findLlvmTool` accepts only pinned LLVM series) → `resolveConfig` → `validateBunConfig` + `checkWorkarounds` → `generateCargoConfig` writes git-ignored `.cargo/config.toml` (per-target linker; advisory for direct cargo/rust-analyzer) → `globAllSources` (`scripts/glob-sources.ts`) → `new Ninja` + `registerAllRules` (`rules.ts`) → `emitBun` → `emitGeneratorRule` → `n.write` (+ `compile_commands.json`, `ninja -t restat`) → `mkdirAll`.
2. `bun.ts::emitBun` (mode full): codegen (`emitCodegen`) → Rust (`emitRust`) → deps (`resolveDep` per `allDeps`) → `computeFlags` → PCH (`root-pch.h`) → cc/cxx per source (`compile.ts`; unified sources via `unified.ts`) → `emitShims` + `link` → strip (plain release) / dsymutil (darwin release) → validations: `<exe> --revision` smoke (only when host can run target), `verify-binary.ts binary` (exports, NEEDED/DLL set, glibc ceilings, static-init allowlist, hardening; expectations in `binary-expectations.ts`, serialized to `<exe>.verify.json`) and `verify-binary.ts duplicates`. Only CI fails on findings; local + ASan + debug pass `--warn-only` (`binaryChecksWarnOnly`). Markers: `bun-debug.smoke-test-passed`, `.binary-verified`, `.duplicate-symbols-checked`.
3. Execute: local spawns ninja with FD 3 dup'd to stderr (`stream.ts` sideband for live dep/cargo output when interactive). CI: `spawnWithAnnotations` (compiler errors → Buildkite annotations), order-file inherit, timings, `packageAndUpload`.

`mode: "codegen"` (`--mode=codegen`): `configureCodegen` / `resolveCodegenConfig` / `CodegenFields` Pick; only bun + esbuild + perl needed; build dir `build/debug-codegen`; default target `codegen`.

## Rust in the ninja graph (`rust.ts`, `rust/*.ts`)
- No `cargo build`. Edge `rust_plan` runs `cargo build … --unit-graph` + `cargo metadata` (args from `cargoBuildInvocation`) → `<buildDir>/rust-target/plan.json`; build.ninja depends on it (first configure of a fresh tree emits only the plan edge, then reconfigures).
- `rust/units.ts` → per-unit rustc argv/env in `rust-target/units/<crate>-<hash>.json`; `rust/emit.ts` rules `rust_plan`/`rust_rustc`/`rust_build_script`; `rust/run.ts` (launched with bun) runs one unit. One rustc edge per crate, outputs `.rlib` + `.rmeta`; dependents depend on `.rmeta`, released early via `early_output_prefix` / `NINJA_EARLY_OUTPUT_PREFIX` (oven-sh/ninja only; stock ninja still correct, just no pipelining).
- Root crate `bun_runtime` (src/runtime) is a lib; `main` is `#[no_mangle] extern "C"` in `src/runtime/bin_entry/mod.rs` (also defines `__rust_no_alloc_shim_is_unstable_v2`, `#[global_allocator]`). All rlibs incl. std go to the final clang/lld link beside C++ objects. Release crates are ThinLTO bitcode (`-C linker-plugin-lto`), cross-language LTO with C++.
- Windows targets: second graph `rust-target/shim/` building `src/install/windows-shim` (`--profile shim`, `-Zbuild-std=core,compiler_builtins`) → `<codegenDir>/bun-shim-impl.exe`, `include_bytes!`'d by bun_install.
- Cargo profile: `dev` for Debug buildType, else `release`. RUSTFLAGS via `CARGO_ENCODED_RUSTFLAGS`: `--cfg=bun_debug` (Debug), `--cfg=bun_asan`, `--cfg=bun_codegen_embed` (non-debug: embed codegen JS; debug reads from BUN_CODEGEN_DIR at runtime), `--cfg=socket_fault_injection`; `-Ctarget-cpu` mirrors `-march/-mcpu`. assertions → `CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS=true`; asan → codegen-units 16.
- Env `BUN_CODEGEN_DIR=<buildDir>/codegen` for every rustc/build script; crates `include!(concat!(env!("BUN_CODEGEN_DIR"), "/x.rs"))`. Each `build.rs` (src/runtime, src/jsc, src/bun_core) defaults to `build/debug/codegen` and panics if the generated file is missing — so plain `cargo check` requires a prior `bun bd` (or `bun run build:types`-style codegen).
- `allRustTargets` (11 triples) + `cargoBuildStdArg = "-Zbuild-std=core,alloc,std,proc_macro,panic_abort"` for Tier 3 (aarch64-unknown-freebsd).

## Ninja specifics
- Inputs: explicit, implicit `|`, order-only `||` (bulk codegen headers behind phony `obj/.codegen-ready`), validations `|@`. Pools: `dep` (depth 4, nested cmake/fetch), `console` (depth 1, TTY jobs only).
- `toolchain-identity/<tool>.txt` (`writeToolIdentities`, `toolIdentityFile(cfg, tool)`): `--version` output as implicit input so a replaced compiler (same path) triggers rebuild.
- Paths given absolute; written buildDir-relative plus absolute implicit-output aliases so depfiles resolve.
- Pinned ninja: `ensureNinja` in `ninja-release.ts` (oven-sh/ninja, `pins.bunNinja` in ci-images/spec.ts, sha256-checked, fetched into cacheDir), fallback PATH `ninja`.

## Module inventory (scripts/build/)
build.ts(entry, parent dir) · configure.ts · config.ts (Config/PartialConfig/Toolchain, resolveConfig, bunExeName, shouldStrip, computeBuildDirName) · profiles.ts · tools.ts (findTool, resolveLlvmToolchain, findMsvcLinker, findCargo; env overrides `BUN_TOOLCHAIN_LLVM`, `BUN_TOOLCHAIN_RUST`, `BUN_TOOLCHAIN_CARGO`) · flags.ts · ninja.ts (`ruleVars` table types `n.build`) · ninja-release.ts · rules.ts · compile.ts (cc/cxx/pch/link/ar) · unified.ts · source.ts (Dependency, resolveDep) · codegen.ts · rust.ts + rust/{plan,units,emit,run,toml,cargo-env,native-link}.ts · cargo-config.ts · bun.ts · shims.ts + shims/macho-postlink.c · workarounds.ts · macos-sdk.ts · winsysroot.ts (xwin sysroot for cross-Windows) · features-json.ts · depVersionsHeader.ts (`bun_dependency_versions.h` for process.versions) · buildOptionsRs.ts (`build_options.rs`) · jsonByteClass.ts / xmlByteClass.ts · stream.ts · shell.ts (quote/slash; cmd.exe quoting partial) · fs.ts · error.ts (BuildError{hint,file,cause}) · download.ts · fetch-cli.ts (build-time downloads, `.h.in` substitution, forbidUndefined check) · verify-binary.ts · binary-expectations.ts · annotations.ts · ci.ts · clean.ts · timings.ts · npm-ci.ts · ci-images/spec.ts (pins, images; `bun run ci:images`).
Typecheck build scripts: `bunx tsc --noEmit -p scripts/build/tsconfig.json`.

## Recipes
- Compiler flag: one entry in the right `flags.ts` table.
- Profile: one entry in `profiles.ts`.
- Config field: add to `Config` + `PartialConfig` (config.ts), resolve in `resolveConfig`, add to `configFlags` in build.ts (tsc fails otherwise).
- Ninja rule: add name + `$vars` to `ruleVars` in ninja.ts, `n.rule` in the module's `registerXxxRules`; configure fails if text/table disagree.
- Codegen step: function in codegen.ts (model `emitErrorCode` or `emitCppBind`), call from `emitCodegen`, push outputs to `rustInputs`/`cppSources`/`cppHeaders`/`generatedTypes` (never `cppAll`). Rule `codegen` (script must run under node AND bun) or `codegen_bun`.
- Workaround: artifact in `scripts/build/shims/` or `patches/`, edge from shims.ts, entry in `workarounds.ts` with `expectedToBeFixed` predicate (configure fails once fixed → forces cleanup).

## Gotchas
- Dep order in `allDeps` = fetch order + link order. PCH/cc/no-PCH cxx take dep libs as IMPLICIT inputs (`depHeaderSignal`), codegen headers order-only.
- `isExecutable` must check `isFile` (a `cmake/` dir in PATH).
- A local `.cargo/config.toml` at repo root is generated (git-ignored).
