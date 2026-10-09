---
name: bun-runtime-builtin-js-modules
description: "src/js builtin modules — directory layout, preprocessor special syntax ($ intrinsics, $ERR_*, $rust/$cpp/$newRustFunction/$bindgenFn, $debug/$assert), require/export rules, numeric module IDs, codegen pipeline"
metadata:
 type: reference
---

# Builtin JS modules (src/js/)

Docs: `src/js/README.md`, `src/js/CLAUDE.md` (== AGENTS.md). Codegen: `src/codegen/bundle-modules.ts` (modules), `bundle-functions.ts`
(builtins), `replacements.ts` (macros), `builtin-parser.ts` (`sliceSourceCode`), `generate-js2native.ts`
`internal-module-registry-scanner.ts`. Type decls for intrinsics: `src/js/builtins.d.ts`, `src/js/private.d.ts`.

## Layout
- `node/` -> `node:*` modules; `bun/` -> `bun:ffi` (ffi.ts), `bun:sqlite` (sqlite.ts), `bun` SQL (sql.ts); `thirdparty/` -> npm replacements
 (`ws.js`, `undici.js`, `node-fetch.ts`, `isomorphic-fetch.ts`, `vercel_fetch.js`, `dotenv.ts`, `picocolors.ts`, `tiny-invariant.ts`
 `uuid.ts`); `internal/` -> not resolvable by users (validators, errors, primordials, shared, fs/, http/, net/, streams/, sql/, quic/
 repl/, readline/, cluster/, assert/, test/, test_runner/, worker/, util/, process/, perf_hooks/, inspector/); `builtins/` -> standalone
 builtin functions (CommonJS.ts, ConsoleObject.ts, Ipc.ts, JSBuffer*.ts, ProcessObjectInternals.ts, UtilInspect.ts, BundlerPlugin.ts
 Bake.ts, Glob.ts, Peek.ts, Fifo.ts, WasmStreaming.ts, shell.ts, NodeModuleObject.ts); `eval/` (node-repl.ts, fuzzilli-reprl.ts);
 `internal-for-testing.ts` (`bun:internal-for-testing`).
- README still says `./functions`; the real directory is `builtins/`.
- Wiring a module to the resolver is separate: `src/resolve_builtins/HardcodedModule.rs` (and native C++ modules `src/jsc/modules/`).

## Modules are NOT ES modules
- Each file gets a numeric ID (A-Z sort), wrapped in a function, inlined into an array of lazily initialized modules; loaded by ID via
 `InternalModuleRegistry.cpp` (`$getInternalField($internalModuleRegistry, n)` / `$requireId(n)`).
- `require("x")` must be a **string literal** resolving to a module in src/js (`require("node:events")`, `require("internal/validators")`);
 dynamic require is impossible.
- No non-type `import`. `import type` is fine.
- Export with `export default { ... }` (rewritten to `$exports = ...` then `return`); named `export function` become properties of the
 default object. For userland ESM, default object props become named exports.
- Lazy-load heavy deps inside functions: `(_lazyGlob ??= require("internal/fs/glob"))`.
- Builtin functions (`builtins/*.ts`): each function bundled separately — no globals, no cross-references; C++ accesses via
 `<file><Function>CodeGenerator(vm)` e.g. `shellCreateBunShellTemplateFunctionCodeGenerator`, `putDirectBuiltinFunction(vm, global, ident
 fifoCreateFIFOCodeGenerator(vm), attrs)`.

## `$` syntax
- `$foo` -> `__intrinsic__foo` -> `@foo` (JSC private name). Not replaced inside strings/comments/regex (regex-based preprocessor, edge
 cases possible).
- Private globals: `$Array`, `$Promise`, `$Uint8Array`, `$String`, `$RegExp`, streams classes... The list `globalsToPrefix` in
 replacements.ts (AbortSignal, Array, ArrayBuffer, Buffer, Infinity, Promise, ReadableStream*, TransformStream*, Uint8Array, String
 RegExp, WritableStream*, isFinite, undefined) is **auto-prefixed** by `define`; `extends X` for those keeps the public one.
