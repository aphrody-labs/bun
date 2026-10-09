---
name: bun-toolchain-parser
description: "Bun JS/TS parser (src/js_parser) — lexer, P struct, parse/visit passes, TS/JSX, macros, lowering, React Refresh/Compiler hooks, sema mode; esbuild js_parser.go heritage"
metadata:
 type: reference
---

# Bun JS/TS parser — `src/js_parser/` (crate `bun_js_parser`)

Lineage: esbuild `internal/js_parser/js_parser.go` -> Zig port (`js_parser.zig`) -> Rust port (comments still say
"Zig", `PORTING.md`, `REFACTOR_BUN_AST`, "MOVE_DOWN" — those docs are not in the tree). Two-pass design is
esbuild's: **parse pass** builds AST + scopes without binding, **visit pass** binds symbols, folds constants
lowers syntax, splits top-level into `Part`s. AST types live in `bun_ast` (`bun-toolchain-printer-ast`).

## Layout
- `lib.rs` — module map; `Macro` stub module (`NAMESPACE = "macro"`, `MacroContext { javascript_object: MacroJSCtx(i64), data }`)
 calling `extern "Rust"` `__bun_macro_context_{init,deinit,call,get_remap}` defined `#[no_mangle]` in
 `src/js_parser_jsc/Macro.rs` (breaks crate cycle; same link-time-extern pattern used throughout the port).
- `lexer.rs` (~5.4k lines) — `Lexer<'a>`, `next`, `next_inside_jsx_element`, `scan_reg_exp`, template rescans
 `expect_or_insert_semicolon`, `LexerSnapshot` (TS backtracking). Tokens `T` / keyword tables in
 `src/ast/lexer_tables.rs`; identifier tables in `bun_core::identifier`. Also records eslint-disable/suppression
 comments for the React Compiler and pragmas (`@jsx`, `@jsxImportSource`, `# sourceMappingURL`).
