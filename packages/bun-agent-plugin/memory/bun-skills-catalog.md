---
name: bun-skills-catalog
description: "Which skill/agent/slash-command/nested CLAUDE.md to load for <bun> work (repo .claude, aphrody plugin), key rules of each, and verified stale/contradicting lines (2026-10-08)"
metadata:
 type: reference
---

Verified 2026-10-08 against <bun> @ fe43d1d685a. Deep content lives in other fiches; this is the router.

## Quick router (task -> load)

| Task | Load |
|---|---|
| Prove a runtime change works | repo skill `verify` |
| New JS class in Rust (`.classes.ts`) | `implementing-jsc-classes-rust` + `bun-core-classes-ts-bindings` |
| New JS class in C++ | `implementing-jsc-classes-cpp` (see stale lines below) |
| UAF / leak / "collected too early" / WriteBarrier / JSRef | `javascriptcore-garbage-collector` + `bun-core-gc-lifetimes` |
| File I/O, fds, syscalls in Rust | `rust-system-calls` + `bun-core-sys-syscalls` |
| Bundler/transpiler test | `writing-bundler-tests` + `bun-toolchain-bundler-tests` |
| Dev server / HMR test (test/bake) | `writing-dev-server-tests` + `bun-toolchain-bake` |
| Slow CI tests report | `slowest-tests` + `bun-tests-runner-ci` |
| React Compiler resync | read `.claude/skills/sync-react-compiler.md` manually (NOT a loadable skill: flat file, no `<dir>/SKILL.md`) |
| Bump WebKit / BoringSSL / reported Node version | slash cmds `/upgrade-webkit`, `/upgrade-boringssl`, `/upgrade-nodejs` + `bun-build-deps-vendor` |
| Issue/PR triage on GitHub | `/dedupe`, `/find-duplicate-prs`, `/find-issues` |
| Review blockers before a PR | REVIEW.md + `.claude/docs/landing-prs.md` -> `bun-review-rules` |
| Fork sync with oven-sh/bun | `bun-fork-aphrody` |
| Bun docs/API signature lookup | `aphrody:docs` (Bun section) or MCP `bun_docs_search` -> `bun-mcp-tools`, `bun-docs-map` |
| Cross-target Rust check | `bun run rust:check-all` (NOT `aphrody:rust-target-check` defaults) |
| C++ in src/jsc/bindings | repo cpp skill first; `aphrody:cpp-pro` only for generic C++ |
| bun:ffi / napi from outside Bun | `aphrody:rust-bun` (external-project oriented) |
| aphrody CLI/MCP on this repo | `bun-mcp-tools` ; LLM digest of a subsystem: `aphrody ingest <bun> --subpath <dir> --include '*.ts' -o <tmp>` |

## 1. Repo skills (`<bun>\.claude\skills\`, invoke by bare name)

**`verify`** - drive the debug binary end-to-end, never `bun test`, never import-and-call.
- `bun bd --version` builds; `bun bd -e '<repro>'` drives (sets BUN_DEBUG_QUIET_LOGS). Cross-check Node-compat with `node -e`.
- `src/js/**` edit may not reach binary (InternalModuleRegistry TU not recompiled): check `bun bd -e 'console.log(X.toString.includes("<new-id>"))'`; if false `touch src/jsc/bindings/InternalModuleRegistry.cpp`.
- One `bun bd` per worktree (build lock looks like a hang); build once then run `./build/debug/bun-debug` (Windows: `bun-debug.exe`) under timeout.
- `node:cluster` needs a real file (re-execs argv[1]). Debug builds print `[cachefs]`/`[sys]` to stdout: filter before diffing. ASAN 10-100x slower.

