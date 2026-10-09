---
name: bun-docs-bundler
description: "Cheat-sheet of docs/bundler/* — Bun.build options/defaults with bun build CLI flags, outputs, errors, loaders, plugins, macros, --compile executables, bytecode, CSS/HTML/fullstack/HMR, esbuild diffs, minifier."
metadata:
 type: reference
---

Source: <bun>\docs\bundler\{index,bytecode,css,esbuild,executables,fullstack,hot-reloading,html-static,loaders,macros,minifier,plugins,standalone-html}.mdx. Related: `bun-docs-map`, `bun-docs-runtime-apis-a-m`, `bun-docs-runtime-apis-n-z`, `bun-docs-http-networking` (Bun.serve routes), `bun-docs-bunfig-env` ([serve.static], env).

## Basics
- `await Bun.build({ entrypoints, outdir })` == `bun build <entry> --outdir ./out`.
 - `--watch` = incremental rebuild. Bun always bundles (`--no-bundle` disables; use `Bun.Transpiler` per-file).
- Types checked only with `--check` / `check: true` (type error fails build). No `.d.ts` generation (use tsc). No syntax down-leveling (no esbuild `--target`).
- Without `outdir` (JS API) nothing is written; outputs returned as BuildArtifact blobs. CLI without outdir prints bundle to stdout.

## Bun.build options -> CLI (default)
- `entrypoints: string[]` (required) -> positional args. One bundle per entry.
- `files: Record<path, string|Blob|TypedArray|ArrayBuffer>` JS-only: in-memory virtual files
 - override disk files (memory wins)
 - disk<->virtual imports both ways
 - all-virtual entries => root = cwd.
- `outdir` -> `--outdir`; `outfile` -> `--outfile`. With outdir, `artifact.path` is absolute written path.
- `target` -> `--target browser|bun|node` (default `browser`; entry with `#!/usr/bin/env bun` shebang => `bun`). No `neutral`.
 - browser: `"browser"` export condition; `node:*` imports work but e.g. `fs.readFile` does not.
 - bun: output gets `// @bun` pragma (no re-transpile); bun+cjs => `// @bun @bun-cjs`, wrapper NOT Node-compatible.
 - node: `"node"` condition, no `Bun`/`bun:*` polyfill.
- `format` -> `--format esm|cjs|iife` (default esm; cjs/iife experimental). cjs switches default target to node. iife cannot expose exports under a global name.
 - TLA only in esm.
- `jsx: { runtime: "automatic"|"classic", importSource, factory, fragment, sideEffects, development }` -> CLI via tsconfig/bunfig or `--jsx-runtime`, `--jsx-factory`, `--jsx-fragment`, `--jsx-import-source`, `--jsx-side-effects`.
 - Default from tsconfig `compilerOptions.jsx`: `react-jsx` or NODE_ENV=production => jsx, else jsxDEV. No `preserve`.
- `splitting` -> `--splitting` (default false).
 - Shared code -> `chunk-<hash>.js` (CLI names it `entry-a-<hash>.js`).
 - Each `import` = own chunk; tree-shaken-away `import` => no chunk & absent from metafile (`treeShaking: false` keeps all; esbuild differs).
- `splitRequire` (default true) / `--no-split-require`: with splitting+target bun, `require` of ESM -> own chunk via sync `import.meta.require("./chunk-<hash>.js")`
 - require cycle sees `{}` placeholder.
 - Other targets: inlined behind lazy wrapper.
- Export tree-shaking of `import`/`require` results: destructuring, `.prop` on awaited value/local, `.then(({a})=>…)` arrow, `Promise.all([...])` destructure.
 - Keeps all if namespace escapes (passed/spread/`Object.keys`/computed key/non-arrow then/`import *` elsewhere/direct eval).
 - CJS targets keep everything.
- `minChunkSize` -> `--min-chunk-size=N` (default 0): fold small side-effect-free chunks into superset chunk (overhead capped ~1.5%); 16 KiB good for browser.
 - Nothing folds into unhashed-name entry chunk (query-string re-run risk) nor with --compile into entry chunk.
