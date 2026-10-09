---
name: bun-toolchain-transpiler-resolver
description: "Bun Transpiler struct (runtime single-file transpile path, RuntimeTranspilerCache, Bun.Transpiler) and the module resolver (src/resolver - node_modules, exports/imports, tsconfig paths, browser map, DirInfo caches)"
metadata:
 type: reference
---

# Transpiler + resolver

## `Transpiler` (lives in `src/bundler/transpiler.rs`)
- `src/transpiler/lib.rs` is an 8-line re-export (`bun_transpiler`) so install/CLI tiers avoid depending on
 `bun_bundler`.
- `pub struct Transpiler<'a>` = the pre-`bundle_v2` single-file pipeline, now mostly a config object
 (options, resolver, log, env, `resolve_queue`). One lives on every `VirtualMachine`; workers clone via
 `Transpiler::for_worker` + `wire_after_move` (see `bun-toolchain-bundler` ThreadPool).
- Key fns: `configure_defines`, `configure_linker{,_with_auto_jsx}`, `run_env_loader`, `resolve_entry_point`
 `sync_resolver_opts`, `parse` / `parse_maybe_return_file_only*` (`ParseOptions` -> `ParseResult`)
 `print`, `print_with_source_map`, `transform`. `resolver_bundle_options_subset` projects the ~200-field
 `bun_bundler::options::BundleOptions` into `bun_resolver::options::BundleOptions`.
- Runtime module loading (`bun run x.ts`): `src/jsc/ModuleLoader.rs` (struct + builtins lookup) ->
 `transpile_source_code` in `bun_runtime::jsc_hooks` (link-time `extern "Rust"`); async path
 `src/jsc/RuntimeTranspilerStore.rs`; C++ side `src/jsc/bindings/ModuleLoader.cpp`.
- On-disk cache: `src/jsc/RuntimeTranspilerCache.rs` — `.pile` files keyed by Wyhash of source + parser
 options (`Options::hash_for_runtime_transpiler`); `MINIMUM_CACHE_SIZE = 4 KiB`; dir via
 `BUN_RUNTIME_TRANSPILER_CACHE_PATH`; doc-comment version list must be bumped on parser/format changes. Parser
 checks it after hashbang/`// @bun` (`Result::Cached`); `// @bun` files are never cached. Extension trait in
 `src/bundler/cache.rs`. Tests: `test/bundler/transpiler/runtime-transpiler.test.ts`.
- `Bun.Transpiler` API: `src/runtime/api/JSTranspiler.rs` (transform/transformSync/scan/scanImports).
 Tests: `test/bundler/transpiler/transpiler.test.js`.

## Resolver — `src/resolver/` (crate `bun_resolver`; esbuild `internal/resolver/resolver.go` port)
- `resolver.rs` (~6.9k): `Resolver<'a>`. Entry points: `resolve(source_dir, import_path, kind)`
 `resolve_and_auto_install(.., global_cache) -> ResultUnion`, `resolve_with_framework`.
 Pipeline: `resolve_without_symlinks` (externals, data: URLs, absolute/relative paths, `browser` map via
 `check_browser_map`, nonexistent-source-dir fallback to nearest existing dir for createRequire/plugins) ->
 `resolve_without_remapping` (tsconfig `paths` via `match_tsconfig_paths` / `resolve_via_tsconfig_paths`
 then `baseUrl`; package.json `imports` `#x` via `load_package_imports`; self-reference; then
 `load_node_modules` walking parents, skipping dirs named node_modules; `exports` resolved with
 `ESModule` against "/" then joined, conditions from import kind; retries without extension for packages
 missing extensions in exports) -> `load_as_file_or_directory` / `load_as_file` / `load_as_index` /
 `load_from_main_field` / `probe_target_extensions` -> `finalize_result` (symlink realpath, side effects
 module type).
- Auto-install: `get_package_manager` -> `#[no_mangle] __bun_resolver_init_package_manager` in
 `bun_install::auto_installer`; `enqueue_dependency_to_resolve`, `use_package_manager`.
- `package_json.rs`: `PackageJSON` (name, source, json_tape, main_fields, module_type, version, scripts
 config, arch, os, dependencies, `side_effects: SideEffects`, browser_map, `exports`, `imports`)
 `ExportsMap`, `ESModule` (Node's PACKAGE_EXPORTS_RESOLVE / PACKAGE_IMPORTS_RESOLVE: `resolve_exports`
 `resolve_imports`, `resolve_target`, invalid-segment checks), `parse_macros_json` (macro remap).
- `tsconfig_json.rs`: `TSConfigJSON` (abs_path, base_url, base_url_for_paths, extends, paths, jsx, jsx_flags
 preserve_imports_not_used_as_values, emit_decorator_metadata, experimental_decorators
 use_define_for_class_fields); `JsonCache`. Loaded by `load_tsconfig` along the `extends` chain;
 `tsconfig_override` for `--tsconfig-override`.
- `dir_info.rs`: `DirInfo` (parent, enclosing_browser_scope, package_json_for_browser_field
 enclosing_tsconfig_json, enclosing_package_json, package_json_for_module_type, package_json_for_dependencies
 abs_path, entries, package_json, tsconfig_json, abs_real_path, flags). Cached in a process-lifetime BSSMap
 (`dir_info_cached` / `dir_info_uncached`); `DirInfoRef` backref used (not `&mut`) to avoid Stacked-Borrows UB on
 re-entry.
- `lib.rs` holds `pub mod fs` (`FileSystem` singleton, `RealFS`, `DirEntry`, `Entry`, `EntryCache`
 `DirnameStore`, `FilenameStoreAppender`), `dir_entry_accessor`, `cache` (`cache::Set` = file `Fs` cache + JSON
 cache). `bust_dir_cache{,_from_specifier}` for watch/HMR invalidation.
- `options.rs`: resolver-tier `BundleOptions`, `Conditions`, `ExternalModules`, `WildcardPattern`
 `ExtensionOrder`, `Packages`, `Framework`. `result.rs`: `Result`, `PathPair`, `MatchResult`, `LoadResult`
 `DebugLogs` (`--verbose` resolution logs). `data_url.rs`, `node_fallbacks.rs` (browser polyfills for node
 builtins; sources in `src/node-fallbacks/`), `standalone_module_graph.rs` (trait so resolver can read the
 `--compile` embedded `$bunfs`; impl in `bun_standalone_graph`).
- Builtin module aliasing (`node:fs`, `bun:*`): crate `src/resolve_builtins/` (`HardcodedModule`).
- Tests: `test/bundler/resolver/cache-*.test.ts`, `test/bundler/esbuild/packagejson.test.ts`
 `test/bundler/esbuild/tsconfig.test.ts`, `test/js/bun/resolve/`.

## Related
`bun-toolchain-parser` · `bun-toolchain-bundler` · `bun-toolchain-printer-ast`
