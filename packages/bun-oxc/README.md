# @aphrody/bun-plugin-oxc

[Oxc](https://oxc.rs) for Bun in one Node-API addon: parser, transformer, isolated declarations, minifier, resolver,
native AST lint rules and fixes, and oxfmt. It ships as a typed API, a Bun plugin (`Bun.plugin` and `Bun.build`),
drop-ins for `oxc-parser` / `oxc-transform` / `oxc-minify`, and the `bun-oxc` CLI.

Source versions: AST/compiler **0.153.0**, linter **1.87.0**, formatter **0.72.0**, resolver **11.24.3**.
Their implementations belong to the root Cargo workspace. Parser declarations use the single local
`adapters/types_npm/types.d.ts`, generated from the internal AST schema; no npm types package is needed.
The same declarations are exported from `@aphrody/bun-plugin-oxc/types` and retain the upstream MIT license.

```ts
import {
  oxcPlugin,
  transform,
  minify,
  lint,
  format,
  check,
  resolve,
  isolatedDeclaration,
} from "@aphrody/bun-plugin-oxc";

transform("const a: number = 1", "a.ts", { target: "es2019", sourcemap: true }); // { code, map }
transform(src, "a.tsx", {
  decorators: "legacy",
  reactRefresh: true,
  styledComponents: true,
});
isolatedDeclaration(
  "export function f(a: number): string { return '' }",
  "a.ts",
); // { code: ".d.ts" }
minify("const x = 1 + 2", "a.js", { topLevel: true, dropConsole: true });
lint("debugger;", "a.js", {
  config: { rules: { "no-debugger": "error" } },
  fix: true,
}); // { diagnostics, fixed, ... }
format("const x=1", "a.ts", { config: { semi: false } });
resolve(import.meta.dir, "pkg", {
  conditionNames: ["import"],
  tsconfig: "auto",
}); // { path, ... }

await Bun.build({
  entrypoints: ["./index.tsx"],
  plugins: [
    oxcPlugin({
      minify: true,
      lint: "warn",
      dts: { outdir: "types", root: "src" },
    }),
  ],
});
```

## API (`@aphrody/bun-plugin-oxc`)

| Function                                                              | Result                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transform(source, filename, options?)`                               | `{ code, map? }`. `target`, `jsx`, `jsxImportSource`, `jsxPragma`, `jsxPragmaFrag`, `development`, `sourcemap`, `decorators` (`"legacy"` \| `"standard"`), `emitDecoratorMetadata`, `reactRefresh`, `styledComponents`, `helpersModule` |
| `minify(source, filename, options?)`, `minifyWithMap`                 | `compress`, `mangle`, `topLevel`, `whitespace`, `dropConsole`, `dropDebugger`, `target`, `sourcemap`                                                                                                                                    |
| `isolatedDeclaration(source, filename, options?)`                     | `.d.ts` text (`stripInternal`, `sourcemap`)                                                                                                                                                                                             |
| `check(source, filename)`                                             | syntax and semantic errors `{ ok, diagnostics }`                                                                                                                                                                                        |
| `lint(source, filename, options?)`                                    | native AST rules: `{ diagnostics, fixed?, errorCount, warningCount }`. `config` (inline `.oxlintrc.json`), `configPath`, `discoverConfig`, `fix` (`true`/`"safe"`, `"suggestions"`, `"dangerous"`)                                      |
| `lintFix`, `lintRules()`                                              | fixed source; the rule table (`name`, `plugin`, `category`, `default`, `fix`, `docs`, `version`, `typeAware`)                                                                                                                           |
| `format(source, filename, options?)`                                  | oxfmt (JS/TS, JSON, CSS, GraphQL, Markdown, YAML, TOML, `package.json`): `config` (inline `.oxfmtrc.json`), `configPath`, `discoverConfig`                                                                                              |
| `resolve(from, specifier, options?)`                                  | `oxc_resolver`: `{ path, query, fragment, moduleType }`; `tsconfig`, `alias`, `fallback`, `conditionNames`, `extensions`, `extensionAlias`, `mainFields`, `modules`, `roots`...                                                         |
| `analyze`, `parse`                                                    | static imports/exports; ESTree JSON                                                                                                                                                                                                     |
| `parseSync`, `transformSync`, `isolatedDeclarationSync`, `minifySync` | the official oxc APIs (below)                                                                                                                                                                                                           |
| `formatDiagnostics`, `lineColumn`                                     | `path:line:col severity code: message`                                                                                                                                                                                                  |

Diagnostics carry `message`, `severity`, `code`, `help`, `url` and `labels` with UTF-16 offsets. Errors thrown by
the addon start with their kind: `[syntax]`, `[input]`, `[tool]`, `[transform]`, `[resolve]`.

## oxc drop-ins

`@aphrody/bun-plugin-oxc/parser`, `/transform` and `/minify` export the same functions, options and results as
`oxc-parser`, `oxc-transform` and `oxc-minify` 0.153.0 (`parseSync`, `parse`, `Visitor`, `visitorKeys`,
`transformSync`, `transform`, `isolatedDeclarationSync`, `moduleRunnerTransformSync`, `minifySync`, `minify`...). The
addon links the official `oxc_parser_napi`, `oxc_transform_napi` and `oxc_minify_napi` crates, and `src/parser-core`
owns the parser JS layer, visitors and deserializers. Transform and minify declarations live in
`src/transform-core` and `src/minify-core`. Sources and generated assets have one canonical owner. Raw transfer
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

`lint()` runs the native built-in rules in process. Use `bun lint` for repository linting.
`definePlugin` / `defineRule` / `defineConfig` remain identity helpers for compatible configuration objects.
Unsupported JavaScript plugins, JavaScript formatter configurations and Prettier-backed embedded languages
return explicit input errors. These commands use their native owners without an external fallback.
Configurations requesting `options.typeAware`, `options.typeCheck` or applicable type-aware rules also fail explicitly:
the native lint owner does not run type-aware checks. `lintRules()` exposes upstream rule
metadata; a rule's presence there does not mean its typed checks run in this owner.

## CLI

`bun-oxc transform | minify | dts | format | lint | check | resolve | parse | analyze | rules | version`.
Run `bun-oxc help` for the flags (`--target`, `--decorators legacy`, `--react-refresh`, `--fix`, `--write`, `--check`,
`--json`...).

## Native addon

`src/native.ts` loads `bun-plugin-oxc.<platform>.node` from, in order: `APHRODY_BUN_PLUGIN_OXC_NATIVE`, the package
root, the optional package `@aphrody/bun-plugin-oxc-<platform>`. Platforms: `win32-x64-msvc`, `win32-arm64-msvc`,
`darwin-x64`, `darwin-arm64`, `linux-{x64,arm64}-{gnu,musl}`.

Native owners: `src/transpiler/ecma_api` (`bun_ecma_api`, C ABI 2) and `src/quality` (`bun_quality`, oxlint and
oxfmt), both internal members of Bun's root Cargo workspace. This package owns only `bun-plugin-oxc-napi`
(the addon). Build from the repository root with
`bun scripts/aphrody/build-napi.ts packages/bun-oxc`. Test the native owners from the root workspace and run
`bun test test/integration/bun-plugin-oxc/`.

License: MIT.