- `modulePreload` (default true) / `--no-module-preload`: splitting+browser => `<link rel="modulepreload">` in HTML + inserted before `import`
 - copies nonce from `<meta property="csp-nonce">`.
- `naming` -> `--entry-naming` / `--chunk-naming` / `--asset-naming`.
 - String = entry only.
 - Defaults: entry `[dir]/[name].[ext]`, chunk `[name]-[hash].[ext]`, asset `[name]-[hash].[ext]`.
 - Tokens `[name] [ext] [dir] [hash]` (8 chars, widened on collision; `[hash9]`..`[hash13]` = full 64-bit).
 - Must include `[ext]` explicitly.
- `root` -> `--root` (default: first common ancestor of entries; esbuild `outbase`).
- `publicPath` -> `--public-path` (default undefined): prefix for asset/chunk/external paths; also sourceMappingURL base.
- `define: Record<string,string>` -> `--define K=V` (repeatable, no colon). Values JSON strings / identifiers / property paths.
- `external: string[]` -> `--external pkg` (default []; `'*'` = all).
 - `packages: "bundle"|"external"` -> `--packages external` (package = path not starting with `.`, `..`, `/`).
- `loader: { ".ext": Loader }` -> `--loader .ext:loader`.
- `sourcemap: "none"|"linked"|"inline"|"external"|boolean` -> `--sourcemap[=v]` (JS default none, `true`->inline; CLI bare flag = linked; no esbuild `both`).
 - linked: `.js.map` + `//# sourceMappingURL` (needs outdir; base URL via publicPath).
 - external: `.js.map`, no URL comment, `//# debugId=` comment; map JSON has same `debugId`.
 - inline: base64 data URL appended.
- `minify: boolean | { whitespace, syntax, identifiers, keepNames }` -> `--minify` / `--minify-whitespace|-syntax|-identifiers`, `--keep-names`. Default false.
- `env: "inline"|"disable"|"PREFIX_*"` -> `--env inline|disable|PUBLIC_*`: rewrites literal `process.env.FOO` via define (not `import.meta.env`, not indirect).
- `drop: string[]` -> `--drop console --drop debugger --drop assert`: removes calls (args too, even with side effects) -> `void 0`; `debugger` removes statements.
- `banner` / `footer` -> `--banner` / `--footer` (JS bundles only; e.g. `"use client";`).
- `conditions: string|string[]` -> `--conditions` (package.json exports conditions).
- `features: string[]` -> `--feature FLAG` (repeatable): `import { feature } from "bun:bundle"`
 - `feature("X")` -> true/false at bundle time, string literal only
 - import removed
 - works in build/run/test
 - type-restrict via `declare module "bun:bundle" { interface Registry { features: "A"|"B" } }`.
- `optimizeImports: string[]`: skip parsing unused submodules of pure barrel files (all named re-exports).
 - Local exports or `import *` => load all
 - `export *` always loaded. Auto for `"sideEffects": false` packages.
- `deprecatedNamespaceObjectSetters` (default true) / `--no-deprecated-namespace-object-setters`: false => getter-only namespace objects (future default).
- `metafile: true|string|{json, markdown}` -> `--metafile=path.json`, `--metafile-md=path.md`.
 - Shape: `inputs[path]{bytes, imports[{path,kind,original?,entryPoint?,external?}], format?}`, `outputs[path]{bytes, inputs{bytesInOutput}, imports, exports, entryPoint?, cssBundle?}`.
- `bytecode` -> `--bytecode`; `bytecodeDepth` -> `--bytecode-depth=N`; `optimize: { bytecode: false }` -> `--no-optimize-bytecode`.
- `compile` -> `--compile` (see Executables). `check` -> `--check`. `tsconfig` -> `--tsconfig-override`.
- `ignoreDCEAnnotations` -> `--ignore-dce-annotations` (ignore `@__PURE__`/sideEffects); `emitDCEAnnotations` (force `@__PURE__` even with minify.whitespace).
- `throw` (default true): reject with AggregateError; false => resolve `{success:false}`.
- `treeShaking` (default true, always on). `plugins: BunPlugin[]` (JS API; CLI does not support plugins).
- CLI-only: `--production` (= minify + `NODE_ENV=production` + prod JSX), `--no-macros`, `--watch`.
- Namespace re-exports: `ns.x` on `import * as z; export {z}`/`export * as ns` etc. links directly (1 level)
 - `import React from "react"; React.useState` -> direct lifted binding unless React escapes as value.