- Private methods: `map.$set`, `promise.$then`, `fn.$call(this...)`, `fn.$apply(this, args)` — **always use `.$call`/`.$apply`, never
 `.call`/`.apply`** (tamper-proof).
- JSC intrinsics: `$newArrayWithSize(n)`, `$isCallable`, `$isPromise`, `$getInternalField`, `$isObject`, `$toLength`... (misuse can
 segfault the parser).
- Macros (`function_replacements`): 
- `$debug(...)` -> `(IS_BUN_DEVELOPMENT ? $debug_log(...) : void 0)`; enabled with `BUN_DEBUG_<MODULE_NAME>=1`, `BUN_DEBUG_JS=1` or
 `BUN_DEBUG_ALL=1`; `if ($debug)` checks.
 - `$assert(cond...msg)` debug-only; logs source text of failed condition, does not abort.
- `$rust("file.rs", "symbol")` -> `$lazy(id)` returning the value of the Rust fn; `$newRustFunction("file.rs", "symbol", argCount)` -> JS
 function wrapping a Rust host fn. `$cpp("File.cpp", "symbol")` / `$newCppFunction(...)` same for C++. `$bindgenFn("x.bind.ts", "fn")`
 for bindgen. Arguments must be literals (JSON-parseable).
 - `$isPromiseFulfilled/Rejected/Pending(p)` -> `$peekPromiseStatus`.
- `$rust` file identifiers must be registered in `rustIdentifierPaths` in `src/codegen/generate-js2native.ts` (e.g. `"node_net_binding.rs":
 "runtime/node/node_net_binding.rs"`, `"ffi.rs": "runtime/ffi/ffi.rs"`, `"postgres.rs": "sql_jsc/postgres.rs"`, `"ipc.rs":
 "runtime/ipc_host.rs"`). Codegen emits `#[no_mangle] extern "C" JS2Rust__<path>_<sym>` thunks into `generated_js2native.rs` calling
 `crate::<mod path>::<snake_symbol>` (dotted `A.b` -> `a::b`); paths outside `src/runtime/` go via
 `crate::dispatch::js2native::<flat_name>` (`src/runtime/dispatch_js2native.rs`). Missing fn = compile error.
- Errors: `$ERR_XXX(args)` for any code in `src/jsc/bindings/ErrorCode.ts` -> `$makeErrorWithCode(index...)`; variants
 `$ERR_XXX_RangeError(...)` for extra ctors. `throw new TypeError` -> `$throwTypeError`, `new TypeError` -> `$makeTypeError`, `throw new
 RangeError` -> `$throwRangeError`. `notImplementedIssue(1234, "x")` / `notImplementedIssueFn(...)` global replacements.
- `$inherits<ClassName>(v)` -> `$inherits(id, v)` for classes in `src/jsc/bindings/js_classes.ts`.
- Enums: `$LoaderIdToLabel` / `$LoaderLabelToId`, `$ImportKindIdToLabel/LabelToId` (ids start at 1).
- `define`: `process.platform` / `process.arch` inlined & DCE'd (TARGET_PLATFORM/TARGET_ARCH env), `IS_BUN_DEVELOPMENT`, `process.env.NODE_ENV`.
- `$processBindingConstants.fs` etc. for constants; `$lazy(...)` for lazy native values.

## Build
`Source TS -> preprocessor ($ -> __intrinsic__, require -> $requireId(n)) -> Bun bundler -> extract via $$capture_start$$ -> __intrinsic__
-> @ -> C++ headers` (createBuiltin). Debug builds load `build/debug/js/*` from disk (path baked in) so `bun run build` reloads JS without
native relink; release inlines minified code. Re-run `bun bd` / `bun run build` after changing files or the file list.

## Style rules from CLAUDE.md
Validate args with `require("internal/validators")` helpers and `$ERR_*`; use `$isCallable` not `typeof`; prefer intrinsics for perf. For
Node modules, match Node error contract exactly (`bun-runtime-node-compat`).

Related: `bun-runtime-bun-apis`, `bun-runtime-node-compat`.
