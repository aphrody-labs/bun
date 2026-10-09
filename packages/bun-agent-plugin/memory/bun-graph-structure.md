---
name: bun-graph-structure
description: "What the graph:bun code graph says about Bun's structure (communities decoded, god nodes, crate coupling), repo size facts from aphrody scan/ingest, and the graph's reliability limits + label-to-id recipe"
metadata:
 type: reference
---

Sources: `aphrody graph --source graph:bun report|explain|path|query`, a Bun script over `~\.aphrody\graphs\bun\graph.json` (keys `nodes`, `links`, `hyperedges`=0, `built_at_commit`=null), `aphrody scan tree|manifests`, `aphrody ingest --subpath … --include "*.rs" --json`. HEAD fe43d1d685a, 2026-10-08. Graph setup: `bun-aphrody-graph-memory`.

**Size facts**
- Cargo workspace = **103 members** (`Cargo.toml:3-111`, `exclude = ["vendor"]` `:112`), 99 internal `bun_*` path deps in `[workspace.dependencies]` (`:325`). Members include nested `src/install/windows-shim`, `src/sema/{baselines,driver,standalone}`. 111 tracked Cargo.toml: 104 under `src/` (only `src/css_derive` is not a member) + `bench/ffi/src`, `packages/bun-build-mdx-rs`, `packages/bun-native-plugin-rs{,/bun-macro}`, `scripts/verify-baseline-static`, a grpc test fixture. The "~200 crates" in CLAUDE.md is an overcount.
- External Rust deps are few: hashbrown, allocator-api2, bstr, rustix, libc, bitflags, smallvec, thiserror, strum, enumset, enum-map, scopeguard, const_format, itoa, encoding_rs, bcrypt, getrandom, plus path deps `vendor/rust-argon2`, `vendor/lolhtml` (`Cargo.toml:325-450`).
- Tracked source: 1 646 `.rs` files / **1.25 M lines** in `src/`; 1 280 `.cpp/.h` / 292 k lines; `src/js/**.ts` 100 k lines. Manifests: 559 package.json, 51 bun.lock, 40 tsconfig, 22 bunfig.toml.
- Largest Rust files (lines): `js_parser/p.rs` 10 578, `runtime/node/node_fs.rs` 10 116, `sys/lib.rs` 9 963, `sema/program.rs` 8 521, `bundler/bundle_v2.rs` 8 392, `sema/check/flow.rs` 8 232, `js_printer/lib.rs` 8 145, `runtime/api/bun/h2_frame_parser.rs` 7 820, `jsc/VirtualMachine.rs` 7 810, `resolver/resolver.rs` 6 901, `runtime/webcore/Blob.rs` 6 826, `runtime/bake/DevServer.rs` 6 796.
- Disk (scan tree): `build/debug` 16.5 GB / 16 186 files (12 303 `.o`); `vendor` 0.33 GB (boringssl 231 MB); `test` 15 030 files (test/js 8 314, test/bundler 3 787); `src/jsc` 1 428 files (681 `.h`, 557 `.cpp`, 112 `.rs`).
- LLM digest cost (`aphrody ingest`, `.rs` only): src/install 998 k tokens, js_parser 841 k, bundler 622 k, jsc 553 k, runtime/server 255 k, resolver 181 k — no crate fits a context window whole; feed single files.

**Graph totals**: 114 065 nodes, 304 039 edges (references 87 k, calls 72 k, contains 49 k, imports_from 38 k, method 36 k, case_of 12 k, implements 1.6 k, inherits 117); 98 % EXTRACTED.

