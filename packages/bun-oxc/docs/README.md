# Oxc native owners and addon

[Oxc](https://oxc.rs) is a JavaScript and TypeScript toolchain written in Rust. Bun owns the bridge at
`src/transpiler/ecma_api`, the linter and formatter at `src/quality`, and migration at `src/migrate`, in its root Cargo workspace.
The Node-API adapter at `packages/bun-oxc/crates/napi` consumes these native owners through path dependencies.
The engines and native adapters belong to Bun's internal owners. The addons are root Cargo workspace
members and share the same AST, allocator and diagnostic types.

| Package                                                      | Crates                                               | Oxc crates                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/transpiler/ecma_api`, `src/quality`, `packages/bun-oxc` | `bun_ecma_api`, `bun_quality`, `bun-plugin-oxc-napi` | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_codegen`, `oxc_diagnostics`, `oxc_isolated_declarations`, `oxc_minifier`, `oxc_parser`, `oxc_semantic`, `oxc_span`, `oxc_syntax`, `oxc_transformer`, `oxc_resolver`, `oxc_linter`, `oxfmt`, `oxc_parser_napi`, `oxc_transform_napi`, `oxc_minify_napi` |
| `src/migrate`, `packages/bun-n2b`                            | `bun_migrate`                                        | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_parser`, `oxc_span`                                                                                                                                                                                                                                    |

`Bun.Transpiler`, `Bun.build` and `bun test` keep Bun's own parser and printer. The internal Oxc and
quality owners provide the optional tooling surface.

## `bun_ecma_api` and the addon

The bridge exposes synchronous Rust functions (`transform`, `isolated_declaration`, `minify_with`, `check`,
`resolve`, `analyze`, `parse`, `format` and `lint`) and a C ABI (version 2). The extension of
`filename` selects the syntax. `bun_quality` runs oxlint (every rule, `.oxlintrc.json`, fixes) and oxfmt
in process. The Node-API addon exposes both, plus the official `oxc-parser`/`oxc-transform`/`oxc-minify`
functions. See [`src/transpiler/ecma_api/README.md`](../../../src/transpiler/ecma_api/README.md) and [`README.md`](../README.md).

## Oxc in n2b

`bun_migrate` parses each JavaScript and TypeScript source with `oxc_parser` and walks the AST
with `oxc_ast_visit` (`src/migrate/engine/rules/imports_ast.rs`). The result is an import graph
that maps each local binding to the module it comes from. n2b rules match a symbol only when it is
really imported from the expected module. See
[`packages/bun-n2b/docs/rules.md`](../../bun-n2b/docs/rules.md#import-aware-matching).
