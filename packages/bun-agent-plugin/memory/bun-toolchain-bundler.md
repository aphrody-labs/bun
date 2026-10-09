---
name: bun-toolchain-bundler
description: "Bun bundler (src/bundler) - BundleV2 scan/parse phase, LinkerContext link pipeline (esbuild linker.go port), tree shaking, chunking, codegen, plugins, loaders, HTML/CSS, bytecode, Bun.build and --compile"
metadata:
 type: reference
---

# Bundler — `src/bundler/` (crate `bun_bundler`)

Architecture is esbuild's `internal/bundler/bundler.go` (scan phase) + `internal/linker/linker.go` (link phase)
via Zig `bundle_v2.zig`/`LinkerContext.zig`. The authoritative walkthrough is
`src/bundler/linker_context/README.md` (1.1k lines; step-by-step per file).

## Entry points
- CLI `bun build`: `src/runtime/cli/build_command.rs` -> `BundleV2::generate_from_cli` (bundle_v2.rs ~4386);
 `--compile` then `StandaloneModuleGraph::to_executable` (build_command.rs ~924); `--check` ->
 `check_command::check_for_build_command` (`bun-toolchain-check-sema`).
- JS `Bun.build`: `src/runtime/api/JSBundler.rs` (config parsing `Config::from_js`, plugin host
 `BuildArtifact`) -> `BundleThread<JSBundleCompletionTask>` (`BundleThread.rs`, dedicated bundling thread)
 -> `BundleV2::run_from_js_in_new_thread`. JSC bridge crate `src/bundler_jsc/` (`options_jsc.rs` CompileTarget
 parse, `analyze_jsc.rs` ModuleInfo -> JSC module record). Plugin JS glue `src/js/builtins/BundlerPlugin.ts`
 C++ `src/jsc/bindings/JSBundlerPlugin.cpp`.
- DevServer: `start_from_bake_dev_server` / `finish_from_bake_dev_server`, `enqueue_entry_points_dev_server`;
 production bake: `generate_from_bake_production_cli` (`bun-toolchain-bake`).

## Scan phase (bundle_v2.rs ~8.4k)
`BundleV2::init` -> `enqueue_entry_points_normal` -> per file `ParseTask` on `ThreadPool` (per-worker
mimalloc arena + cloned `Transpiler`, `ThreadPool.rs`) -> `ParseTask.rs::get_ast` dispatches on `Loader`
(JS/TS/JSX/TSX parse; Json/Jsonc/Toml/Yaml/Json5/Xml/Text/Md -> lazy-export AST; Sqlite; Napi; Html via
`HTMLScanner.rs` (lol_html); Css via `bun_css`; File/Wasm -> URL asset; Dataurl/Base64) ->
`on_parse_task_complete` -> `resolve_import_records` / `run_resolver` -> enqueue more -> `wait_for_parse`.
Then in `generate_from_cli`: `fail_if_no_entry_points`, `type_check`, `scan_for_secondary_paths`
`process_server_component_manifest_files`, `find_reachable_files`, `process_files_to_copy`
`add_server_component_boundaries_as_extra_entry_points`, `clone_ast`, `linker.link(...)`, then
`generate_chunks_in_parallel`.
- `Graph.rs` `Graph { pool, entry_points, input_files (SoA: source, loader, side_effects…), ast (SoA of
 `BundledAst`), build_graphs, server_component_boundaries }`. `bundled_ast.rs` = slim `Ast` for bundling (SoA
 `MultiArrayList`; CSS column `CssCol`). `PathToSourceIndexMap.rs`. Source index 0 = runtime (`src/runtime.js`).
- Plugins: `on_resolve`/`on_load` (+ `_async`/`_mini`), `enqueue_on_resolve_plugin_if_needed`
 `enqueue_on_load_plugin_if_needed`; `.defer` handled by `DeferredBatchTask.rs`; native
 `onBeforeParse` plugins via C ABI `OnBeforeParseArguments`/`OnBeforeParseResult` (ParseTask.rs ~1626;
 `bundler_plugin.h`; tests `test/bundler/native-plugin.test.ts`, `native_plugin.cc`).
- `barrel_imports.rs`: barrel-file optimization (defer unused submodules of pure re-export barrels; Rolldown-style
 `requested_exports`); configured by `Bun.build({ optimizeImports: [...] })` (JSBundler.rs ~1124). `ServerComponentParseTask.rs` + `AstBuilder.rs`
 generate RSC boundary modules without the parser. `HTMLImportManifest.rs`: `import html from "./x.html"` ->
 `__jsonParse(manifest)`. `defines.rs` (`--define`, env inlining), `entry_points.rs`, `options.rs` (~2.6k:
 `BundleOptions` ~200 fields, `DefaultLoaders`, `PathTemplate` [name]/[hash]/[dir]/[ext], `SourceMapOption`
 `CompileMode`, `PackagesOption`, `TypeChecked`).

