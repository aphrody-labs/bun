<!-- SPDX-License-Identifier: MIT -->
# aphrody-oxc-bridge

In-process [Oxc](https://oxc.rs) bridge for JavaScript and TypeScript tooling: a safe Rust API and a stable C ABI.

Provenance: moved from the Aphrody monorepo (`crates/compat/oxc-bridge`, aphrody@09f1288c) into
[aphrody-labs/bun](https://github.com/aphrody-labs/bun/tree/main/packages/bun-oxc). It builds on the crates.io Oxc
crates, currently **0.153.0** (parser, semantic, transformer, minifier, codegen). Minimum Rust: 1.97.

## Rust API

| Function | Does | Runs |
| --- | --- | --- |
| `transform(src, file, &TransformOptions)` | TypeScript/JSX to JavaScript, ES target lowering, optional source map | in-process |
| `minify(src, file)` | compress, mangle, whitespace | in-process |
| `analyze(src, file)` | static imports/exports in source order, UTF-16 spans | in-process |
| `parse(src, file)` | official ESTree JSON program, UTF-16 spans | in-process |
| `format(src, file)` | Oxc formatter | `oxfmt` binary (`APHRODY_OXFMT`) |
| `lint(src, file)` | default Oxc rules, messages | `oxlint` binary (`APHRODY_OXLINT`) |

The file extension selects the syntax. Oxc does not publish its formatter and linter as crates, so `format` and
`lint` call the binaries (PATH or the environment override) and fail with `ErrorKind::Tool` when they are missing.

```rust
use aphrody_oxc_bridge::{transform, Jsx, TransformOptions};

let out = transform(
    "export const f = (a: number) => <b>{a}</b>;",
    "view.tsx",
    &TransformOptions { jsx: Jsx::Automatic, sourcemap: true, ..Default::default() },
)?;
println!("{}", out.code);
```

Errors are `Error { kind: ErrorKind, message }` with kinds `Input`, `Syntax`, `Tool`, `Transform`, `Panic`.

## C ABI 1

Exports `aphrody_oxc_abi_version` (returns 1), `aphrody_oxc_format`, `aphrody_oxc_minify`, `aphrody_oxc_lint`,
`aphrody_oxc_analyze`, `aphrody_oxc_parse` and `aphrody_oxc_free`; they wrap the safe API. Inputs are NUL-terminated
UTF-8 source and filename strings. Format and minify return JSON `{ "ok": true, "code": "..." }`; lint returns
`{ "ok": true, "diagnostics": ["..."] }`; analyze and parse return `{ "ok": true, "result": ... }`. Failures return
`{ "ok": false, "error": "..." }`, plus `"kind"` (`input`, `syntax`, `panic`) for analyze and parse. Release every
result exactly once with `aphrody_oxc_free`, which accepts null.

The crate is an `rlib`: the consumer links it into its own dynamic library. Build that artifact with an unwind
profile to keep the panic-to-error boundary; `panic=abort` cannot recover a panic.

## Bun plugin

The npm package `@aphrody/bun-plugin-oxc` in the same directory uses this crate through a Node-API addon.
