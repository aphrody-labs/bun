---
name: bun-tests-harness
description: "test/harness.ts exports with signatures — bunExe/bunEnv, tempDir, normalizeBunSnapshot, platform flags (isWindows/isASAN/isDebug...), gc/leak helpers, VerdaccioRegistry, install helpers, matchers"
metadata:
 type: reference
---

# test/harness.ts (~2400 lines) — import as `from "harness"`

Related: `bun-tests-layout` · `bun-tests-patterns` · `bun-tests-runner-ci` · `bun-install-cli-map`

## Platform / build flags (consts)
`isMacOS`, `isLinux`, `isFreeBSD`, `isAndroid`, `isPosix`, `isWindows`, `isIntelMacOS`, `isArm64`, `isMusl`, `isGlibc`, `libcFamily: "glibc"|"musl"`
`isDebug` (= `Bun.version.includes("debug")`), `isASAN` (via `bun:internal-for-testing` `isASANEnabled`, fallback execPath contains `bun-asan`; note `bun bd` debug builds are ASAN too)
`isCI` (`CI` env set), `isBuildKite`, `isVerbose` (`DEBUG=1`), `isFlaky = isCI`, `isBroken = isCI` (use as `test.todoIf(isFlaky && isMacOS)`), `BREAKING_CHANGES_BUN_1_2 = false`.
Functions: `isIPv4`, `isIPv6` (false on BuildKite Linux), `getGlibcVersion`, `isGlibcVersionAtLeast(v)`, `getMacOSVersion`, `isMacOSVersionAtLeast(n)`, `isDockerEnabled`, `dockerExe`, `canBuildNodeAddons`.

