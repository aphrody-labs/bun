<!-- SPDX-License-Identifier: MIT -->
# aphrody-oxc-bridge

In-process [Oxc](https://oxc.rs) bridge for JavaScript and TypeScript tooling: a safe Rust API and a stable C ABI.

Provenance: moved from the Aphrody monorepo (`crates/compat/oxc-bridge`, aphrody@09f1288c) into
[aphrody-labs/bun](https://github.com/aphrody-labs/bun/tree/main/packages/bun-oxc). It builds on the crates.io Oxc
crates, currently **0.153.0** (parser, semantic, transformer, isolated declarations, minifier, codegen, diagnostics)
and `oxc_resolver` **11.24.3**. Minimum Rust: 1.97. Version 0.3.0.

## Rust API

| Function | Does | Runs |
| --- | --- | --- |
| `transform(src, file, &TransformOptions)` | TypeScript/JSX to JavaScript, ES target lowering, legacy decorators and metadata, React Refresh, styled-components, runtime helpers, optional source map | in-process |
| `isolated_declaration(src, file, strip_internal, sourcemap)` | `.d.ts` under `--isolatedDeclarations` | in-process |
| `minify(src, file)` / `minify_with(src, file, &MinifyOptions)` | compress, mangle (top level), whitespace, drop console/debugger, target, source map | in-process |
| `check(src, file)` | syntax and semantic diagnostics (`{ ok, diagnostics }`, UTF-16 labels) | in-process |
| `resolve(from, specifier, &options)` | `oxc_resolver` with tsconfig paths, aliases, conditions, extensions | in-process |
| `analyze(src, file)` | static imports/exports in source order, UTF-16 spans | in-process |
| `parse(src, file)` | official ESTree JSON program, UTF-16 spans | in-process |
| `format(src, file)` | Oxc formatter | `oxfmt` binary (`APHRODY_OXFMT`) |
| `lint(src, file)` | default Oxc rules, messages | `oxlint` binary (`APHRODY_OXLINT`) |

The file extension selects the syntax. Oxc does not publish its formatter and linter as crates, so `format` and
`lint` here call the binaries; the unpublished sibling crate `aphrody-oxc-tools` runs them in process from the
`aphrody` branch of aphrody-labs/oxc. The binaries are found on PATH or through the environment override and fail with `ErrorKind::Tool` when they are missing.

```rust
use aphrody_oxc_bridge::{transform, Jsx, TransformOptions};

let out = transform(
    "export const f = (a: number) => <b>{a}</b>;",
    "view.tsx",
    &TransformOptions { jsx: Jsx::Automatic, sourcemap: true, ..Default::default() },
)?;
println!("{}", out.code);
```

`TransformOptions::from_json` and `MinifyOptions::from_json` read the camelCase JSON options of the npm package.
Errors are `Error { kind: ErrorKind, message }` with kinds `Input`, `Syntax`, `Tool`, `Transform`, `Resolve`, `Panic`.

## C ABI 2

`aphrody_oxc_abi_version` returns 2. ABI 1 exports are unchanged: `aphrody_oxc_format`, `aphrody_oxc_minify`,
`aphrody_oxc_lint`, `aphrody_oxc_analyze`, `aphrody_oxc_parse`. ABI 2 adds `aphrody_oxc_transform(source, filename,
options)`, `aphrody_oxc_isolated_declaration(source, filename, options)` (`stripInternal`, `sourcemap`),
`aphrody_oxc_minify_with(source, filename, options)`, `aphrody_oxc_check(source, filename)` and
`aphrody_oxc_resolve(from, specifier, options)`. Inputs are NUL-terminated UTF-8 strings; `options` is JSON (null or
empty for defaults). Transform, declarations and minify return `{ "ok": true, "code": "...", "map": ... }`; check and
resolve return their object with `"ok": true` merged in; format and minify (ABI 1) return `{ "ok": true, "code" }`,
lint `{ "ok": true, "diagnostics": [...] }`, analyze and parse `{ "ok": true, "result": ... }`. Failures return
`{ "ok": false, "kind": "...", "error": "..." }`. Release every result exactly once with `aphrody_oxc_free`, which
accepts null.

The crate is an `rlib`: the consumer links it into its own dynamic library. Build that artifact with an unwind
profile to keep the panic-to-error boundary; `panic=abort` cannot recover a panic.

## Bun plugin

The npm package `@aphrody/bun-plugin-oxc` in the same directory uses this crate through a Node-API addon.
