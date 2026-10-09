# Oxc in the fork's packages

[Oxc](https://oxc.rs) is a JavaScript and TypeScript toolchain written in Rust. Two packages of this
repository use it. Each one is its own Cargo workspace. `packages/bun-oxc` pins Oxc 0.153.0 (oxlint 1.87.0, oxfmt
0.72.0): the published bridge uses crates.io, and `[patch.crates-io]` points every Oxc crate at the `aphrody` branch
of aphrody-labs/oxc so the unpublished `aphrody-oxc-tools` (oxc_linter, oxfmt) and the official napi crates share
one AST. `packages/bun-n2b` pins its Oxc crates from crates.io.

| Package                                        | Crates               | Oxc crates                                                                                                                                            |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/bun-oxc` (`@aphrody/bun-plugin-oxc`) | `aphrody-oxc-bridge`, `aphrody-oxc-tools`, `bun-plugin-oxc-napi` | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_codegen`, `oxc_diagnostics`, `oxc_isolated_declarations`, `oxc_minifier`, `oxc_parser`, `oxc_semantic`, `oxc_span`, `oxc_syntax`, `oxc_transformer`, `oxc_resolver`, `oxc_linter`, `oxfmt`, `oxc_parser_napi`, `oxc_transform_napi`, `oxc_minify_napi` |
| `packages/bun-n2b` (`@aphrody/bun-plugin-n2b`) | `aphrody-n2b-core`   | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_parser`, `oxc_span`                                                                                 |

Bun itself does not use Oxc. `Bun.Transpiler`, `Bun.build`, `bun test` and the runtime keep Bun's own
parser and printer.

## `aphrody-oxc-bridge` and the addon

The bridge exposes synchronous Rust functions (`transform`, `isolated_declaration`, `minify_with`, `check`,
`resolve`, `analyze`, `parse`, and subprocess `format`/`lint`) and a C ABI (version 2). The extension of
`filename` selects the syntax. `aphrody-oxc-tools` runs oxlint (every rule, `.oxlintrc.json`, fixes) and oxfmt
in process. The Node-API addon exposes both, plus the official `oxc-parser`/`oxc-transform`/`oxc-minify`
functions. See [`crates/oxc-bridge/README.md`](../crates/oxc-bridge/README.md) and [`README.md`](../README.md).

## Oxc in n2b

`aphrody-n2b-core` parses each JavaScript and TypeScript source with `oxc_parser` and walks the AST
with `oxc_ast_visit` (`crates/n2b-core/src/rules/imports_ast.rs`). The result is an import graph
that maps each local binding to the module it comes from. n2b rules match a symbol only when it is
really imported from the expected module. See
[`packages/bun-n2b/docs/rules.md`](../../bun-n2b/docs/rules.md#import-aware-matching).