## Link phase — `LinkerContext::link` (LinkerContext.rs ~854)
`load` (graph setup, runtime refs `__esm`/`__commonJS`) -> `compute_data_for_source_map` -> 
`process_html_import_files` -> TLA validation (`validate_tla`, `propagate_async_dependencies`) ->
`scan_imports_and_exports` (6 steps: CJS classification / wrapper propagation `WrapKind {None, Cjs, Esm}` (bundle_v2.rs ~8183) / resolve
`export *` / `match_imports_with_exports` (`advance_import_tracker`) / namespace exports (`doStep5.rs`) / bind
imports) -> `tree_shaking_and_code_splitting` (`mark_file_live_for_tree_shaking`, `mark_part_live_step`
worklist `TreeShakeWork`, liveness in `LinkerGraph::parts_live` bitsets; `mark_file_reachable_for_code_splitting`
sets `File.entry_bits`) -> `compute_chunks` (chunk key = entry_bits; `mergeSmallChunks.rs` folds equal-load
-condition chunks, `--min-chunk-size`) -> `compute_cross_chunk_dependencies` -> `symbols.follow_all`.
- `LinkerGraph.rs`: `LinkerGraph { files, files_live, parts_live, entry_points, symbols, ast, meta
 reachable_files, stable_source_indices, ts_enums, import_member_bindings }`; `File { entry_bits, input_file
 entry_point_kind, entry_point_chunk_index, line_offset_table, quoted_source_contents }`.
- `Chunk.rs`: `Chunk { unique_key, entry_bits, final_rel_path, template, cross_chunk_imports, content
 (Content::Javascript|Css|Html), renamer, compile_results_for_chunk, intermediate_output, isolated_hash, … }`;
 `OutputPieces` + `Query` placeholders patched with final hashes (`break_output_into_pieces`).
- `linker_context/` files (one pass each): `scanImportsAndExports`, `doStep5`, `computeChunks`
 `mergeSmallChunks`, `computeCrossChunkDependencies`, `crossChunkNames`, `findAllImportedPartsInJSOrder`
 (EntryWalk order, chunk owner by `load_rank`), `findImportedCSSFilesInJSOrder`, `findImportedFilesInCSSOrder`
 `renameSymbolsInChunk` (renamer), `generateChunksInParallel` (rename -> codegen per part range ->
 post-process -> write), `generateCodeForFileInChunkJS`, `generateCompileResultFor{JS,Css,Html}Chunk`
 `generateCodeForLazyExport`, `convertStmtsForChunk` (format-specific import/export rewriting)
 `convertStmtsForChunkForDevServer`, `prepareCssAstsForChunk`, `postProcess{JS,CSS,HTML}Chunk`
 `writeOutputFilesToDisk`, `MetafileBuilder` (`--metafile`), `OutputFileListBuilder`, `StaticRouteVisitor`.
- Output: `OutputFile.rs`. Formats `esm|cjs|iife|internal_bake_dev`.

## Bytecode / compile
- `--bytecode`: JSC bytecode via link-time externs `__bun_jsc_generate_cached_bytecode`, link encoder
 (`__bun_jsc_bytecode_link_encoder_*`), `chunk_gets_bytecode`. `prelinked_module_graph.rs` builds
 `JSC::PrelinkedModuleGraph` tables (bump `VERSION` both sides, WebKit `runtime/PrelinkedModuleGraph.h`).
 `bytecode_order.rs` reads `--bytecode-order` files (written by a run with `BUN_BYTECODE_ORDER_OUT`), naming
 functions by `js_parser/function_identities.rs` hashes.
- `src/standalone_graph/StandaloneModuleGraph.rs` (~3.5k): embedded virtual FS (`BASE_PATH` `/$bunfs/`, Windows
 `B:\~BUN\`), `File`, `to_bytes`/`to_executable`/`inject`/`from_executable`, `TRAILER = "\n---- Bun! ----\n"`;
 payload in Mach-O segment `__BUN`, PE section `.bun`, ELF RW PT_LOAD (writers in `src/exe_format/{elf,macho,pe}.rs`)
 8-byte length header; bytecode aligned so `offset % 128 == 120`. Cross-compile downloads target bun
 (`download_to_path`). LIEF was abandoned (350 ms overhead).

## Related
`bun-toolchain-parser` · `bun-toolchain-printer-ast` · `bun-toolchain-css-parsers` · `bun-toolchain-bake` · `bun-toolchain-bundler-tests`
