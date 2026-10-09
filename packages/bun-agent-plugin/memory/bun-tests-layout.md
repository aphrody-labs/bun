---
name: bun-tests-layout
description: "Bun test/ directory layout in depth — js/node/test ported Node tests, regression, cli/install (verdaccio + dummy registry), napi, v8, @aphrody/bun-types, bake, bundler, quarantine/config files"
metadata:
 type: reference
---

# test/ layout

Related: `bun-tests-harness` · `bun-tests-runner-ci` · `bun-tests-patterns` · `bun-install-architecture`

## Top level (`<bun>\test`)
- `harness.ts` (shared helpers), `preload.ts`, `bunfig.toml` (`[test] preload="./preload.ts"`; `[install] linker="isolated"`, `globalStore=false`), `package.json` + `bun.lock` (third-party deps used by tests: verdaccio, typescript, esbuild...), `tsconfig.json`, `CLAUDE.md`/`AGENTS.md` (testing rules), `README.md`.
- Quarantine/config lists (read by `scripts/runner.node.ts`, see `bun-tests-runner-ci`): `expectations.txt`, `no-validate-exceptions.txt`, `no-validate-leaksan.txt`, `leaksan.supp`, `flaky-tests.txt`, `parallel-allowlist.json`, `parallel-denylist.txt`, `expected-durations.json`, `vendor.json`.
- Dirs: `js/`, `cli/`, `bundler/`, `bake/`, `regression/`, `integration/`, `napi/`, `v8/`, `internal/` (build-system + repo-tooling tests: `build-*.test.ts`, `rust-check-all.test.ts`, `parallel-allowlist.test.ts`, `source-lints/`), `docker/` (Dockerfiles, `docker-compose.yml`, `prestart-map.mjs` for `describeWithContainer`), `packages/s3-server`, `fixtures/`, `snapshots/` (transpiler output snapshots), `exports/`, `snippets/`, `config/bunfig/`, `runners/mocha.ts`, `scripts/`, `_util/`, `http-test-server.ts`, `unix-domain-socket-proxy.ts`, `mkfifo.ts`.

