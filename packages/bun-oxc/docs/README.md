# Oxc in the fork's packages

[Oxc](https://oxc.rs) is a JavaScript and TypeScript toolchain written in Rust. Two packages of this
repository use it. Each one is its own Cargo workspace and pins the Oxc crates from crates.io.

| Package                                        | Crates               | Oxc crates                                                                                                                                            |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/bun-oxc` (`@aphrody/bun-plugin-oxc`) | `aphrody-oxc-bridge` | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_codegen`, `oxc_minifier`, `oxc_parser`, `oxc_semantic`, `oxc_span`, `oxc_syntax`, `oxc_transformer` |
| `packages/bun-n2b` (`@aphrody/bun-plugin-n2b`) | `aphrody-n2b-core`   | `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_parser`, `oxc_span`                                                                                 |

Bun itself does not use Oxc. `Bun.Transpiler`, `Bun.build`, `bun test` and the runtime keep Bun's own
parser and printer.

## `aphrody-oxc-bridge`

The bridge exposes synchronous Rust functions. The extension of `filename` selects the syntax
(`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`).

| Function                         | Result                                              |
| -------------------------------- | --------------------------------------------------- |
| `transform(source, filename, …)` | TypeScript and JSX compiled to JavaScript           |
| `minify(source, filename)`       | Minified code                                       |
| `format(source, filename)`       | Code formatted with Oxc's default options           |
| `lint(source, filename)`         | Diagnostics from Oxc's default rule set             |
| `analyze(source, filename)`      | Static module requests and exports, in source order |
| `parse(source, filename)`        | The ESTree JSON program                             |

### C ABI

`aphrody_oxc_abi_version()` returns `1`. The ABI exports `aphrody_oxc_format`, `aphrody_oxc_minify`,
`aphrody_oxc_lint`, `aphrody_oxc_analyze`, `aphrody_oxc_parse` and `aphrody_oxc_free`.

- Inputs are NUL-terminated UTF-8 `source` and `filename` strings.
- Each call returns a JSON string: `{ "ok": true, "code": "…" }` for format and minify,
  `{ "ok": true, "diagnostics": [ … ] }` for lint, `{ "ok": true, "result": … }` for analyze and
  parse, and `{ "ok": false, "error": "…" }` on failure.
- Analyze and parse use UTF-16 spans and report parser errors with `kind: "syntax"`.
- Release every result once with `aphrody_oxc_free`. It accepts null.
- A panic becomes an error result. Build the library with `panic = "unwind"` to keep that boundary.

## Oxc in n2b

`aphrody-n2b-core` parses each JavaScript and TypeScript source with `oxc_parser` and walks the AST
with `oxc_ast_visit` (`crates/n2b-core/src/rules/imports_ast.rs`). The result is an import graph
that maps each local binding to the module it comes from. n2b rules match a symbol only when it is
really imported from the expected module. See
[`packages/bun-n2b/docs/rules.md`](../../bun-n2b/docs/rules.md#import-aware-matching).