## Spawning
- `bunExe: string` — `process.execPath` (forward slashes on Windows).
- `bunEnv: NodeJS.Dict<string>` — process.env plus: `BUN_DEBUG_QUIET_LOGS=1`, `NO_COLOR=1`, `FORCE_COLOR` removed, `TZ=Etc/UTC`, `CI=1`, `GITHUB_ACTIONS=false`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`, `BUN_FEATURE_FLAG_INTERNAL_FOR_TESTING=1`, `BUN_DISABLE_SLOW_FILESYSTEM_WARNING=1`, `BUN_INTERNAL_INTERACTIVE_ASSUME_TTY=1`, `BUN_GARBAGE_COLLECTOR_LEVEL` (default "0"), `BUN_FEATURE_FLAG_EXPERIMENTAL_BAKE=1`, `AGENT=false`, `WANTS_LOUD=0`; strips `BUN_DEBUG_*` (except QUIET), `BUILDKITE*`, `NODE_ENV`, `BUN_INSPECT_CONNECT_TO`, `JSC_useJIT`; ASAN adds `ASAN_OPTIONS=allow_user_segv_handler=1:disable_coredump=0`; Windows `SHELLOPTS=igncr`; debug `BUN_DEBUG_NO_DUMP=1`.
- `nodeExe: string|null`, `nodeExeMatchingAbi: Promise<string>`, `shellExe` ("pwsh" | "bash").
- `bunRun(fileOrArgs: string|string[], env?) : Promise<BunRunResult{stdout,stderr,exitCode,signalCode}>` (trimmed, never throws; pair with `expect(r).toSpawn`), `bunTest(file, env?)` (sync, throws), `bunRunAsScript(dir, script, env?, execArgv?)`, `fakeNodeRun(dir, file, env?)`.
- `blackholePortSource` (string for `bun -e`, not Windows/musl), `waitForPort(port, timeout=60000)`.

## Temp dirs / files
- `tempDir(basename, tree|absPathToCopy): string & Disposable & AsyncDisposable` — use with `using dir = tempDir(...)`; removes on dispose. Preferred.
- `tempDirWithFiles(basename, tree)` (no auto-cleanup), `tempDirWithFilesAnon(tree)`, `tmpdirSync(pattern="bun.test.")` (discouraged in new tests), `makeTree(base, tree)` / `makeTreeSync(base, treeOrPath)`.
- `type DirectoryTree = { [name]: string | Buffer | DirectoryTree | ... }`.
- `cwdScope(cwd)`, `rmScope(path)`, `disableAggressiveGCScope`, `rejectUnauthorizedScope(bool)`, `fileDescriptorLeakChecker` — all `Symbol.dispose` scopes.
- `readdirSorted(path)`, `nodeModulesPackages(nodeModulesPath): string` (snapshot-friendly listing), `osSlashes`, `ospath`, `joinP`, `writeShebangScript`, `toTOMLString(obj)`, `waitForFileToExist`, `compileFixture(sourcePath, {flags})`.

## Snapshot normalization
`normalizeBunSnapshot(snapshot, optionalDir?)`: replaces dir -> `<dir>`, cwd -> `<cwd>`, tmpdir -> `<tmp>`, home -> `<home>`, CRLF->LF, `\`->`/`, strips `[12.34ms]` timings, stack frame positions -> `(file:NN:NN)`, `Bun v...` -> `Bun v<bun-version>`, `Bun.version`/`Bun.revision` placeholders, trims.

## GC / memory / leaks
- `gc(force=true)` (Bun.gc), `gcTick(trace=false)` (gc + `Bun.sleep(0)` so finalizers run), `withoutAggressiveGC(fn)`, `hideFromStackTrace(fn)`.
- `expectMaxObjectTypeCount(expect, type, count, maxWait=1000)` — polls `bun:jsc` `heapStats.objectTypeCounts[type] <= count`.
- `rss = process.memoryUsage.rss`; `expectRssDeltaBelow(cmdArgs, {release, debug})` — spawns bun with ASAN quarantine off, script prints `{"deltaMiB": n}` last line, bound = debug when `isASAN||isDebug`.
- `runFixtureMaxRSS(fixture, expected)`, `emptyProcessMaxRSS`; `getFDCount`, `getMaxFD`; `forceGuardMalloc(env)`; `dumpStats`.

## Package-manager helpers
- `runBunInstall(env, cwd, {allowWarnings, allowErrors, expectedExitCode, savesLockfile=true, production, frozenLockfile, saveTextLockfile, packages, verbose})` — asserts no `error:`/`warn:` and "Saved lockfile".
- `runBunUpdate(env, cwd, args?)`, `pack(cwd, env...args)` (`bun pm pack`), `textLockfile(version, pkgs)`, `assertManifestsPopulated(absCachePath, registryUrl)`.
- `toMatchNodeModulesAt(lockfile, root)`, `toHaveBins`, `toBeValidBin`, `toBeWorkspaceLink` helpers.
- Older registry: `test/cli/install/dummy.registry.ts` (see `bun-tests-layout`).

## TLS / net / misc
`tls`, `expiredTls`, `invalidTls` (cert/key objects), `exampleSite(protocol)`, `exampleHtml`, `gunzipJsonRequest(req)`, `randomPort` (do NOT use for servers — use `port: 0`), `describeWithContainer(label, {image, env, args, archs, concurrent}, fn({port, host, ready}))` (docker services from `test/docker/`), `getSecret(name)`, `getPuppeteerInstallEnv`, `forEachLine(asyncIterable)`, `readableStreamFromArray`, `fillRepeating`, `randomLoneSurrogate` & co, `runWithError(cb)`, `lazyPromiseLike`, `libcPathForDlopen`, `preadExact`, `readElf64ProgramHeaders(path)`, `mergeWindowEnvs`.

## Custom matchers (expect.extend in harness)
`toSpawn(expectedStdout?)` (exit 0 + empty stderr on BunRunResult), `toHaveTestTimedOutAfter(ms)`, `toBeBinaryType("buffer"|"uint8array"|...)`, `toThrowWithCode(cls, code)`, `toThrowWithCodeAsync`, `toBeLatin1String`, `toBeUTF16String` (via `bun:internal-for-testing` jscInternals).

## Other harnesses (not in harness.ts)
- `test/js/node/harness.ts` — `createTest(path)` + node `assert` adapters (preloaded for test/js/node via its bunfig).
- `test/bundler/expectBundled.ts` — `itBundled`, `testForFile`, `dedent`, `ESBUILD` env switch (`BUN_BUNDLER_TEST_USE_ESBUILD`).
- `test/bake/bake-harness.ts` — `devTest`, `prodTest`, `devAndProductionTest`, `Dev`, `Client`.
- `test/cli/install/dummy.registry.ts`, `simple-dummy-registry.ts` — in-process fake registries.
- `test/napi/node-napi-tests/harness.ts` + `prebuild.ts` — Node js-native-api test harness.
- `test/js/node/test/common/` — Node's own `common` module for ported tests (`mustCall`, `PORT`, fixtures...).

## Preload
`test/preload.ts` (from `test/bunfig.toml [test] preload`) syncs `process.env` to `harness.bunEnv` (deletes others except TZ) and sets `Bun.$.env(process.env)`.