## Outputs & errors
- `BuildOutput { outputs: BuildArtifact[]; success: boolean; logs: (BuildMessage|ResolveMessage)[]; metafile? }`.
- `BuildArtifact extends Blob { kind: "entry-point"|"chunk"|"asset"|"sourcemap"|"bytecode"; path; loader; hash: string|null (always for assets); sourcemap: BuildArtifact|null (entries/chunks) }`.
 - `.text/.arrayBuffer/.bytes`; `new Response(artifact)` sets Content-Type (+Etag).
- Failure: rejected promise with `AggregateError`
 - `error.errors[]` = `BuildMessage { name, position?, message, level: error|warning|info|debug|verbose }` / `ResolveMessage` (+ `code, referrer, specifier, importKind`: entry_point|stmt|require|import|dynamic|require_resolve|at|at_conditional|url|internal).
 - Success: warnings in `result.logs`.

## Loaders (by extension; `with { type: "<loader>" }` overrides)
- `js`: .cjs .mjs | `jsx`: .js .jsx | `ts`: .ts .mts .cts (no typecheck) | `tsx`: .tsx. DCE + tree shaking, no down-convert.
- `json` .json, `jsonc` .jsonc (auto for tsconfig/jsconfig/package.json/bun.lock), `toml`, `yaml` (.yaml/.yml), `xml` (Bun.XML.parse shape: `@attr`, `#text`, arrays for repeats, all strings), `text` (.txt/.text) -> inlined object/string
 - as entrypoint -> `export default`.
- Loader list also has `.json5 .md .markdown`.
 - `napi` (.node; bundler treats as `file`), `wasm` (asset in bundler), `sqlite` (requires `with {type:"sqlite"}`, target bun only; external unless `embed: "true"` -> copied hashed / embedded in exe), `html`, `css`, `sh` (only `bun run x.sh`, not bundler), `file` (default for unknown: copy to outdir, import = relative path, prefixed by publicPath, located by naming.asset).
- HTML loader (lol-html) selectors: script[src], link stylesheet/icon/apple-touch-icon/manifest/as=font|image|style|video|audio|worker, img[src|srcset], source[src|srcset], audio/video[src], video[poster].
 - Keeps http(s) URLs.
- esbuild loaders `dataurl binary base64 copy empty` NOT implemented (esbuild.mdx), though index.mdx shows a `.png: "dataurl"` example.

## Plugins (runtime + bundler, `{ name, setup(build) }`)
- Hooks: `onStart(cb)` (awaited, all before continuing), `onResolve({filter, namespace?}, args{path, importer, namespace, resolveDir, kind} => {path, namespace?, external?}|void)`, `onLoad({filter, namespace?}, args{path, namespace, loader, defer} => {contents?, loader?, exports?})`, `onEnd(result: BuildOutput)` (Bun.build waits for it), `onBeforeParse` (native only).
- Namespaces: default `file`; `bun:`/`node:`. Virtual module = onResolve returns `{path, namespace:"x"}` + onLoad on that namespace returns contents.
- `defer` resolves when all other modules loaded; callable once per onLoad.
- Lifecycle callbacks cannot mutate `build.config`
 - mutate in `setup`. `initialOptions` partial & read-only
 - no `onDispose`/`resolve`
 - unsupported: pluginData, errors/warnings, watchFiles/Dirs, suffix, sideEffects.
- Native (NAPI, multithreaded): Rust crate `bun-native-plugin`, `define_bun_plugin!`, `#[bun] fn f(handle: &mut OnBeforeParse)`
 - `build.onBeforeParse({filter,namespace}, { napiModule, symbol, external? })`
 - must be thread-safe.