- `p.rs` (~10.6k) — `pub struct P<'a, const TYPESCRIPT: bool, const SCAN_ONLY: bool, const SEMA: bool = false>`
 (~5 KiB; built in-place via `init_p!` macro in parse_entry.rs to avoid memcpy). JSX is a *runtime* field
 `jsx_transform` (de-monomorphized to cut startup page faults). Holds refs: `exports_ref`, `require_ref`
 `module_ref`, `import_meta_ref`, `hmr_api_ref`, `response_ref` + `bun_app_namespace_ref` (bake `Response`)
 `bundler_feature_flag_ref` (`import { feature } from "bun:bundle"`). Big helpers: `to_ast`, `append_part`
 `prepare_for_visit_pass`, `declare_symbol`, `record_usage`, `lower_class`
 `generate_closure_for_type_script_namespace_or_enum`, `compute_ts_enums_map`, `transpose_require*`
 `maybe_transpose_if_import`, `handle_react_refresh_*`, `emit_react_refresh_register`
 `handle_import_meta_hot_accept_call`, `substitute_single_use_symbol_in_*` (esbuild's single-use inlining)
 `stmts_can_be_removed_if_unused`, `expr_can_be_removed_if_unused`, `compute_character_frequency`.
- `parser.rs` — shared helper types: `options` (Parser Options, `RuntimeFeatures`), `JSXImport` tags
 `ScanPassResult`, `DeferredErrors`, `ParseStatementOptions`, `StringVoidMap` pool, `ExprIn` flags.
- `parse/` — parse pass: `parse_entry.rs` (`Parser`, `Options`, `JavaScriptParser = P<false,false>`
 `TSXParser = P<true,false>`), `parse_stmt.rs`, `parse_prefix.rs`/`parse_suffix.rs` (Pratt-style expr)
 `parse_fn.rs`, `parse_property.rs`, `parse_import_export.rs`, `parse_jsx.rs`, `parse_typescript.rs`
 `parse_skip_typescript.rs` (~5k: skips type syntax, esbuild `ts_parser.go` equivalent), `lists.rs`.
 `import x from "y" with { type: "macro" }` sets `path.is_macro` (parse/mod.rs ~2654).
- `visit/` — visit pass: `mod.rs` (visit_stmts, visit_func, visit_class, visit_decls, binding), `visit_stmt.rs`
 (`s_import`, `s_export_*`, `s_local`, `s_if`, `s_enum`, `s_namespace`, …), `visit_expr.rs` (`e_call`, `e_dot`
 `e_index`, `e_jsx_element`, `e_import_meta`, `maybe_replace_bundler_feature_call` …), `visit_binary.rs`
 (iterative binary-expression stack, `binary_expression_stack`).
- `fold.rs` — constant folding / property-access rewrites; `typescript.rs` — TS token predicates
 (`is_ts_arrow_fn_jsx`, `can_follow_type_arguments_in_expression`, ported from tsc parser.ts).
- `scan/` — `scan_imports.rs` (`Parser::scan_imports`, used by `Bun.Transpiler.scan*` and dependency scan)
 `scan_side_effects.rs` (`SideEffects`, `should_keep_stmt_in_dead_control_flow`, purity analysis)
 `scan_symbols.rs`.
- `lower/` — `lower_decorators.rs` (TC39 standard decorators; legacy TS decorators via runtime
 `__legacyDecorateClassTS`), `lower_esm_exports_hmr.rs` (`ConvertESMExportsForHmr` for DevServer HMR format).
 `using` lowering lives in p.rs (`LowerUsingDeclarationsContext`, `should_lower_using_declarations`).
- `defines_table.rs` + generated `defines_table.generated.rs` (from `defines_table.string-map.ts`): known
 side-effect-free globals / property chains (esbuild `config/globals.go`).
- `function_identities.rs` — hashes functions for `--compile --bytecode-order` files.
- `repl_transforms.rs` — REPL mode (wrap last expr `{ value: expr }`, async IIFE, hoisting).
- `react_compiler_host.rs` — adapter implementing `bun_react_compiler::Host` over `&mut P`, invoked post-visit
 from visit_stmt.rs.
- `sema/` — TypeScript type-checker front-end mode (`SEMA = true`): keeps type syntax (`keep.rs`
 `ts_syntax.rs`), `jsdoc.rs`/`reparse.rs` for JSDoc types in JS, `lower.rs` lowers to `bun_sema::hir`.
 See `bun-toolchain-check-sema`. Note `bun build --check` parses each file twice.

## Parse flow (`Parser::_parse<TS>`, parse_entry.rs ~999)
1. `init_p!` -> consume hashbang -> `// @bun` pragma check (`has_bun_pragma`, `dont_bundle_twice` -> `Result::AlreadyBundled`).
2. `RuntimeTranspilerCache` lookup (`Result::Cached`) — see `bun-toolchain-transpiler-resolver`.
3. `parse_stmts_up_to(TEndOfFile)` (parse ~2x cost of visit).
4. `prepare_for_visit_pass`; statements split into parts via `append_part` (each top-level stmt -> `Part`
 enums/namespaces specially), imports hoisted, `exports_kind` / `WrapMode` decided (ESM vs CJS detection
 `force_cjs_to_esm`, `commonjs_named_exports`).
5. `p.to_ast(parts, exports_kind, wrap_mode, hashbang)` -> `crate::Result::Ast(Ast)`.
Other entries: `parse_only` (no visit), `scan_imports`, `to_lazy_export_ast` (JSON/TOML/etc loaders produce a
lazy-export AST), `parse_for_sema`.

## Options worth knowing (`parse_entry::Options`, `parser::options`)
`jsx` (`JSX::Pragma`), `ts`, `keep_names`, `ignore_dce_annotations`, `preserve_unused_imports_ts`
`use_define_for_class_fields`, `features`, `tree_shaking`, `bundle`, `code_splitting`, `macro_context`
`allow_unresolved`, `module_type`, `jsc_builtin_syntax`, `output_format`, `transform_only`
`import_meta_main_value`, `framework`, `repl_mode`, `is_entry_point`, `tolerant` (sema). `features`
(`RuntimeFeatures`): `react_fast_refresh`, `react_compiler`, `hot_module_reloading`, `server_components`
`is_macro_runtime`, `inlining`, `inject_jest_globals`, `no_macros`, `commonjs_named_exports`, `minify_syntax`
`minify_identifiers`, `minify_whitespace`, `dead_code_elimination`, `trim_unused_imports`, `dont_bundle_twice`
`unwrap_commonjs_packages`, `unwrap_commonjs_to_esm`, `emit_decorator_metadata`, `standard_decorators`
`runtime_transpiler_cache`, `lower_using`. `minify_syntax || inlining`
turns on `should_fold_typescript_constant_expressions` file-wide. `hash_for_runtime_transpiler` hashes options into
the cache key.

## Notable behaviors
- `feature("FLAG")` from `bun:bundle` is replaced by a boolean (only valid in if/ternary condition
 `in_branch_condition`); errors "feature requires exactly one string argument". Flags via `--feature`.
- Bake server files: `return Response(<jsx/>)` support injects `import { Response } from "bun:app"`.
- `Part.tag` values: `JsxImport, Runtime, ReactCompiler, DirnameFilename, BunTest, DeadDueToInlining
 CommonjsNamedExport, ImportToConvertFromRequire`.
- Macros: `js_parser_jsc/Macro.rs` runs the macro function in a JSC VM at bundle time
 (`MacroContext::call`, `Runner::run/coerce` converts JS value -> AST Expr). Tests:
 `test/bundler/transpiler/macro-test.test.ts`.

## React Compiler — `src/react_compiler/` (crate `bun_react_compiler`)
Port of facebook/react's Rust compiler; Bun lowers its resolved AST (Refs, scopes) directly into HIR, runs
upstream passes unchanged, emits `bun_ast` from `codegen.rs` (no Babel AST). Whole-crate ports: `hir/
diagnostics/ ssa/ inference/ typeinference/ optimization/ validation/ reactive_scopes/ utils/`; AST-boundary
ports: `lowering/`, `codegen.rs`, `pipeline.rs`, `program.rs`, `imports.rs`, `compile_result.rs`. Design doc
`src/react_compiler/DESIGN.md`; upstream pin `UPSTREAM_PORTED` (sha); re-sync procedure
`.claude/skills/sync-react-compiler.md` + `scripts/sync-react-compiler.sh`. Enabled by `--react-compiler`
(Arguments.rs), `Bun.build({ reactCompiler: true })`, `reactCompilerParseTestPragmas`; mode enum
`bun_ast::runtime::ReactCompilerMode { Disabled, Client, Ssr }`. Runtime helpers `__MEMO_CACHE_SENTINEL`
`__EARLY_RETURN_SENTINEL` in `src/runtime.js`. Tests: `test/bundler/transpiler/react-compiler{,-fixtures}.test.ts`.

## Related
`bun-toolchain-printer-ast` · `bun-toolchain-bundler` · `bun-toolchain-check-sema` · `bun-toolchain-bundler-tests`