## test/js/
- `bun/` Bun APIs (http, crypto, ffi, shell, spawn, sqlite, s3, test (the bun:test runner itself), glob, ini, patch, resolve, gc...). `js/bun/test/parallel/` = node-style exit-code tests.
- `node/` Node compat per module (fs, http, child_process, crypto...). `node/bunfig.toml` preloads `./harness.ts` + `../../preload.ts`; `node/harness.ts` = `createTest(path)` + node assert shims.
- `node/test/` = **ported upstream Node.js tests**: `parallel/` (~3660 files), `sequential/`, `common/` (Node's `common/index.js` etc.), `fixtures/`, `sqlite/`. They are NOT bun:test files: they pass by exiting 0. Run with `bun bd <file>` (not `bun bd test`). Do not modify their logic (upstream tests). Runner runs them with `bun run --config=bunfig.node-test.toml` unless the file uses `node:test` or name contains `needs-test`; honors `// Flags:` lines.
- `web/` Web APIs (fetch, streams, websocket, encoding...), `first_party/`, `third_party/` (express, prisma, next-auth, esbuild, pg, socket.io...), `sql/`, `valkey/`, `deno/`, `workerd/`, `junit-reporter/`.

## test/js/bun/test/ (the bun:test runner's own tests)
- Many `*.fixture.ts` driven by spawning `bun test fixture` and snapshotting output (`concurrent.fixture.ts`, `dots.fixture.ts`, `expect-*`), `__snapshots__/`, `cross-file-safety/`, `ci-restrictions.test.ts` (CI forbids `.only` etc.), `expect/` matchers. Distinct from `test/cli/test/` (CLI flags, bunfig `[test]`, isolation via `USE_SYSTEM_BUN` in `isolation.test.ts`).

## Config bunfigs inside test/
- `test/bunfig.toml` (root: preload + isolated linker), `test/js/node/bunfig.toml` (node harness preload), repo-root `bunfig.node-test.toml` (ported Node tests, `install.auto="disable"`), `test/config/bunfig/` fixtures. A nested bunfig.toml overrides the test-root one for files below it.

## Where to put a new test (quick map)
- Package manager behavior -> `test/cli/install/<feature>.test.ts` (Verdaccio fixtures in `registry/packages/`).
- `bun run` / scripts / bunfig `[run]` -> `test/cli/run/`; `bun test` CLI -> `test/cli/test/`; runner internals -> `test/js/bun/test/`.
- Transpiler / bundler output -> `test/bundler/` (`itBundled`); dev server/HMR -> `test/bake/dev/` (`devTest`).
- Node module compat -> `test/js/node/<module>/`; Web API -> `test/js/web/<api>/`; Bun API -> `test/js/bun/<area>/`.
- Build system / repo scripts -> `test/internal/`.

## test/regression/
- `regression/issue/<number>.test.ts` (~450 files) — only for real GitHub issue regressions (worked before, then broke). Otherwise put the test in the module's existing file. Some fixtures (`*-fixture.cjs`) alongside.

## test/cli/
`install/`, `run/`, `test/` (bun test CLI), `hot/`, `watch/`, `init/`, `create/`, `env/`, `inspect/`, `check/`, plus `bun.test.ts`, `update_interactive_*.test.ts`.
### test/cli/install (package manager)
- One file per feature: `bun-install.test.ts`, `bun-install-registry.test.ts` (big; Verdaccio), `bun-add.test.ts`, `bun-remove.test.ts`, `bun-update.test.ts`, `bun-pm*.test.ts`, `bun-pack.test.ts`, `bun-publish.test.ts`, `bun-audit.test.ts`, `bun-link.test.ts`, `bun-patch.test.ts`, `bun-lock(b).test.ts`, `bun-workspaces.test.ts`, `isolated-install.test.ts`, `catalogs.test.ts`, `overrides.test.ts`, `bunx.test.ts`, `npmrc.test.ts`, `semver.test.ts`, `migration/`, `hosted-git-info/`...
- `registry/verdaccio.yaml` + `registry/packages/` (~230 fixture packages) used by `VerdaccioRegistry` from harness (preferred for new tests).
- `dummy.registry.ts` — legacy in-process `Bun.serve` registry: `dummyBeforeAll/AfterAll/BeforeEach/AfterEach`, `dummyRegistry(urls, info?)` handler, `setHandler`, `package_dir`, `root_url`, `requested`; concurrent variant `createTestContext({linker})` / `setContextHandler(ctx, handler)` / `destroyTestContext(ctx)` / `dummyRegistryForContext` (URL prefix `/test-N/`). Serves `*.tgz` from this dir (`bar-0.0.2.tgz`, `dep-<os>-<cpu>-x.tgz`...).
- `simple-dummy-registry.ts` (`SimpleRegistry`, `startRegistry(debugLogs)`, `stopRegistry`, `getRegistry`).
- cli/install tests never join the parallel batch (shared bin/cache dirs).

## test/bundler/
- `expectBundled.ts` exports `itBundled(id, opts)`, `testForFile(file)`, `dedent`; `esbuild/` = ported esbuild tests; `bundler_*.test.ts` per feature; `bun-build-api.test.ts`, `compile-*.test.ts`, `css/`, `transpiler/`, `fixtures/`, `expectBundled.md` (docs). Skill: writing-bundler-tests.

## test/bake/ (dev server / HMR)
- `bake-harness.ts`: `devTest(description, opts)` (file must live in `test/bake/dev/`), `prodTest`, `devAndProductionTest`, `Dev`, `Client` classes, `minimalFramework`, `emptyHtmlFile`, `tempDirWithBakeDeps`, `WAIT_MULTIPLIER` (debug x3, ASAN x3, CI x2). Tests in `bake/dev/*.test.ts` + top-level `dev-and-prod.test.ts`, `deinitialization.test.ts`. Skill: writing-dev-server-tests.

## test/napi/
- `napi.test.ts` (`describe.concurrent.skipIf(!canBuildNodeAddons)`), builds `napi-app/` (binding.gyp, many .c/.cpp addons) via `bun install` -> node-gyp, skip rebuild when outputs newer (`needsInstall`); compares against `nodeExeMatchingAbi`. `node-napi-tests/` = copied Node js-native-api tests from fork 190n/node `napi-tests-bun` (edit fork, then copy). Also `uv.test.ts`, `uv_stub.test.ts`.
## test/v8/
- `v8.test.ts` builds `v8-module/` (C++ using V8 API headers) for node and bun (debug/release), runs same checks in both; `bad-modules/`. Sets `CXXFLAGS -std=c++20`, Windows `__FAKE_PLATFORM__=linux`.

## test/integration/
- `@aphrody/bun-types/bun-types.test.ts`: packs `packages/bun-types` into a temp copy, installs it, type-checks `fixture/*.ts` with the `typescript` API (`setDefaultTimeout(2min)`). Run with system bun: `bun test test/integration/bun-types/bun-types.test.ts` (no native rebuild needed for `.d.ts` changes).
- Others: `next-pages`, `vite-build`, `esbuild`, `sharp`, `svelte`, `nest`, `mysql2`, `jsdom`, `expo-app`, `bun-lambda`, `pprof`, `sass`, `typegraphql` (5-min integration timeout in runner).
