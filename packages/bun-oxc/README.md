# @aphrody/bun-plugin-oxc

[Oxc](https://oxc.rs) for Bun in one Node-API addon: parser, transformer, isolated declarations, minifier, resolver,
oxlint (every rule and plugin, fixes) and oxfmt. It ships as a typed API, a Bun plugin (`Bun.plugin` and `Bun.build`),
drop-ins for `oxc-parser` / `oxc-transform` / `oxc-minify`, and the `bun-oxc` CLI.

Oxc version: crates **0.153.0**, oxlint **1.87.0**, oxfmt **0.72.0**, `oxc_resolver` **11.24.3**. The linter and the
formatter come from the `aphrody` branch of [aphrody-labs/oxc](https://github.com/aphrody-labs/oxc) (tag
`oxlint_v1.87.0` plus a patch that makes oxfmt's core API public); every other Oxc crate is pinned to the same commit
through `[patch.crates-io]`, so the addon holds a single copy of the AST.

```ts
import { oxcPlugin, transform, minify, lint, format, check, resolve, isolatedDeclaration } from "@aphrody/bun-plugin-oxc";

transform("const a: number = 1", "a.ts", { target: "es2019", sourcemap: true }); // { code, map }
transform(src, "a.tsx", { decorators: "legacy", reactRefresh: true, styledComponents: true });
isolatedDeclaration("export function f(a: number): string { return '' }", "a.ts"); // { code: ".d.ts" }
minify("const x = 1 + 2", "a.js", { topLevel: true, dropConsole: true });
lint("debugger;", "a.js", { config: { rules: { "no-debugger": "error" } }, fix: true }); // { diagnostics, fixed, ... }
format("const x=1", "a.ts", { config: { semi: false } });
resolve(import.meta.dir, "pkg", { conditionNames: ["import"], tsconfig: "auto" }); // { path, ... }

await Bun.build({
  entrypoints: ["./index.tsx"],
  plugins: [oxcPlugin({ minify: true, lint: "warn", dts: { outdir: "types", root: "src" } })],
});
```

## API (`@aphrody/bun-plugin-oxc`)

| Function | Result |
| --- | --- |
| `transform(source, filename, options?)` | `{ code, map? }`. `target`, `jsx`, `jsxImportSource`, `jsxPragma`, `jsxPragmaFrag`, `development`, `sourcemap`, `decorators` (`"legacy"` \| `"standard"`), `emitDecoratorMetadata`, `reactRefresh`, `styledComponents`, `helpersModule` |
| `minify(source, filename, options?)`, `minifyWithMap` | `compress`, `mangle`, `topLevel`, `whitespace`, `dropConsole`, `dropDebugger`, `target`, `sourcemap` |
| `isolatedDeclaration(source, filename, options?)` | `.d.ts` text (`stripInternal`, `sourcemap`) |
| `check(source, filename)` | syntax and semantic errors `{ ok, diagnostics }` |
| `lint(source, filename, options?)` | oxlint, every built-in rule: `{ diagnostics, fixed?, errorCount, warningCount }`. `config` (inline `.oxlintrc.json`), `configPath`, `discoverConfig`, `fix` (`true`/`"safe"`, `"suggestions"`, `"dangerous"`) |
| `lintFix`, `lintRules()` | fixed source; the rule table (`name`, `plugin`, `category`, `default`, `fix`, `docs`, `version`, `typeAware`) |
| `format(source, filename, options?)` | oxfmt (JS/TS, JSON, CSS, GraphQL, Markdown, YAML, TOML, `package.json`): `config` (inline `.oxfmtrc.json`), `configPath`, `discoverConfig` |
| `resolve(from, specifier, options?)` | `oxc_resolver`: `{ path, query, fragment, moduleType }`; `tsconfig`, `alias`, `fallback`, `conditionNames`, `extensions`, `extensionAlias`, `mainFields`, `modules`, `roots`... |
| `analyze`, `parse` | static imports/exports; ESTree JSON |
| `parseSync`, `transformSync`, `isolatedDeclarationSync`, `minifySync` | the official oxc APIs (below) |
| `formatDiagnostics`, `lineColumn` | `path:line:col severity code: message` |

Diagnostics carry `message`, `severity`, `code`, `help`, `url` and `labels` with UTF-16 offsets. Errors thrown by
the addon start with their kind: `[syntax]`, `[input]`, `[tool]`, `[transform]`, `[resolve]`.

## oxc drop-ins

`@aphrody/bun-plugin-oxc/parser`, `/transform` and `/minify` export the same functions, options and results as
`oxc-parser`, `oxc-transform` and `oxc-minify` 0.153.0 (`parseSync`, `parse`, `Visitor`, `visitorKeys`,
`transformSync`, `transform`, `isolatedDeclarationSync`, `moduleRunnerTransformSync`, `minifySync`, `minify`...). The
addon links the official `oxc_parser_napi`, `oxc_transform_napi` and `oxc_minify_napi` crates, and `vendor/oxc-parser`
holds oxc-parser's JS layer (synced by `bun scripts/sync-oxc-js.ts <oxc checkout>`). Raw transfer
(`experimentalRawTransfer`, `experimentalLazy`) needs ArrayBuffers above 4 GiB, which JavaScriptCore refuses:
`rawTransferSupported()` is `false` on Bun.

## Plugin

`oxcPlugin({ filter?, transform?, sourcemap?, minify?, lint?, dts?, native? })` registers an `onLoad` hook that compiles
TS/JSX (default filter `.ts .tsx .mts .cts .jsx`).

- `lint: "warn" | "error"` uses the nearest `.oxlintrc.json`; `{ level, config, configPath, fix }` sets them. `"error"`
  fails the load when an error-severity diagnostic remains; with `fix`, the fixed source is compiled.
- `dts: { outdir, root?, stripInternal? }` writes isolated declarations next to the build.
- `native: true` (`Bun.build` only) registers the Rust `onBeforeParse` hook on Bun's bundler threads: `oxc_transform`
  with default options, or `oxc_transform_with` and an `external` holding `transform` options.

## oxlint JS plugins

`lint()` runs every built-in rule in process. `jsPlugins` entries need oxlint's JS host: write them with
`definePlugin` / `defineRule` / `defineConfig` (from `@aphrody/bun-plugin-oxc/oxlint`, identical to oxlint's) and run
`runOxlint(args)` or `bun-oxc oxlint ...`, which spawn the oxlint CLI (`APHRODY_OXLINT` or `oxlint` on PATH). oxfmt
JS configs and Prettier-backed embedded formatting also need the npm CLIs.

## CLI

`bun-oxc transform | minify | dts | format | lint | check | resolve | parse | analyze | rules | oxlint | version`.
Run `bun-oxc help` for the flags (`--target`, `--decorators legacy`, `--react-refresh`, `--fix`, `--write`, `--check`,
`--json`...).

## Native addon

`src/native.ts` loads `bun-plugin-oxc.<platform>.node` from, in order: `APHRODY_BUN_PLUGIN_OXC_NATIVE`, the package
root, the optional package `@aphrody/bun-plugin-oxc-<platform>`. Platforms: `win32-x64-msvc`, `win32-arm64-msvc`,
`darwin-x64`, `darwin-arm64`, `linux-{x64,arm64}-{gnu,musl}`.

Crates: `aphrody-oxc-bridge` (published, crates.io deps only, C ABI 2), `aphrody-oxc-tools` (unpublished: oxlint and
oxfmt from git) and `bun-plugin-oxc-napi` (the addon). Build from the repository root with
`bun scripts/aphrody/build-napi.ts packages/bun-oxc`. Tests: `cargo test --workspace` in this directory and
`bun test test/integration/bun-plugin-oxc/`.

License: MIT.
