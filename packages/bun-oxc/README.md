# @aphrody/bun-plugin-oxc

[Oxc](https://oxc.rs) for Bun: TypeScript/JSX transform, minify, format, lint and module analysis, as a typed API and a
Bun plugin (`Bun.plugin` and `Bun.build`). The native core is the Rust crate
[`aphrody-oxc-bridge`](crates/oxc-bridge) (Oxc 0.153.0) behind a Node-API addon.

```ts
import { oxcPlugin, transform, minify, analyze } from "@aphrody/bun-plugin-oxc";

transform("const a: number = 1", "a.ts", { target: "es2019", sourcemap: true }); // { code, map }
minify("const x = 1 + 2", "a.js");
analyze("import './d'; export const v = 1", "a.ts"); // { imports, exports, requests, ... }

// Bun.build or Bun.plugin
await Bun.build({ entrypoints: ["./index.tsx"], plugins: [oxcPlugin({ minify: true, lint: "warn" })] });
```

## API

- `transform(source, filename, options?)`: `{ code, map? }`. Options: `target` (`es2020`, `chrome58`, ...),
  `jsx` (`"automatic"` | `"classic"`), `jsxImportSource`, `jsxPragma`, `jsxPragmaFrag`, `development`, `sourcemap`.
- `minify`, `format` (needs `oxfmt` on PATH or `APHRODY_OXFMT`), `lint` (needs `oxlint` or `APHRODY_OXLINT`),
  `analyze`, `parse` (ESTree).
- `oxcPlugin({ filter?, transform?, sourcemap?, minify?, lint?, native? })`:
  an `onLoad` plugin that compiles TS/JSX to JavaScript (default filter `.ts .tsx .mts .cts .jsx`).
  `lint: "warn"` prints diagnostics, `"error"` fails the load. `native: true` (Bun.build only) registers the Rust
  `onBeforeParse` hook `oxc_transform` instead, which runs on the bundler threads with default options.

Errors thrown by the addon start with their kind: `[syntax]`, `[input]`, `[tool]`, `[transform]`.

## Native addon

`src/native.ts` loads `bun-plugin-oxc.<platform>.node` from, in order: `APHRODY_BUN_PLUGIN_OXC_NATIVE`, the package
root, the optional package `@aphrody/bun-plugin-oxc-<platform>`. Platforms: `win32-x64-msvc`, `win32-arm64-msvc`,
`darwin-x64`, `darwin-arm64`, `linux-{x64,arm64}-{gnu,musl}`.

Build from the repository root: `bun scripts/aphrody/build-napi.ts packages/bun-oxc`. Tests:
`cargo test --workspace` in this directory and `bun test test/integration/bun-plugin-oxc/`.

License: MIT.