**`implementing-jsc-classes-rust`** - `.classes.ts` -> `generate-classes.ts` -> `crate::generated_classes` (include!'d in bun_runtime).
- Options: `construct`, `finalize`, `hasPendingActivity`, `proto` (`fn:`/`getter`/`cache:true`), `values:[...]` (WriteBarrier slots).
- `#[bun_jsc::JsClass]` on struct; signatures: `constructor(global,&CallFrame)->JsResult<Box<Self>>`, `#[bun_jsc::host_fn(method)]`, getter `get_x(this:&Self, global)`, `finalize(self: Box<Self>)` (refCounted: `&self`). Mis-typed hook = compile error in `cargo check -p bun_runtime`.
- Override finalize with an inherent method, never `impl JsFinalize for T` (blanket impl `src/jsc/lib.rs:1494-1500`).
- Never store raw `JSValue` in a field: use `values:` slot + `js::<field>_set_cached/_get_cached`.
- Refs: `src/runtime/api/glob.rs`+`Glob.classes.ts`, `cron.rs`+`cron.classes.ts`, `src/jsc_macros/lib.rs`.

**`implementing-jsc-classes-cpp`** - 3 classes (object/Prototype:JSNonFinalObject/Constructor:InternalFunction), `HashTableValue` arrays + `reifyStaticProperties`, IsoSubspace via `subspaceForImpl` + `BUN_SUBSPACE_SLOTS` (only `subspaceForImplSlow` in `BunClientData.cpp` may construct an IsoSubspace; lint `test/internal/source-lints/iso-subspace-creation.test.ts`), `LazyClassStructure` in ZigGlobalObject.h/.cpp + visit in `visitChildrenImpl`, `#include "root.h"` first.

**`javascriptcore-garbage-collector`** - Riptide: non-moving, generational, concurrent; `visitChildren` runs off-thread (no alloc, no ref/deref, no locks).
- Decision table: JSCell->JSCell = `WriteBarrier`+`visitor.append`; native wrapper self-ref = **`JSRef`** (`src/jsc/JSRef.rs`, upgrade busy / downgrade idle / finalize) is default; `hasPendingActivity` only for many concurrent ops; owned JS value = `bun_jsc::Strong`; avoid `gcProtect`.
- Extra memory: `reportExtraMemoryAllocated` at alloc AND `reportExtraMemoryVisited` in visitChildren (`estimatedSize: true` in .classes.ts generates visit half).
- Interior pointers across allocation: `EnsureStillAliveScope` / Rust `value.ensure_still_alive`.
- Debug env: `BUN_JSC_collectContinuously=1 BUN_JSC_useConcurrentGC=0`, `BUN_JSC_scribbleFreeCells=1`, `BUN_JSC_verifyGC=1`, `BUN_JSC_logGC=2`; `Bun.gc(true)`, `require('bun:jsc').heapStats`.
- Combine with root CLAUDE.md rule 15 (stack scanner is never the root cause without heap snapshot + debugger proof).

**`rust-system-calls`** - `bun_sys` not `std::fs`/libc: `File::openat(Fd::cwd, b"p", O::RDONLY, 0)?` (RAII close), `Maybe<T>`, `err.to_js(global)` via `bun_sys_jsc::ErrorJsc`, `e.errno==bun_c::ENOENT`, `bun_paths::path_buffer_pool::get` (no 64 KB stack bufs on Windows), no `.unwrap` on OS-fallible paths.

**`writing-bundler-tests`** - `itBundled("category/Name", {files, run:{stdout}...})` from `test/bundler/expectBundled.ts`; `bundleErrors`/`bundleWarnings`, `dce:true`+`dceKeepMarkerCount`, `capture`, `onAfterBundle(api)`; filters `BUN_BUNDLER_TEST_FILTER=`, `BUN_BUNDLER_TEST_DEBUG=1`.

**`writing-dev-server-tests`** - `devTest/prodTest/devAndProductionTest` from `test/bake/bake-harness.ts`; mutate only via `dev.write/patch/delete` (they wait for HMR), `dev.client`, `c.expectMessage`, `c.expectReload`, `errors:[...]`.


**`sync-react-compiler.md`** (manual) - `scripts/sync-react-compiler.sh [sha]` -> apply whole-crate diffs mechanically, re-port AST-boundary files via `src/react_compiler/DESIGN.md`, `cargo check -p bun_react_compiler`, `bun bd test test/bundler/transpiler/react-compiler.test.ts`, then write `src/react_compiler/UPSTREAM_PORTED`.

## 2. Repo slash commands (`.claude/commands/`, listed as skills)

- `/upgrade-webkit [preview|pr]`: merge upstream WebKit in `vendor/WebKit` (needs a real clone; normally absent), `bun run jsc:build:debug`, `bun run build:local -p '42'`, publish `autobuild-<sha>` release, bump `WEBKIT_VERSION` in `scripts/build/deps/webkit.ts`, check `JSType.h` vs `src/jsc/JSType.rs`. Upstream-maintainer flow (pushes oven-sh/WebKit) - not usable from the fork without write access.
- `/upgrade-boringssl`: bump `BORINGSSL_COMMIT` in `scripts/build/deps/boringssl.ts`, `expectedVersions` in `test/js/node/process/process.test.js`, tls tables in `src/js/node/tls.ts`, regenerate source lists via `bun bd --target=clone-boringssl`.
- `/upgrade-nodejs`: `scripts/build/ci-images/spec.ts` pins.nodejs.version, `NODEJS_ABI_VERSION` in `scripts/build/deps/nodejs-headers.ts`, `Bun__versions_node/_v8` in `BunProcess.cpp`, `NAPI_VERSION`.
- `/dedupe`, `/find-duplicate-prs`, `/find-issues`: gh-only multi-agent search, scoped `repo:owner/repo`, HTML bot markers.

## 3. Hooks and settings (`.claude/settings.json`)

- PostToolUse Write|Edit|MultiEdit -> `.claude/hooks/post-edit-format.js`: prettier `--config .prettierrc` WITHOUT organize-imports on .ts/.js/.json/.toml/.yaml/.css/.html...; nothing for `.rs`/`.cpp` -> run `bun run fmt:rust` (cargo fmt) / `bun run fmt:cpp` yourself. CI `bun run prettier` adds organize-imports.
- SessionStart: `bash scripts/dev/cloud-ssh.sh`, `bun scripts/dev/session-start.ts` (fork-only, see `bun-fork-aphrody`).
- permissions: all tools, `defaultMode: bypassPermissions`.

## 4. Nested CLAUDE.md (AGENTS.md at root/src/test are symlinks to CLAUDE.md)

| File | Use when | Covered by |
|---|---|---|
| `src/CLAUDE.md` | any Rust in src (bun_core/bun_sys/strings/paths/url/env/output/spawn/FFI safety) | `bun-core-idioms`, `bun-core-strings-fmt-output`, `bun-core-sys-syscalls`, `bun-core-jsc-rust-api` |
| `src/js/CLAUDE.md` | builtin modules: `$` intrinsics, `.$call/.$apply`, string-literal `require` only, `export default {}` | `bun-runtime-builtin-js-modules` |
| `src/jsc/bindings/v8/CLAUDE.md` | V8 C++ API shims: add mangled symbols to `src/runtime/napi/napi_body.rs` `mod v8_api` (Itanium + MSVC blocks) and `src/symbols.txt`; tests `test/v8/v8.test.ts` | (no fiche) |
| `test/CLAUDE.md` | writing tests | `bun-tests-patterns`, `bun-tests-harness` |
| `test/js/node/test/parallel/CLAUDE.md` | upstream Node tests: never modify; run with `bun bd <file>` (not `bun bd test`) | `bun-tests-layout` |
| `test/internal/source-lints/CLAUDE.md` | one line: no tests for dead symbols | - |
| `scripts/build/CLAUDE.md` | build system (TS -> ninja), phases, gotchas, Node 25+ compat of scripts | `bun-build-system-internals` |
| `scripts/build/ci-images/CLAUDE.md` | CI machine image spec | `bun-build-ci` |
| `scripts/verify-baseline-static/CLAUDE.md` | baseline CPU instruction check triage/allowlist | `bun-build-ci`, `bun-build-tooling-misc` |
| `.github/workflows/CLAUDE.md` | format.yml (clang-format-23, rustfmt), rust-lints.yml | `bun-build-lint-format` |

## 5. Ex-yolo skills/agents, now in the aphrody plugin (`aphrody:*`; yolo is absorbed)

- **`aphrody:bun-doctrine`** - for Bun *apps*; its `references/fork-contribution.md` is a condensed copy of root CLAUDE.md (bd, tests, USE_SYSTEM_BUN=1 validity, RAII, stack-scanner rule). Key line: native Bun sources are not migration targets. `api-substitutions.md`/`server-gotchas.md` are app-level (Bun.serve timeouts, routing, WS, sqlite, env, watch).
- **`aphrody:bun-upstream`** - fork sync via Aphrody monorepo script; see `bun-fork-aphrody`. Rules: never force-push, `--auto-fix` only for lockfile/completions conflicts, apply only with explicit fork-sync authority.
- **`aphrody:docs`** - Bun section: installed @aphrody/bun-types `.d.ts` first, then `bun_docs_search`/`bun_docs_read` MCP, then `http<bun>.com/docs/llms.txt` / Context7 `/oven-sh/bun`; <=3 calls/question; <bun> has its own `docs/` (authoritative for this checkout). Page map is dated (commit 49c076eb).
- **`aphrody:code-intel`** - rust-analyzer / `tsc --lsp --stdio` (TS7), prefer symbol queries over whole-file reads; never paste full logs.
- **`aphrody:cross-platform-cli-toolbelt`** - `rg` then `fd`, detect tools with `command -v`/`Get-Command`, no aliasing of legacy names.
- **`aphrody:cpp-pro`** - generic RAII/CMake guidance; Bun C++ is built by `scripts/build` (ninja, unified sources), not CMake -> prefer repo cpp/GC skills.
- **`aphrody:rust-bun`** - choosing bun:ffi/napi-rs/spawn/WASM for external projects; `references/how-bun-does-it.md` explains Bun's FFI internals (`src/runtime/ffi/ffi_body.rs`, `abi_type.rs`, `FFI.h`) but has stale lines (below).
- **`aphrody:typescript7-bun`**, **`aphrody:rust-target-check`**, **`aphrody:rust-best-practices-2026`**: generic; for this repo use `bun run rust:check-all` and package.json scripts.
- **`aphrody:deep-analysis`** - Ghidra binary investigation; irrelevant to Bun source work.
- Agents: `aphrody:explore` (read-only file:line), `aphrody:test-runner`/`aphrody:build`/`aphrody:code-review` are generic Rust-workspace orchestrators (cargo/nextest/wasm) - they do not know `bun bd`; brief them explicitly. `aphrody:node2bun` explicitly excludes native Bun sources. `aphrody:ffi-architect` for bun:ffi libraries.

## 6. aphrody plugin (`~\.aphrody\plugins\aphrody`)

- **`aphrody:n2b`** - Node->Bun app migration (`aphrody n2b . [--fix|--aggressive|--migrate]`). **Never run on <bun>**: `--migrate` deletes locks; its rules ("no CommonJS require", `node`->`bun` shebangs) contradict `src/js/CLAUDE.md:96` (string-literal `require` is the builtin module system) and `scripts/build/CLAUDE.md:305-307` (build scripts must run under Node 25+; CI runs literal `node scripts/build.ts`). See `bun-mcp-tools` (n2b compat drift).
- **`aphrody:upstreams`** - read upstreams live (`upstream_read/tree/search` MCP, `aphrody git upstream ...`); useful to read oven-sh/bun or WebKit files not on disk (vendor/WebKit is absent locally).
- **`aphrody:source-of-truth`** - if guidance contradicts source, follow source and correct guidance.

## 7. Stale / contradicting lines (verified)

Repo:
- `.claude/skills/implementing-jsc-classes-cpp/SKILL.md:12` says `JSC::DestructibleObject`; class is `JSC::JSDestructibleObject` (WebKit header `JSDestructibleObject.h:34`; 43 uses in src/jsc/bindings, 0 of the other). Root CLAUDE.md is correct.
- same file `:94,:106` use `UNLIKELY(...)`; bindings now overwhelmingly use `` (603 vs 37 occurrences). `:169` "Expose to Zig" - no Zig left (0 `.zig` in src); callers are Rust.
- `.claude/skills/implementing-jsc-classes-rust/SKILL.md` cites `src/runtime/image/Image.rs:56` `pub use ... js_Image`; actual is line 7, `pub(crate) use`.
- `.claude/skills/javascriptcore-garbage-collector/SKILL.md:23,98,196...` cite `vendor/WebKit/Source/...` (and `Heap.cpp:2970`); vendor/WebKit only exists in local-WebKit mode. Prebuilt headers: `~\.bun\build-cache\webkit-<hash>-debug\include\JavaScriptCore\`. Read full sources via `aphrody:upstreams` (oven-sh/WebKit).
- `.claude/skills/verify/SKILL.md:36` "prefix every `bun bd` with `PATH=$HOME/.cargo/bin:$PATH`" is a macOS-Homebrew workaround; irrelevant on Windows (see `bun-build-windows`).
- `.claude/skills/writing-dev-server-tests/SKILL.md:15` `test/bake/dev-and-prod.ts` -> real file `test/bake/dev-and-prod.test.ts`.
- `.claude/skills/sync-react-compiler.md` not in a `<name>/SKILL.md` dir -> never auto-discovered.
- `src/jsc/bindings/v8/CLAUDE.md:140,147` symbol extraction from `build/CMakeFiles/bun-debug.dir/...V8NewClass.cpp.o`; no CMake build anymore: objects are unity-built at `build/debug/obj/unified/UnifiedSource-src_jsc_bindings_v8-N.cpp.obj`.
- `test/CLAUDE.md:120` "Do not set a timeout on tests" vs root `CLAUDE.md:105` (per-test timeout allowed for rare outliers). Root wins (newer, nuanced).
- Root `CLAUDE.md:150` lists vendored `WebKit` and `nodejs`; `vendor/` is gitignored (`.gitignore:148`) and on this machine has neither (WebKit prebuilt, nodejs headers fetched), while it does contain unlisted libjpeg-turbo/libspng/libwebp (deps exist in `scripts/build/deps/`).
- `.claude/commands/dedupe.md:39`, `find-duplicate-prs.md:43`, `find-issues.md:53` append "Generated with [Claude Code]" to GitHub comments - violates user global rule (no AI attribution); strip it when running these on the fork. `upgrade-webkit.md:9` "Confirm with the user before pushing" vs user rule (no human in loop) - only matters if pushing to oven-sh/WebKit, which the fork cannot.

Plugins (re-verified 2026-10-09 against aphrody 2.3.0):
- Fixed upstream: `rust-bun` (libbun_rust.a, `.zig`, `[AbiRow; 22]`) and `bun-doctrine/references/fork-contribution.md` (vendor/bun, branches) now match the fork.
- `aphrody:bun-upstream` SKILL.md:13 still cites `docs/architecture/runtime-native/BUN_FORK.md` and `scripts/tools/vendor/bun_upstream_sync.ts`, both deleted from <aphrody> (BUN_FORK merged into `docs/reference/upstream-bun/APHRODY-FORK.md`); fork sync = `bun scripts/aphrody/sync-upstream.ts` (`bun-fork-aphrody`).
- `aphrody:rust-target-check` default targets (linux x64, windows msvc, wasm32) - wrong matrix for Bun; root CLAUDE.md rule 9 mandates `bun run rust:check-all` (linux/macos/windows x x64/aarch64).
- User global CLAUDE.md "Rust: `scripts/build/rust/cargo-serial.sh`" - absent in <bun> (`scripts/build/rust/` has cargo-env/emit/native-link/plan/run/toml/units .ts); Bun builds via `bun bd`/`cargo check -p`. Global "oxlint/oxfmt" - Bun repo uses prettier (`bun run prettier`/`fmt`) + `oxlint --config=oxlint.json` on src/js only; no oxfmt config.
