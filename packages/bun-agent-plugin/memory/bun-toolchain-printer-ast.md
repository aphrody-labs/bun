---
name: bun-toolchain-printer-ast
description: "Bun AST crate (src/ast: Ref packing, Expr/Stmt, Part, Ast, Loader/Target), js_printer + renamer/minifier, and sourcemap crates (VLQ, InternalSourceMap)"
metadata:
 type: reference
---

# AST, printer, renamer, source maps

esbuild heritage: `internal/js_ast` -> `src/ast`, `internal/js_printer` -> `src/js_printer`
`internal/renamer` -> `js_printer/renamer.rs`, `internal/sourcemap` -> `src/sourcemap`.

## `src/ast/` (crate `bun_ast`)
- `lib.rs` (~3.6k): `Ref` (packed u64: `inner_index:28 | user:3 | tag:2 | source_index:31`, `#[repr(C, packed(4))]`
 so `Expr` is 24 bytes / `expr::Data` 16; user bits carry E::Identifier flags and are masked from eq/hash);
 `RefTag {Invalid, AllocatedName, SourceContentsSlice, Symbol}`; `ImportKind`; `Loc`, `Range`, `Log`, `Msg`
 `Source`, `LineColumnTracker`; arena store machinery (`store_ast_alloc_heap`, `StoreResetGuard`
 `DisableStoreReset`; thread-local `#[thread_local]` slots).
- Node modules: `e.rs` (expression payloads `E::*`), `expr.rs` (`Expr`, `Data`, `Tag`, `EFlags`, `Query`
 `PrimitiveType`, loose/strict equality), `s.rs`/`stmt.rs` (`Stmt`, `S::*`), `b.rs`/`binding.rs` (bindings)
 `g.rs` (`G::Fn`, `G::Class`, `G::Property`, `Decl`), `op.rs` (`OpCode`, precedence), `scope.rs`, `symbol.rs`
 (`Symbol`, `symbol::Kind`, `Use`, `Map` with `follow_all`), `ts.rs`, `ts_syntax.rs` (sema-only type nodes)
 `nodes.rs` (`StoreRef<T>`, `StoreStr`, `StoreSlice<T>` arena handles, `Part`, `PartTag`, `ExportsKind
 {None, Cjs, Esm, EsmWithDynamicFallback, EsmWithDynamicFallbackFromCjs}`, `NamedImport/NamedExport`, `DeclaredSymbol`, `Dependency`)
 `ast_result.rs` (`Ast<'a>`: parts, symbols, module_scope, import_records, named_imports/exports
 exports_kind, `char_freq`, `commonjs_named_exports`, wrapper/exports/module/require refs, TLA keyword)
 `import_record.rs` (`ImportRecord`, `Tag`), `loader.rs`, `target.rs`, `runtime.rs` (`Runtime::source_code`
 `Imports`, `ReactCompilerMode`, `ServerComponentsMode`), `known_global.rs`, `char_freq.rs` (minifier name
 frequency), `fold_string_addition.rs`, `server_component_boundary.rs`, `use_directive.rs`
 `transpiler_cache.rs`, `lexer_tables.rs`, `base.rs` (`Index`: `RUNTIME = 0`, `BAKE_SERVER_DATA = 1`
 `BAKE_CLIENT_DATA = 2`).
- `Part` (nodes.rs): `stmts`, `scopes`, `import_record_indices`, `declared_symbols`, `symbol_uses`
 `import_symbol_property_uses` (deferred for inlined enums), `dependencies`, `can_be_removed_if_unused`
 `force_tree_shaking`, `tag`. Liveness is NOT on Part: sidecar bitset `LinkerGraph::parts_live`.
- `Loader` enum (stable u8, crosses native-plugin FFI `bundler_plugin.h`): `Jsx=0 Js Ts Tsx Css File(default)
 Json Jsonc Toml Wasm Napi Base64 Dataurl Text Bunsh Sqlite SqliteEmbedded Html Yaml Json5 Md Xml=21`.
- `Target { Browser(default), Bun, BunMacro, Node, ServerComponentsSsr }`. Output `Format` lives in
 `src/options_types/bundle_enums.rs`: `Esm, Iife, Cjs, InternalBakeDev` (HMR format).