## Macros
- `import { f } from "./m.ts" with { type: "macro" }` (or legacy `assert`).
 - Runs at bundle time, call replaced by result
 - source not in bundle. Run sync in visit phase, in call order, Promise awaited, parallel across workers.
- Serializable: JSON-like, Promise, `Response`/`Blob` (by Content-Type: json->object, text/plain->string, else base64). Functions/class instances not.
- Args must be statically known (constants or other macro results). DCE runs after (needs minify syntax).
- `--no-macros` disables; code inside `node_modules` cannot invoke macros (app code can import macros from packages). `"macro"` export condition in package.json.

## Executables (`--compile`)
- `bun build ./cli.ts --compile --outfile mycli`
 - JS `compile: true | "bun-linux-x64" | { target, outfile, assets, execArgv, executablePath, autoloadTsconfig=false, autoloadPackageJson=false, autoloadDotenv=true, autoloadBunfig=true, bytecodeOrder, jitPolicy=1, windows }`.
 - No outfile => entry name in outdir or cwd.
- Targets `bun-{linux,windows,darwin}-{x64,arm64}`, `bun-linux-{x64,arm64}-musl` (segments any order; `-baseline`/`-modern` accepted, same x64 binary).
 - `.exe` auto-added for Windows.
- Flags: `--compile-exec-argv="--smol ..."` (-> process.execArgv), `--compile-autoload-tsconfig`, `--compile-autoload-package-json`, `--no-compile-autoload-dotenv`, `--no-compile-autoload-bunfig`, `--compile-jit-policy <n>` (reset with `Bun.unsafe.setJITPolicy(1)`), `--bytecode-order=a.order,b.order` (record via `BUN_BYTECODE_ORDER_OUT=x.order ./app`, `%p`=pid; `bytecodeOrderStats` from bun:jsc).
- Runtime: `BUN_OPTIONS="--cpu-prof"` read by exe; `BUN_BE_BUN=1 ./exe` acts as bun CLI; `Bun.isStandaloneExecutable` (no Blob alloc).
- Embed: `import p from "./x.png" with { type: "file" }` -> `/$bunfs/root/x-<hash>.png`, read via `Bun.file`/node:fs.
 - `Bun.embeddedFiles: ReadonlyArray<Blob>` (with `.name`; excludes source; text imports not listed).
 - `--asset ./dir` / `compile.assets` embeds tree under `import.meta.dir` (regular files only).
 - `--asset-naming="[name].[ext]"` drops hash. sqlite `embed:"true"` = in-memory read-write (lost on exit).
 - `.node` via direct `require`.
 - Workers must be extra entrypoints.
- Prod: `--compile --minify --sourcemap [--bytecode]` (sourcemap embedded zstd). Full-stack: server importing HTML embeds frontend assets.
- Windows: `--windows-icon=x.ico`, `--windows-hide-console`
 - JS `windows: { icon, hideConsole, title, publisher, version, description, copyright }`
 - only hideConsole works when cross-compiling.
- `--compile --splitting` supported. Unsupported with --compile: `--outdir` (use outfile; doc examples still use outdir for --splitting and HTML), `--public-path`, `--target=node`, `--target=browser` w/o HTML, `--no-bundle`. macOS: `codesign` + JIT entitlements (Bun >= 1.2.4).

## Bytecode
- Requires target bun. CJS (default format with bytecode): `index.js` + `index.js.jsc`, works without compile
 - ESM requires `--compile`. `@bytecode` pragma
 - hash/length validated, mismatch => silent fallback to source.
