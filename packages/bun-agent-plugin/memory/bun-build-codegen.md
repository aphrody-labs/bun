---
name: bun-build-codegen
description: "Every Bun codegen step (src/codegen/*) — inputs, scripts, outputs in build/<profile>/codegen, how Rust/C++ consume them (.classes.ts.bind.ts.bindv2.ts, ErrorCode.ts, src/js, LUTs, cppbind, HOST_EXPORT, string maps)"
metadata:
 type: reference
---

# Codegen (wired in `scripts/build/codegen.ts::emitCodegen`)

All steps are ninja edges with `restat = 1`, run with `TARGET_PLATFORM`/`TARGET_ARCH` env (target, not host). Rules: `codegen` (runs under `cfg.jsRuntime`, node or bun) and `codegen_bun` (needs bun). Outputs go to `cfg.codegenDir = <buildDir>/codegen` (e.g. `<bun>\build\debug\codegen`, ~81 files) unless noted. Phony targets: `codegen` (all), `generated-types`. Build mechanics: `bun-build-system-internals`.

Source lists come from `scripts/glob-sources.ts` (`bun scripts/glob-sources.ts <field>` prints one): bunError, stringMaps, nodeFallbacks, zigGeneratedClasses (`src/**/*.classes.ts`), js (`src/js/**/*.{js,ts}` + `src/install/PackageManager/scanner-entry.ts`), jsCodegen (`src/codegen/*.ts`), bakeRuntime, bindgen (`src/**/*.bind.ts`), bindgenV2 (`src/**/*.bindv2.ts`), bindgenV2Internal, rust, cxx, c. New files are picked up at the next configure (every build).

## How Rust reads generated files
`include!(concat!(env!("BUN_CODEGEN_DIR"), "/<file>.rs"))` — set by the build for each rustc; `build.rs` in `src/runtime`, `src/jsc`, `src/bun_core` default it to `build/debug/codegen` and panic if missing. Includers: `src/runtime/generated_classes.rs`, `generated_jssink.rs`, `generated_js2native.rs`; `src/jsc/ErrorCode.rs`, `src/jsc/cpp.rs`; `src/bun_core/lib.rs` (`build_options.rs`); `src/parsers/{json,xml}_index.rs`.