- Arena rule (CLAUDE.md): arena values don't run `Drop` on reset — free heap-owning fields explicitly.
- `src/ast_jsc/` = JSC conversions. Bundler runtime helpers source: `src/runtime.js` (`__toESM`, `__toCommonJS`
 `__commonJS`, `__esm`, `__export`, `__reExport`, `__name`, `__legacyDecorateClassTS`, `__decorateElement`
 `__jsonParse`, `__promiseAll`, `__exportCjs` …) + `src/runtime.bun.js` (`__using`, …). Parsed as source index 0.

## `src/js_printer/` (crate `bun_js_printer`)
- `lib.rs` (~8.1k): `Printer<W, const IS_BUN_PLATFORM, const IS_JSON, …>` (pub(crate)), `print_ast`
 `print_json`, `print`, `print_with_writer`, `get_source_map_builder`, `quote_for_json`
 `write_json_string`, `Writer<C>` / `BufferWriter` / `BufferPrinter`, `Format`, `GenerateSourceMap`.
- `Options` fields: `bundling`, `to_commonjs_ref`, `to_esm_ref`, `require_ref`, `import_meta_ref`, `hmr_ref`
 `indent`, `source_map_handler`, `target`, `runtime_transpiler_cache`, `module_info`
 `input_files_for_dev_server`, `commonjs_named_exports*`, `minify_whitespace`, `minify_identifiers`
 `minify_syntax`, `print_dce_annotations`, `module_type` (Format), `ts_enums`, `line_offset_tables`
 `mangled_props`, `require_or_import_meta_for_source_callback`.
- `analyze_transpiled_module` submodule: serialized `ModuleInfo` records (ImportInfoSingle, ExportInfoIndirect…)
 handed to JSC so it can skip its own module analysis (`serialize_module_info`); deserialized in
 `src/bundler_jsc/analyze_jsc.rs` (`to_js_module_record`).
- `renamer.rs`: `Renamer` enum, `NoOpRenamer`, `NumberRenamer` (non-minified dedupe `foo2`), `MinifyRenamer`
 (frequency-based short names via `char_freq`, `StableSymbolCount`), `NestedRenamer`
 `compute_initial_reserved_names`, `compute_reserved_names_for_scope`. Called from bundler
 `renameSymbolsInChunk.rs`.

## Minifier = three flags
`minify_syntax` (parser visit/fold: constant folding, dead branches, `defines_table`, single-use substitution
ts enum inlining), `minify_identifiers` (MinifyRenamer in linker), `minify_whitespace` (printer). Property
mangling: `mangleProps` -> `MangledProps = ArrayHashMap<Ref, Box<[u8]>>`. `--keep-names` -> `__name`.

## `src/sourcemap/` (crate `bun_sourcemap`)
- `lib.rs`: parse (`ParseUrl`, `ParseResult`), `SourceMapPieces`, `SourceMapShifts`, `append_source_map_chunk`
 `DebugIDFormatter`, `SavedSourceMap`/`SerializedSourceMap` modules; VLQ from `bun_base64::vlq`.
- `Chunk.rs`: `Chunk`, `NewBuilder<T>` (`Builder = NewBuilder<VLQSourceMap>`), `LineOffsetTables`.
- `LineOffsetTable.rs`: UTF-16 column conversion tables; skipped for ASCII-only lines.
- `Mapping.rs` (`Mapping.List` MultiArrayList), `ParsedSourceMap.rs` (thread-safe refcount).
- `InternalSourceMap.rs`: Bun's private in-process format for runtime-transpiled code (windowed varint
 streams, ~2.4 bytes/mapping vs 20 for Mapping.List; `find`/`findWithCache` bsearch `SyncEntry[]`). Used by
 stack-trace remapping and coverage; consumer side `src/jsc/SavedSourceMap.rs`, `src/sourcemap_jsc/`
 (`JSSourceMap.rs` = `node:module` SourceMap, `CodeCoverage.rs`).

## Related
`bun-toolchain-parser` · `bun-toolchain-bundler` · `bun-toolchain-transpiler-resolver`