- Not portable across Bun versions (regenerate on upgrade, don't commit .jsc)
 - architecture-independent
 - not obfuscation
 - must ship .js too
 - .jsc 2-8x larger
 - startup 1.5-4x faster.
 - Debug: `BUN_JSC_verboseDiskCache=1`.
 - `--bytecode-depth=0` = top-level only.

## CSS
- LightningCSS port; default targets Edge 80, Firefox 78, Chrome 80, Safari 14, Opera 67.
 - Lowers nesting, color-mix, relative colors, lab/lch/oklab/oklch, color, hwb, modern rgb/hsl/hex-alpha, light-dark (`--buncss-light/dark` vars), logical props, :dir/:lang/:is/:not lists, math fns, media ranges, shorthands, double-position gradients, system-ui stack.
- CSS modules: `*.module.css` -> object of scoped names; `composes` (first in rule, single-class selector, `from "./x.module.css"`; cross-file conflicts undefined).
- CSS imported from JS => one `.css` per entry (dedup); `url` assets copied+hashed; `@import` flattened.

## HTML / static / fullstack
- `bun ./index.html` dev server (single file = SPA fallback; multiple/glob `./**/*.html` = routes from common prefix)
 - `--console` echoes browser logs
 - shortcuts o/c/q + Enter.
 - Prod: `bun build ./index.html --minify --outdir=dist`.
- Plugins only via `Bun.build` or bunfig `[serve.static] plugins = ["bun-plugin-tailwind"]` (not CLI)
 - `[serve.static] env = "PUBLIC_*"|"inline"|"disable"(default)`
 - `sourcemap` there too.
- Fullstack: `import page from "./index.html"` -> `Bun.serve({ routes: { "/": page }, development: true | { hmr, console } })`. dev: sourcemaps, no minify, rebundle per request, HMR.
 - `development: false`: lazy bundle cached in memory, Cache-Control/ETag, minify.
 - AOT: `bun build --target=bun --production --outdir=dist ./server.ts` -> HTML import becomes manifest object.
- Standalone HTML: `bun build --compile --target=browser ./index.html --outdir=dist` -> single .html, JS inlined as `<script type="module">`, CSS `<style>`, assets base64 `data:`
 - no `--splitting`
 - external URLs untouched.

## HMR (`import.meta.hot`, Vite-like)
- Must be called directly as `import.meta.hot.<api>` (no aliasing); DCE'd in production; `hot.data` inlined as `{}` in prod.
- `accept` (self boundary; or `accept(cb)`, `accept("./dep", cb)`, `accept([deps], cb)`; newModule undefined on SyntaxError), `data` (writing it = self-accept), `dispose(cb)` (parallel, promise delays), `prune(cb)` (currently never called), `on/off(event)`, `decline` no-op
 - `invalidate`/`send` not implemented.
 - No accept => full reload.
- Events `bun:beforeUpdate|afterUpdate|beforeFullReload|beforePrune|invalidate|error|ws:disconnect|ws:connect` (also `vite:*`). Disable: `development: { hmr: false }`.

## esbuild differences
- `--platform`->`--target`, `--outbase`->`--root`, `--*-names`->`--*-naming`, `--define:K=V`->`--define K=V`, `--loader:.x=l`->`--loader .x:l`, `--ignore-annotations`->`--ignore-dce-annotations`, `--tsconfig`->`--tsconfig-override`, `keepNames`->`minify.keepNames`, `jsxDev`->`jsx.development`.
 - Format default esm (esbuild iife).
 - `write` implied by outdir/outfile.
- Not supported: global-name, inject, mangle-*, legal-comments, out-extension, main-fields, resolve-extensions, pure, stdin, charset, alias, preserveSymlinks, sourcesContent, supported, log-*, analyze, serve
 - never overwrite.
 - Bun 1.75x faster on three.js bench.

## Minifier specifics
- `--minify` = whitespace+syntax+identifiers.
 - Syntax: `true`->`!0`, `undefined`->`void 0`, `==undefined`->`==null`, `Infinity`->`1/0`, `typeof x>"u"`, const folding (arith/bitwise/string/template/`.length`/compare/logical/`??`), dead branches, enum inlining (cross-module), var/expr/return/throw merging, `new Object`->`{}`, arrow bodies.
- Always on: `@__PURE__` respect, minimal parens, `charCodeAt` folding, object shorthand. Bundle mode: `import.meta.dir/file/path/url` inlined.
- Identifiers: frequency-ordered alphabet (first names like t,e,n), 53 single-char names (`$` reserved)
 - preserves globals, named exports, `exports`/`module`.
 - Keeps `/*! */` license comments.
