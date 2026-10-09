---
name: bun-toolchain-bundler-tests
description: "How Bun's toolchain is tested - itBundled/expectBundled harness (test/bundler), esbuild-ported suites, transpiler/css/resolver tests, bake devTest harness (test/bake), skills writing-bundler-tests / writing-dev-server-tests"
metadata:
 type: reference
---

# Toolchain tests: bundler harness + DevServer harness

Always run with `bun bd test <file>` (debug build). Verify that the test fails with `USE_SYSTEM_BUN=1 bun test`.
Skills in the repo: `.claude/skills/writing-bundler-tests/SKILL.md` and `.claude/skills/writing-dev-server-tests/SKILL.md`.
`.claude/skills/sync-react-compiler.md` covers syncing the React Compiler port.

## `test/bundler/expectBundled.ts` (~2.1k lines; doc `expectBundled.md`)
- Exports:
 - `itBundled(id, opts | (api: BundlerTestWrappedAPI) => opts)` (~1969).
 - `testForFile(file)`, `dedent`, `decodeSourceMappingsLine`, `ESBUILD`, `ESBUILD_PATH`, `RUN_UNCHECKED_TESTS`.
 - Interfaces `BundlerTestInput`, `BundlerTestBundleAPI`, `BundlerTestRunOptions`, `SourceMapTests`
 `MappingSnapshot`, `BundlerTestRef`, `ErrorMeta`.
- ID format is `category/TestName` (e.g. `default/ExportMissingES6`, `minify/Empty`). File paths in `files` are
 relative/rooted at a temp root (`/index.js`).
- Backend: `backend: "api"` (`Bun.build`) or `"cli"` (`bun build`). The default is api when possible. Options
 that the selected backend does not implement turn the test into a todo.
- Important `BundlerTestInput` keys:
 - Inputs: `files`, `runtimeFiles` (written after bundling), `entryPoints` (default = first file)
 `entryPointsAdvanced`, `entryPointsRaw`, `stdin`, `outputPaths`, `outfile` (`/out.js`), `outdir` (`/out`)
 `root`, `bundling`.
 - Bundler options: `format` (`esm`|`cjs`|`iife`|`internal_bake_dev`) and `target` (`bun`|`node`|`browser`;
 default browser).
 - Minify: `minifyWhitespace`, `minifyIdentifiers`, `minifySyntax`, `keepNames`, `mangleProps`
 `mangleQuoted`, `drop`, `define`, `features` (bun:bundle `feature` DCE), `optimizeImports` (barrels).
 - Splitting and chunks: `splitting`, `splitRequire`, `modulePreload`, `minChunkSize`, `foldChunks` (api only;
 `false` skips `merge_small_chunks`).
 - Output: `sourceMap` (`inline`|`external`|`linked`|`none`), `banner`, `footer`, `legalComments`, `metafile`
 `publicPath`, `entryNaming`, `chunkNaming`, `assetNaming`.
 - Resolution: `external`, `packages`, `alias`, `conditions`, `mainFields`, `extensionOrder`, `loader`
 `inject`, `allowUnresolved`, `nodePaths`, `install`, `env`, `dotenv`, `production`.
 - Transforms: `jsx {runtime, importSource, factory, fragment, sideEffects, development}`, `treeShaking`
 `ignoreDCEAnnotations`, `emitDCEAnnotations`, `unsupportedJSFeatures`, `unsupportedCSSFeatures`
 `useDefineForClassFields` (writes tsconfig), `serverComponents`, `reactCompiler`
 `reactCompilerOutputMode`, `reactFastRefresh`.
 - Compile: `compile` (bool | target string | `CompileBuildOptions`), `bytecode`, `bytecodeDepth`.
 - Plugins: `plugins` (array or `(builder) => …`).
- Assertions:
 - `bundleErrors` / `bundleWarnings` map a file to its messages (or `true`).
 - `run` (bool | options | array): `stdout` (string or RegExp), `stderr`, `partialStdout`, `error`
 `errorLineMatch`, `exitCode`, `args`, `bunArgs`, `env`, `runtime: "bun"|"node"`, `setCwd`, `file`
 `validate`.
 - `dce: true` checks that markers `REMOVE`/`FAIL`/`DROP` are absent and counts `KEEP`
 (`dceKeepMarkerCount`).
 - `cjs2esm` (checks the `__commonJS` helper), `assertNotPresent`.
 - `capture: [...]` collects the argument text of `capture(...)` calls in the output.
 - `onAfterBundle(api)`: `api.expectFile(f).toContain`, `readFile`, `writeFile`, `prependFile`
 `appendFile`, `assertFileExists`, `captureFile`, `warnings`. `onAfterApiBundle(BuildOutput)`.
 - `snapshotSourceMap` (`files`, `mappings: ["src:line:col", "gen:line:col"]`, `mappingsExactMatch`)
 `expectExactFilesize`, `matchesReference`, `todo`, `skipOnEsbuild`, `timeoutScale`, `throw`.
- Env vars:
 - `BUN_BUNDLER_TEST_USE_ESBUILD`: run the same test with esbuild for comparison.
 - `BUN_BUNDLER_TEST_DEBUG`: extra files and logs.
 - `BUN_BUNDLER_TEST_FILTER=<exact id>`.
 - `BUN_BUNDLER_TEST_HIDE_SKIP`.
