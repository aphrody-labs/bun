---
name: bun-packages
description: "What each <bun>\\packages\\* is (@aphrody/bun-types layout and type-test flow, plugins, vscode, inspector/DAP, lambda, release, native plugin API, uSockets/uWS forks, h3blast) plus completions/ and the @aphrody scope rename"
metadata:
 type: reference
---

# packages/ and completions/ in <bun>

**Fork note:** commit `fa052eaccfd` ("rename publishable npm packages to the @aphrody scope", 2026-10-03) renamed package.json `name` of
bun-build-mdx-rs (+ its npm/* platform pkgs), @aphrody/bun-debug-adapter-protocol, bun-inspector-frontend, @aphrody/bun-inspector-protocol, @aphrody/bun-plugin-svelte
@aphrody/bun-plugin-yaml, @aphrody/bun-types to `@aphrody/...`. READMEs still say `@aphrody/bun-types`, `@aphrody/bun-plugin-svelte`, etc. Fork-only addition: `@aphrody/bun-types/tauri.d.ts`
(commit d2d160ee63b, `namespace tauri` IPC/webview types inside `declare module "bun"`).

## bun-types (`@aphrody/bun-types`, upstream published as `bun-types`, consumed via `@types/bun`)
- `package.json`: `types: ./index.d.ts`; `typesVersions` `">=7.1"` -> `ts7.1/index.d.ts`; deps `@types/node` + `undici-types` (`*`);
 `files` = `*.d.ts`, `ts7.1/*.d.ts`, `CLAUDE.md`, `docs/**`, `README.md`, `vendor/**/*.d.ts`. Scripts: `build` (scripts/build.ts), `test` (tsc), `fmt` (biome).
- `index.d.ts` = `/// <reference types="node" />` then references in order: globals, s3, fetch, bun, extensions, devserver, ffi, html-rewriter, jsc, sqlite
 test, wasm, overrides, deprecated, redis, shell, serve, sql, security, bundle, tauri, and **`bun.ns.d.ts` last** (defines the `Bun` global; order matters).
- Sizes (lines): bun.d.ts ~10.9k (core API), redis 4k, test 2.4k, globals 2.2k, s3 1.5k, serve 1.4k, sqlite 1.3k, ffi 1.1k, sql 1.1k, jsc 0.8k, overrides 0.4k
 shell 0.4k, html-rewriter/wasm/devserver/deprecated ~0.2k, fetch, security (scanner API), bundle, extensions (module `*.toml`, etc.), jsx.
- `test-globals.d.ts`: NOT in index; opt-in `/// <reference types="@aphrody/bun-types/test-globals" />` declares global test/it/describe/expect/expectTypeOf/hooks/jest/vi/xit.
- `ts7.1/`: `index.d.ts` (references `../index.d.ts`) + `import-attributes.d.ts` for `declare module "*" with { type: "text" }` syntax older tsc rejects even with skipLibCheck.
 Prettier and the repo tsconfig skip this folder.
- `vendor/expect-type` (types for `expectTypeOf`).
- `scripts/build.ts [outDir]`: writes package.json with version = `BUN_VERSION`/`Bun.version`; copies `src/cli/init/rule.md` (frontmatter stripped
 `node_modules/bun-types/` prefix removed) as `CLAUDE.md`; copies all `docs/**/*.{md,mdx}` to `docs/` replacing `$BUN_LATEST_VERSION`.
- Authoring (`authoring.md`): everything inside `declare module "bun" { ... }` (mergeable across files; usable as `import {..} from "bun"` or `Bun.X`).
 Internal helpers under `namespace __internal`. Use `Bun.__internal.UseLibDomIfAvailable<"name", OurType>` to avoid clashing with lib.dom while keeping
 vars defined for @types/node (example in fetch.d.ts). Strict types, JSDoc with defaults.
- Type tests: `test/integration/bun-types/bun-types.test.ts` + ~64 fixtures in `test/integration/bun-types/fixture/` (fetch.ts, ffi.ts, serve..., issue-numbered files).
 Uses `src/cli/init/tsconfig.default.json`, `skipLibCheck: false`, checks both with and without lib.dom. Run with system bun:
 `bun test test/integration/bun-types/bun-types.test.ts` (no `bun bd` needed for .d.ts-only changes).
- Review rules for .d.ts: see `bun-docs-voice-contributing`.

## Plugins
- `@aphrody/bun-plugin-svelte` (`@aphrody/bun-plugin-svelte` 0.0.6, "Official Svelte plugin"): `SveltePlugin(options?: { forceSide?: "client"|"server", development?: boolean, runes? })`
 default export = `SveltePlugin({ development: true })`. Dev server: bunfig `[serve.static] plugins = ["@aphrody/bun-plugin-svelte"]` then `bun index.html` (HMR).
 Bundler: `Bun.build({ plugins: [SveltePlugin] })`. Has `example/` (uses `--config=./example/bunfig.toml`), tests.
- `@aphrody/bun-plugin-yaml` (0.0.1): `.yml`/`.yaml` imports for Bun.build `plugins` (historic; Bun now has a native yaml loader - see `bun-docs-bundler`). `modules.d.ts` types.
- `bun-build-mdx-rs` (`@aphrody/bun-mdx-rs`): proof-of-concept napi-rs native addon using `mdxjs-rs` for MDX->JSX in Bun.build; per-platform npm/ dirs; README TODO "needs to be built & published".
- `bun-native-bundler-plugin-api/bundler_plugin.h`: C ABI for native bundler plugins. `BunLoader` enum (JSX 0, JS 1, TS 2, TSX 3, CSS 4, FILE 5, JSON 6, TOML 7
 WASM 8, NAPI 9, BASE64 10, DATAURL 11, TEXT 12, HTML 17, YAML 18, XML 21; MAX = XML), log options structs with `__struct_size`.
- `bun-native-plugin-rs` (crate `bun-native-plugin` 0.2.0, experimental): Rust wrapper over that header. Plugins are NAPI modules exporting C-ABI hooks;
 only hook: `onBeforeParse`. Usage: `define_bun_plugin!("name")` + `#[bun]` proc macro (`bun-macro/` subcrate) on fn taking `OnBeforeParse`. Advantages: multi-threaded, no UTF-8/16 conversion.
 `copy_headers.ts` syncs headers; `wrapper.h` for bindgen.

## Tooling / debugging
- `bun-vscode` (0.0.31, publisher `oven`, vscode ^1.60): live in-editor errors, test explorer, `bun` debugger type, run scripts, `bun.lockb` viewer (custom editor).
 Commands `extension.bun.runFile|debugFile|runUnsavedCode`; settings `bun.runtime`, `bun.diagnosticsSocket.enabled`, `bun.bunlockb.enabled`
 `bun.debugTerminal.enabled|stopOnEntry`, `bun.test.filePattern|customFlag|customScript|enable`. Build `node scripts/build.mjs`; publish via `vsce`.
- `@aphrody/bun-inspector-protocol` (0.0.2): TS client for the WebKit Inspector Protocol (JSON, CDP-like) over WebSocket or Unix/TCP socket; full protocol typings
 (`src/protocol`), `src/inspector`, preview utils. Build `bun build --target=node --external=ws`.
- `@aphrody/bun-debug-adapter-protocol` (0.0.1): Microsoft DAP implementation (`src/debugger`, `src/protocol`) bridging DAP <-> inspector protocol; used by bun-vscode.
- `bun-inspector-frontend` (`@aphrody/web-inspector-bun`): WebKit Web Inspector as standalone assets (debug.bun.sh-style); connect via `?ws=host:port` or `/inspect/host:port`.
- `bun-error`: Preact frontend overlay (`index.tsx`, `runtime-error.ts`, `markdown.ts`, `schema.ts`, `bun-error.css`) for error messages/stack traces in `Bun.serve` dev mode (and old `bun dev`); internal only. Built with `bun build --minify --target=browser`.

## Infra / release
- `bun-release` ("bun-release-action"): scripts `get-version`, `upload-npm` (builds/publishes `bun` + `@oven/bun-<platform>` npm packages, esbuild-style postinstall `npm-postinstall.ts`)
 `upload-assets`, `upload-s3`. Also Dockerhub/Homebrew.
- `bun-lambda`: AWS Lambda custom runtime layer (`bootstrap`, `runtime.ts`); `bun run publish-layer` (also builds) / `build-layer`. Handler is a Bun server object
 `export default { fetch(request) }`; API Gateway events become `Request`; non-HTTP events (S3, SQS, EventBridge) arrive as request body.
- `bun-usockets`: Bun's fork of uSockets (TCP/TLS/event loop C lib) + root CA bundle (`certdata.txt`, `root_certs.*`, `generate-root-certs.{mjs,pl}`).
- `bun-uws`: Bun's fork of uWebSockets (HTTP + WebSocket server under `Bun.serve`).
- `h3blast`: C HTTP/3 load generator on lsquic + BoringSSL (`src/h3blast.c`, Makefile, `test-server.js`) to stress `Bun.serve({ http3: true })`.

## completions/
- `bun.bash` (250 lines), `bun.zsh` (1221), `bun.fish` (268): embedded into the binary via `include_bytes!` in `src/runtime/cli/shell_completions.rs`
 (compressed in release, listed in `scripts/build/codegen.ts`); installed by `bun completions` (`install_completions_command.rs`, also invoked by `bun upgrade`).
- `bun-cli.json` (v"1.1.0", 4.5k lines): machine-readable spec of commands run, test, x, repl, exec, install, add, remove, update, audit, dedupe, prune, outdated
 link, unlink, publish, patch, pm, info, build, init, create, upgrade - each with flags, positionalArgs (completionType), examples, usage, documentationUrl
 dynamicCompletions (scripts/files/binaries).
- `bun add` package-name completions are separate: `src/runtime/cli/add_completions.{txt,rs}` regenerated with `bun misctools/generate-add-completions.ts`.

Upstream-unchanged packages keep plain names: `bun-error`, `bun-lambda`, `bun-release-action`, `bun-vscode`.
No `package.json` in `bun-usockets`, `bun-uws`, `h3blast`, `bun-native-bundler-plugin-api` (C sources only); `bun-native-plugin-rs` is a Cargo crate.

Related: `bun-docs-map`, `bun-docs-bundler` (plugin API), `bun-docs-runtime-apis-a-m` (debugger).
