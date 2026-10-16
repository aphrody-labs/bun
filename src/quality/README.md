# Bun syntax and quality owners

The ECMA parser, transformer, linter and formatters are maintained inside Bun's
root Cargo workspace. Their source lives with the runtime domain that owns it;
there is no separate Oxc workspace or source fetch step.

| Capability                                             | Canonical source owner                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Arena, collections, typed indices                      | `src/collections/{arena,ecma,typed_index}`                                                                                      |
| Strings                                                | `src/bun_core/ecma_strings`                                                                                                     |
| AST, spans, syntax, ESTree, visitors                   | `src/ast/{ecma,macros,visit,span,syntax,estree,estree_tokens,traverse}`                                                         |
| Lexer, parser, regexp, JSDoc                           | `src/js_parser/{ecma,lexer,regexp,jsdoc}`                                                                                       |
| Semantic analysis, control flow, language semantics    | `src/sema/{ecma,cfg,ecmascript}`                                                                                                |
| Printer                                                | `src/js_printer/ecma`                                                                                                           |
| Transform, declarations, minification, compatibility   | `src/transpiler/{ecma,ecma_engine,compat,declarations,mangler,minifier,plugins,relay,browserslist}`                             |
| React compiler                                         | `src/react_compiler/ecma`                                                                                                       |
| Resolution and source maps                             | `src/resolver/ecma`, `src/sourcemap/ecma`                                                                                       |
| CSS, GraphQL, YAML, Markdown, TOML, JSON Schema        | `src/css/parser`, `src/parsers/{graphql,yaml,toml_formatter,json_schema,json_schema_macros}`, `src/md/parser`                   |
| Lint rules and diagnostics                             | `src/quality/{linter,lint_cli,config,diagnostics,macros}`                                                                       |
| Formatters and conformance                             | `src/quality/{format_cli,format_core,format_js,format_css,format_graphql,format_json,format_markdown,format_yaml,format_tests}` |
| Language server                                        | `src/lsp/quality`                                                                                                               |
| Generators, benchmarks, coverage and conformance tools | `src/codegen/ecma_*`                                                                                                            |
| Runtime facade                                         | `src/transpiler/ecma_api`, `src/quality/src`                                                                                    |
| Native adapters                                        | `src/quality/adapters/{common,parser,minify,transform,react,relay,playground}`                                                  |
| JavaScript parser and transform/minify declarations    | `packages/bun-oxc/src/{parser-core,transform-core,minify-core}`                                                                 |

Internal Cargo package names use `bun_*`. Existing Rust library names and
dependency aliases such as `oxc_parser` remain compatibility names for the same
local packages. The npm plugin names, Node-API exports and runtime C ABI remain
public compatibility contracts.

Edit generators under `src/codegen`, and edit canonical JavaScript under
`packages/bun-oxc/src`; generated parser outputs belong to `parser-core`.
The addon build entry point is `scripts/aphrody/build-napi.ts packages/bun-oxc`.
It builds the root workspace addon and locates the Cargo compiler artifact.

The code originated in Oxc and its separately released language components.
Original authors, component versions, licenses and attribution are retained.
The umbrella notices are in `src/transpiler/ecma_engine/LICENSE` and
`THIRD-PARTY-LICENSE`; component-specific license files remain beside their
sources. Fixture encodings, line endings, symlinks and intentionally nested
`node_modules` directories are test data and must be preserved byte for byte.