- Outputs persist at `$TEMP/bun-build-tests/{bun|esbuild}-<run>/<id>` and are not deleted, so you can inspect
 them. `test/bundler/run-single-bundler-test.sh <id> [e]` (bash) sets FILTER and DEBUG, with `e` meaning
 esbuild.

## Test locations
- `test/bundler/esbuild/*.test.ts` are esbuild's `internal/bundler_tests/*_test.go` ported to `itBundled`:
 css, dce, default, extra, importstar, importstar_ts, loader, lower, metafile, packagejson, splitting, ts
 tsconfig. Tests that were not ported are kept with a `// GENERATED` comment / `todo`. IDs mirror the Go test
 names (`default/…`).
- `test/bundler/bundler_*.test.ts`: banner, barrel, browser, bun, bytecode_portable, cjs, cjs2esm, comments
 compile*, decorator_metadata, defer, drop, dynamic_import_dce, edgecase, env, feature_flag, files, footer
 html, html_server, jsx, loader, merged_enum, minify, minify_symbol_for, naming, npm, plugin, plugin_chain
 promiseall_deadcode, regressions, splitting, string.
- Also in `test/bundler/`: `bun-build-api.test.ts` (`Bun.build`), `bun-build-compile*.test.ts` and
 `compile-*.test.ts` (standalone executables: ELF segment layout, Mach-O codesign, Windows metadata, bunfs
 assets, sourcemaps), `cli.test.ts`, `metafile.test.ts`, `native-plugin.test.ts`
 `html-import-manifest.test.ts`, `standalone.test.ts`, `transpiler_constant_fold_eqeq.test.ts`.
- `test/bundler/transpiler/`: `transpiler.test.js` (Bun.Transpiler, big), `runtime-transpiler.test.ts` (cache)
 decorators / es-decorators (+ esbuild-ported), `macro-test.test.ts`, `jsx-*`, `react-compiler.test.ts` +
 `react-compiler-fixtures.test.ts`, `template-literal`, stack-overflow / panic regressions.
- `test/bundler/css/` (css-modules, issue-numbered regressions); `test/bundler/resolver/cache-*.test.ts`.
- Elsewhere: CSS unit tests in `test/js/bun/css/` (`bun-toolchain-css-parsers`); `bun check` tests in
 `test/cli/check/` (`bun-toolchain-check-sema`); resolve in `test/js/bun/resolve/`.

## `test/bake/bake-harness.ts` (DevServer / Bake)
- Exports:
 - `devTest(desc, opts)`, `prodTest`, `devAndProductionTest`.
 - `Dev` and `Client` classes.
 - `emptyHtmlFile({scripts, styles, body})`, `minimalFramework: Bake.Framework`, `indexHtmlScript`
 `imageFixtures`.
 - `WAIT_MULTIPLIER` (debug ×3, ASAN ×3, CI ×2).
 - `ensureReactCache`, `copyCachedReactDeps`, `tempDirWithBakeDeps`.
- `DevServerTest` options: `test(dev)`, `files`, `htmlFiles`, `framework` (object | `"react"`; or
 `files["bun.app.ts"]`), `pluginFile`, `fixture` (`test/bake/fixtures/<name>`), `timeoutMultiplier`, `mainDir`
 `cwd`, `skip: ("win32"|"darwin"|"linux"|"ci")[]`, `only`, `env`.
- `Dev`:
 - `fetch(url).expect.toInclude/equals/expect404/expectFile`, `fetchJSON`.
 - `write`, `patch(file, {find, replace})`, `delete` and `mkdir`. These wait for the hot reload, and accept
 `{ errors: [...] }`. Never use `node:fs` for this.
 - `batchChanges`, `writeNoChanges`, `read`, `join`, `waitForHotReload`, `stressTest`, `gracefulExit`.
 - `client(url, { errors })` returns a `Client`.
- `Client` runs in a subprocess (`client-fixture.mjs`; use `await using`):
 - `expectMessage(...)`, `expectMessageInAnyOrder`, `expectReload(cb)`, `hardReload`, `expectErrorOverlay`.
 - `elemText` / `expectElemText`, `click`, `style(sel)`, `getMostRecentHmrChunk`
 `expectNoWebSocketActivity`, `reactRefreshComponentHash`.
- Synchronization uses the `TestingWatchSynchronization` HMR topic / `WatchSynchronization` enum
 (`bun-toolchain-bake`). Error strings look like `'script.ts:1:18: error: Could not resolve: "./data"'`.
- Files:
 - `test/bake/`: `dev-and-prod.test.ts`, `framework-router.test.ts`, `hmr-socket-protocol.test.ts`
 `app-options.test.ts`, `deinitialization.test.ts`, `serve-plugins-dev-server.test.ts`.
 - `test/bake/dev/`: bundle, css, ecosystem, esm, harness, hot, html, import-meta-inline(-negative)
 incremental-graph-edge-deletion, plugins, production, react-response, react-spa, request-cookies
 response-to-bake-response, server-sourcemap, sourcemap, ssg-pages-router, stress, vfile.

## Related
`bun-toolchain-bundler` · `bun-toolchain-bake` · `bun-toolchain-parser`