**Communities decoded** (id: label, size → dominant dirs → meaning)
- 0 JSValue 11 264 → src/jsc, runtime/webcore, runtime/api, runtime/node, runtime/socket → the JS-facing runtime surface (everything taking `&JSGlobalObject`/returning `JsResult<JSValue>`).
- 1 bun_test.rs 10 402 → test/js/node, test/js/bun, test/cli, test/js/web, regression → the test suite (glued by `bunExe`/`tempDir` in `test/harness.ts`).
- 2 Fd 7 305 → src/install (2 598), runtime/cli, resolver → package manager + CLI + resolver (file-descriptor heavy I/O code). `Transpiler`, `PackageManager`, `Lockfile`, `AsyncModule` land here.
- 3 TypeId 6 204 → src/sema (5 804) → `bun check` type checker (`bun-toolchain-check-sema`); 15 Sym 1 537 also sema.
- 4 c_void 5 879 → runtime/napi, uws_sys, libuv_sys, windows_sys, boringssl_sys → FFI/`*_sys` layer.
- 5 Expr 5 795 → js_parser, bundler, ast, parsers → compiler front/middle end (BundleV2, LinkerContext, ParseTask). 23 Lexer 770 → lexer + bun_core strings.
- 6 Property 5 433 → src/css (4 994) → Lightning CSS port.
- 7 builtins.d.ts 5 003 → src/js (4 002) → built-in TS modules.
- 8 T 3 997 → bun_core, collections, paths, ptr → generic foundation; 9 sys/lib.rs 2 569 → src/sys + bun_core syscall layer.
- 10 NonNull 2 547 → http, jsc, bun_alloc, test_runner, event_loop → event loop/HTTP client (`EventLoop` is here).
- 11 Environment 2 295 → src/react_compiler (2 154) → React Compiler port (HIR).
- 12 SSL 2 180 → runtime/server, runtime/bake, http_jsc, uws_sys → `Bun.serve`/DevServer (`NewServer`).
- 13 index.d.ts → packages/bun-inspector-protocol; 14 Interpreter 1 540 → runtime/shell (Bun Shell); 16 shared_runtime → test/bundler fixtures; 17 runner.node.mjs → scripts/build + CI runner; 18 → bench/react-hello-world (generated bundle); 19 Error → error enums across crates; 21 StandaloneModuleGraph.rs 813 → exe_format, url, standalone_graph, router (`--compile`); 22 VirtualMachine 805 → src/jsc + bun_core (VM struct proper); 24 spawn/process.rs 705 → io, spawn, spawn_sys.

**God nodes**: JSValue 4 439 edges, JSGlobalObject 4 065, JsResult 3 018, TypeId 2 615, bun_test.rs 2 146, c_void, FileId 1 924, `bunExe` 1 669, CallFrame 1 228, ExprId 987. Highest-degree real code nodes: `napi_body.rs` 979, `sys/lib.rs` 873, `tempDir` 807, `Loc` (`src/ast/lib.rs:589`) 722, `node_fs.rs` 683, `AllocError` (`src/bun_alloc/lib.rs:492`) 658, `ZStr` (`src/bun_core/util.rs:77`) 632, `JSValue` (`src/jsc/JSValue.rs:31`) 507, `Interpreter` (`src/runtime/shell/interpreter.rs:269`) 367, `VirtualMachine` (`src/jsc/VirtualMachine.rs:131`) 314.
- Most imported-from crate dirs (cross-dir `use` edges): collections 558, jsc 525, bun_core 430, spawn 323, ast 244, bun_alloc 179, ptr 141, runtime 119, event_loop 118, sema 113.

**Reliability limits (read before trusting graph output)**
- Rust `calls` are resolved by name within the same file: 61 729 same-file vs 9 907 cross-file call edges, and most cross-file ones are TS (test→src/js, test→harness). Top "called" Rust targets are `.get`/`.len`/`.new` in one file. Do not use `path` for call chains; it is undirected and walks shared type refs (e.g. `path RunCommand ModuleLoader` goes via `Loader`/`Macro.rs`). Verified chains: `bun-graph-call-paths`.
- INFERRED name collisions: `join` in `src/node-fallbacks/path.js:173` collects 1 023 edges from every `path.join` in tests; `bench/react-hello-world` → test/js edges are spurious.
- Type names appear twice: a `concept` node (all references, e.g. `virtualmachine` deg 407) and a `code` node (definition). `explain <Label>` picks the concept or an unrelated same-named struct. Find ids with a Bun one-liner: `g.nodes.filter(n=>n.label==="X")` over graph.json, then `explain <id>`.
- `query "<symbol names>"` is the best entry: it lists matching definitions with file:line, then floods with depth-2 neighbours (use `--budget 600`).
- `report` is 51 lines (summary, relations, 15 god nodes, 15 community names); the rich data is only in graph.json.