## Steps (script → outputs)
| step (emit fn) | script | inputs | outputs |
|---|---|---|---|
| configure-time (not edges) | `scripts/build/buildOptionsRs.ts`, `jsonByteClass.ts`, `xmlByteClass.ts`, `depVersionsHeader.ts` | Config | `build_options.rs` (`bun_core::build_options`), `json_byte_class.{h,rs}`, `xml_byte_class.{h,rs}`, `<buildDir>/bun_dependency_versions.h` |
| emitBunError | esbuild rule (index.tsx, browser esm, minify) | packages/bun-error/* | `bun-error/index.js`, `bun-error.css` |
| emitStringMaps | `src/codegen/generate-string-map.ts <in> <out>` | `src/**/*.string-map.ts` (today: `src/js_parser/defines_table.string-map.ts`) | IN-TREE `<dir>/<stem>.generated.rs` (checked in; CI `codegen:verify` / format.yml regenerates) |
| emitRuntimeJs | esbuild | `src/runtime.bun.js` | `runtime.out.js` |
| emitNodeFallbacks | `src/node-fallbacks/build-fallbacks.ts` (`bun run build-fallbacks`) | `src/node-fallbacks/*.js` | `node-fallbacks/*.js` + `.zst`, `node-fallbacks/react-refresh.js` |
| emitErrorCode | `src/codegen/generate-node-errors.ts` | `src/jsc/bindings/ErrorCode.ts` (+ErrorCode.cpp/.h, src/js/builtins.d.ts) | `ErrorCode+List.h`, `ErrorCode+Data.h`, `ErrorCode.generated.rs`, `build/types/ErrorCode.d.ts` |
| emitGeneratedClasses | `src/codegen/generate-classes.ts` (types in `class-definitions.ts`) | all `*.classes.ts` | `ZigGeneratedClasses.{h,cpp}`, `ZigGeneratedClasses+{lazyStructureHeader,DOMClientIsoSubspaces,DOMIsoSubspaces,lazyStructureImpl}.h`, `generated_classes.rs`, `build/types/ZigGeneratedClasses.d.ts` |
| emitHostExports | `src/codegen/generate-host-exports.ts <codegenDir>` | `// HOST_EXPORT(Sym[, jsc|c|rust])` markers in src/runtime, src/jsc, src/http_jsc `.rs` | `generated_host_exports.rs` (`#[unsafe(no_mangle)]` thunks via `bun_jsc::host_fn`) |
| emitCppBind | `src/codegen/cppbind.ts src <codegenDir> cxx-sources.txt` (lezer C++ parser) | all cxx sources with `[[ZIG_EXPORT(nothrow|zero_is_throw|check_slow)]]`, `` | `cpp.rs` → `bun_jsc::cpp::<fn>` |
| emitJsModules | `src/codegen/bundle-modules.ts` (calls `bundle-functions.ts`, `replacements.ts`, `generate-js2native.ts`, `internal-module-registry-scanner.ts`, `builtin-parser.ts`) | src/js/**, src/codegen/*.ts, InternalModuleRegistry.cpp, ErrorCode.ts | `WebCoreJSBuiltins.{cpp,h}`, `InternalModuleRegistryConstants.{h,S,bin}`, `InternalModuleRegistry+{createInternalModuleById,enum,numberOfModules}.h`, `NativeModuleImpl.h`, `SyntheticModuleType.h`, `BuiltinModuleKeys.h`, `GeneratedJS2Native.h`, `generated_js2native.rs`, `generated_resolved_source_tag.rs`, `generated_builtin_module_key_index.rs`, `BunBuiltinNames+extras.h` (undeclared), `<buildDir>/js/**` (debug runtime loads these via `BUN_DYNAMIC_JS_LOAD_PATH`), `build/types/{generated,WebCoreJSBuiltins}.d.ts` |
| emitBakeCodegen | `src/codegen/bake-codegen.ts --codegen-root=…` | `src/runtime/bake/*.ts`, `*/*.{ts,css}`, `dev_server/mod.rs` | `bake.{client,server,error}.js`, IN-TREE `src/runtime/bake/generated.ts` |
| emitBindgenV2 | `src/codegen/bindgenv2/script.ts --command=list-outputs|generate --sources=… --codegen-path=…` | `*.bindv2.ts` (SSLConfig, SocketConfig, FakeTimersConfig) | dynamic list (queried at configure): `Generated<Name>.{cpp,h}` … |
| emitBindgen | `src/codegen/bindgen.ts` (+`bindgen-lib.ts`, `bindgen-lib-internal.ts`) | `*.bind.ts` (NodeModuleModule, bindgen_test, fmt_jsc, BunObject, DevServer, node_os) | `GeneratedBindings.cpp`, `Generated<Pascal>.h` per file; C++ `Generated::<basename>::*`; Rust binds `bindgen_*` by hand in `src/jsc/bindings/GeneratedBindings.rs` (`bun_jsc::r#gen::<basename>`) |
| emitJsSink | `src/codegen/generate-jssink.ts` (+`create-hash-table.ts`, perl `create_hash_table`) | classes list in script (ArrayBufferSink, FileSink, HTTPResponseSink, HTTPSResponseSink, NetworkSink, FetchRequestBodySink, HTMLRewriterSink) | `JSSink.{cpp,h,lut.h}`, `generated_jssink.rs` (`JSSink.lut.txt` intermediate) |
| emitObjectLuts | `create-hash-table.ts` + perl `src/codegen/create_hash_table` | `@begin … @end` tables in BunObject.cpp, ZigGlobalObject.lut.txt, JSBuffer.cpp, BunProcess.cpp, ProcessBinding{Buffer,Constants,Fs,Natives,HTTPParser}.cpp, NodeModuleModule.cpp, webcore/JSEvent.cpp | `<Name>.lut.h` each |
| emitCompressedEmbeds | `src/codegen/compress-embed.ts <in> <out.zst>` | `completions/bun.{bash,zsh,fish}`, `src/runtime/bake/bun-framework-react/client.tsx`, codegen `bake.client.js`, `bake.error.js`, `bun-error/index.js`, `bun-error/bun-error.css`, `node-fallbacks/react-refresh.js` | `compressed/<name>.zst` (release `bun_zstd::embed_compressed!`) |
Plus root `bun install` (stamp; provides esbuild, @lezer/cpp) as `rootInstall`.

