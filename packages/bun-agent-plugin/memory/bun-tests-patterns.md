---
name: bun-tests-patterns
description: "How to write Bun repo tests — placement rules, spawn template, platform skip/todo idioms, snapshots, concurrency, leak/RSS test patterns, package-manager test setup with Verdaccio, anti-flake rules"
metadata:
 type: reference
---

# Writing tests in the Bun repo

Related: `bun-tests-harness` · `bun-tests-layout` · `bun-tests-runner-ci` · `bun-install-cli-map`

## Placement
- Add to the existing file for the module (fetch -> `test/js/web/fetch/fetch.test.ts`, Bun.serve -> `test/js/bun/http/serve.test.ts`, install -> `test/cli/install/<feature>.test.ts`). New file must end `.test.ts(x)`.
- `test/regression/issue/<real-issue-number>.test.ts` only for true regressions with a real GitHub issue.
- Ported Node tests (`test/js/node/test/{parallel,sequential}`) are upstream; don't rewrite them, run with `bun bd <file>`.
- `.d.ts`-only changes: `bun test test/integration/bun-types/bun-types.test.ts` (system bun OK).

## Running
`bun bd test <file> [-t "name"]` (debug build + quiet logs). Never `bun test` directly for native changes. Debug builds are ASAN-instrumented and 10-100x slower.
Exception-scope validation locally: `BUN_JSC_validateExceptionChecks=1 BUN_JSC_dumpSimulatedThrows=1 bun bd test <file>`.

## Spawn template
```ts
import { test, expect } from "bun:test";
import { bunEnv, bunExe, normalizeBunSnapshot, tempDir } from "harness";
test.concurrent("x", async => {
 using dir = tempDir("prefix", { "index.js": `console.log("hi")` });
 await using proc = Bun.spawn({ cmd: [bunExe, "index.js"], env: bunEnv, cwd: String(dir), stderr: "pipe" });
 const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text, proc.stderr.text, proc.exited]);
 expect(normalizeBunSnapshot(stdout, dir)).toMatchInlineSnapshot(`"hi"`);
 expect(exitCode).toBe(0); // exit code LAST
});
```
- Single-file: `cmd: [bunExe, "-e", code]`. Or `bunRun(...)` + `expect(r).toSpawn`.
- Use `tempDir` (disposable), not `tmpdirSync`/`fs.mkdtempSync`.
- Servers: always `port: 0`; never `randomPort` for listening; never hit public internet (use `VerdaccioRegistry` or local `Bun.serve({port:0})`).
- Never assert absence of "panic"/"uncaught exception" text.

## Platform / build gating (in-file, preferred over expectations.txt)
- `test.skipIf(isWindows)(...)`, `it.skipIf(!isLinux && !isAndroid)`, `describe.skipIf(!canBuildNodeAddons)`, `test.if(cond)`, `test.todoIf(isFlaky && isMacOS)`, `test.todoIf(isBroken)`, `test.skipIf(isASAN)` with a comment naming the failure. `describe.concurrent.skipIf(...)` used in napi.
- Flags from harness: `isWindows/isMacOS/isLinux/isMusl/isArm64/isIntelMacOS/isASAN/isDebug/isCI/isBuildKite`, `isDockerEnabled`, `isIPv6`, `isGlibcVersionAtLeast`, `isMacOSVersionAtLeast`.
- Whole-file quarantine only via `test/expectations.txt` (`[ WINDOWS ] path [ SKIP ] # reason`), which deletes all coverage of that file on matching platforms.

## Timing / flakiness
- Budget ~1s per test, ~10s per file; use `test.concurrent` / `describe.concurrent` for independent subprocess tests.
- No `setTimeout`/`sleep(N)` to wait for conditions — await the event or poll with a deadline.
- `setDefaultTimeout` is a ceiling, call before registrations; per-test timeout only for outliers (e.g. bun-install-registry uses 5 min because Verdaccio).
- bake: `WAIT_MULTIPLIER` scales waits.

## Leak / memory tests
- RSS pattern: warm up, `Bun.gc(true)`, `const before = rss` (harness `rss`), loop N, `Bun.gc(true)`, delta MB, `expect(growth).toBeLessThan(isASAN ? big : small)` — branch on `isASAN`/`isDebug`, keep bound well below the unfixed leak (example `test/js/node/buffer-from-encoding-leak.test.ts`: 40 MB release / 400 MB ASAN vs ~200 MB leak).
- Subprocess variant: `expectRssDeltaBelow([...args], {release, debug})` (disables ASAN quarantine; script prints `{"deltaMiB":n}`), or `runFixtureMaxRSS` + `emptyProcessMaxRSS`.
- Object-count pattern: `expectMaxObjectTypeCount(expect, "TypeName", n)` via `bun:jsc` `heapStats`; `gcTick` to run finalizers.
- FD leaks: `using _ = fileDescriptorLeakChecker`, `getFDCount`; test `test/cli/install/install-fd-leak.test.ts`.
- LSan runs in ASAN CI unless listed in `test/no-validate-leaksan.txt`; suppressions `test/leaksan.supp`. Local: `bun run testleak test <file>` (script = `./build/debug/bun-debug` with LSan env; build first).
- GC retention bugs: never blame the conservative stack scanner without heap snapshot (`require("bun:jsc").generateHeapSnapshotForDebugging`) + debugger proof.
- Internal hooks: `require("bun:internal-for-testing")` (enabled by `BUN_FEATURE_FLAG_INTERNAL_FOR_TESTING=1` in bunEnv).

## Package-manager tests
```ts
import { VerdaccioRegistry, bunExe, bunEnv } from "harness";
const registry = new VerdaccioRegistry;
beforeAll(async => { await registry.start; });
afterAll( => registry.stop);
const { packageDir, packageJson } = await registry.createTestDir({ bunfigOpts: { linker: "isolated" }, files: {...} });
```
- Fixture packages live in `test/cli/install/registry/packages/<name>/` (verdaccio storage layout with tarballs + package.json metadata).
- `runBunInstall(env, cwd, opts)` asserts "Saved lockfile" and no warn/error; `textLockfile(v, obj)` builds a bun.lock fixture; snapshot `bun.lock` content after `normalizeBunSnapshot`.
- Legacy: `dummy.registry.ts` (`dummyBeforeAll` + `setHandler(dummyRegistry(urls, {...}))`), concurrent `createTestContext`.
- Linker matrix: many tests loop `for (const linker of ["hoisted", "isolated"])`; test tree default linker is isolated (test/bunfig.toml).

## Bundler / dev server
- Bundler: `itBundled("group/name", { files: {...}, run: {stdout}... })` from `test/bundler/expectBundled.ts` (skill writing-bundler-tests).
- Dev server: `devTest("name", { files, async test(dev) {...} })` only inside `test/bake/dev/` (skill writing-dev-server-tests).