## .classes.ts → JS class
`define({...})` from `src/codegen/class-definitions.ts` (fields: name, constructor, finalize, proto/klass props with getter/setter/fn/length/cache/privateSymbol, `rustPath` → `pub use <rustPath> as <name>` for thunks, `this`-mismatch behaviour). Output C++ `JS<Name>`/`JS<Name>Prototype`/`JS<Name>Constructor` in ZigGeneratedClasses.cpp calling `extern JSC_CALLCONV` thunks; `generated_classes.rs` defines per-class `#[unsafe(no_mangle)] extern "C"` thunks calling inherent methods on the real Rust struct (missing method = compile error in `cargo check -p bun_runtime`). Win-x64 ABI is `sysv64` via `bun_jsc::jsc_host_abi!`. Skill: `implementing-jsc-classes-rust`.

## ErrorCode.ts
Array of `[code, Ctor, name?...]` (e.g. `["ERR_ASSERTION", Error]`). Generates C++ `Bun::ErrorCode` enum (index-aligned table `errors[]`, `Bun__createErrorWithCode`), Rust `ErrorCode::<NAME>` / `ErrorCode::ERR_<NAME>` consts, `COUNT`, `CODE_STR`, and JS `$ERR_*(…)` typings. Add a code: one row in ErrorCode.ts, rebuild.

## src/js built-in modules (docs: `src/js/README.md`, `src/js/CLAUDE.md`)
Dirs: `node/` (node:*), `bun/` (bun:*), `thirdparty/` (ws etc.), `internal/`, `builtins/` (JSC builtin functions, bundle-functions.ts). Syntax: `$` prefix = private names/JSC intrinsics (`$Array.from`, `$newArrayWithSize`), `require("string literal")` → `$getInternalField($internalModuleRegistry, id)`, `$debug` (enabled by `BUN_DEBUG_JS=1`/`BUN_DEBUG_<MODULE>=1`/`BUN_DEBUG_ALL=1`, stripped in release), `$assert` (stripped in release), `IS_BUN_DEVELOPMENT`, `process.platform/arch` inlined and DCE'd, `$rust`/`$cpp`/`$bindgenFn` macros (generate-js2native.ts, replacements.ts). Non-type `import` statements are not supported in modules; `export default` defines the require result. Type declarations: `src/js/builtins.d.ts`, `private.d.ts`, generated `build/types/*.d.ts` (`bun run build:types`).
Release: module sources embedded via `InternalModuleRegistryConstants.S` (`.incbin` of `.bin`, header magic `BUNBLTNS`). Debug: read from `<buildDir>/js`, so JS edits need only `bun run build` (codegen), no native recompile of large parts.

## Regenerating by hand
- `bun run build:types` — codegen-only graph for `build/types` (what lint.yml runs before typechecking src/js).
- `bun run build --target=codegen` — all codegen in the normal build dir.
- `bun run codegen:string-maps` then commit `*.generated.rs`.
- Build-system tests live in `test/internal/build-*.test.ts` (codegen-declared-outputs, cli-config-flags, rust-units, toolchain-identity, timings, …) plus `test/internal/bindgen.test.ts`, `internal-module-blob.test.ts`; source lints in `test/internal/source-lints/`.
