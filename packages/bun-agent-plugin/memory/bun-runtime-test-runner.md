---
name: bun-runtime-test-runner
description: "bun test implementation — CLI driver (test_command.rs, scanner, --parallel workers, sharding, --changed, reporters, coverage) and bun:test runtime (Collection/Order/Execution phases, ScopeFunctions, expect matchers, snapshots, mocks, fake timers)"
metadata:
 type: reference
---

# bun test / bun:test

## CLI side (src/runtime/cli/)
- `Tag::TestCommand` -> `exec_test` -> `test_command.rs` `TestCommand::exec` (~3100 lines). Contains `CommandLineReporter` (console output)
 `ReportersConfig`, `JunitReporter` (+ `escape_xml`, `junit_file_name`, `TestCaseReport`, `SuiteInfo`, `Metrics`), `TestFailure`
 `print_coverage_reports` (text table + atomic `lcov.info` write via `.lcov.info.<hex>.tmp` rename), `skip_exit_listeners`
 `BUN_TEST_DRAIN_EVENT_LOOP=1` (vendored node tests drain loop), `handle_top_level_test_error_before_javascript_start`.
- `cli/test/Scanner.rs` (test file discovery: `*.test.*`, `*_test.*`, `*.spec.*`, `*_spec.*`), `ChangedFilesFilter.rs` (`--changed [ref]`:
 git changed files -> bundler parse graph with packages external -> reverse import walk), `Timings.rs` (`--timings` JSON `{version:1
 files:{path:ms}}`, `--update-timings`; balances `--shard`, slowest-first under `--parallel`), `ParallelRunner.rs` +
 `cli/test/parallel/{Channel, Coordinator, FileRange, Frame, Worker, aggregate, runner}.rs` (`--parallel[=N]`: coordinator spawns `bun test
 --test-worker --isolate`, framed commands over stdin, results on fd 3; `--parallel-delay`, `--no-isolate`).
- Flags (`Arguments.rs` ~580-660, parsed ~1773): `--timeout`, `--rerun-each N`, `--retry N`, `--randomize` (+ seed), `--coverage`
 `--coverage-reporter text|lcov`, `--coverage-dir`, `--bail [N]`, `--reporter junit|dots` (`junit` needs `--reporter-outfile`), `--dots`
 `--changed`, `--isolate`, `--parallel`, `--shard=i/n`, `--timings`, `--update-timings`, `--update-snapshots`/`-u`
 `-t/--test-name-pattern`, `--only`, `--todo`, `--preload`, `--check` (type check first, see check_command.rs). bunfig `[test]` section
 read in `src/bunfig/bunfig.rs`.

## Runtime side (src/runtime/test_runner/) — `bun:test`
Module doc: "Jest-compatible test runner, expect matchers, snapshot machinery, and fake timers".
- `jest.rs`: `Jest` struct; `Jest::call` = `Bun.jest(path)`; builds the `bun:test` module object (~lines 340-452): `test`/`it`
 `xtest`/`xit`, `describe`, `xdescribe`, `beforeEach`, `beforeAll`, `afterAll`, `afterEach`, `onTestFinished`, `setDefaultTimeout`
 `expect`, `expectTypeOf`, `setSystemTime`, `mock` (= `mock.module`, `mock.restore`, `mock.clearAllMocks`), `spyOn`, `jest` object {fn
 mock, spyOn, restoreAllMocks, clearAllMocks, resetAllMocks, setSystemTime, now, setTimeout}, `vi` object {fn, mock, spyOn
 restoreAllMocks, resetAllMocks, clearAllMocks}. `FileId = u32`. Native module header `src/jsc/modules/BunTestModule.h`.
- Mocks are C++: `src/jsc/bindings/JSMockFunction.cpp` (`JSMock__jsMockFn`, `JSMock__jsSpyOn`, `JSMock__jsModuleMock`
 `JSMock__jsRestoreAllMocks`, `JSMock__jsSetSystemTime`, `JSMock__jsNow`...).
- `bun_test.rs` (~2000 lines): `BunTestRoot`, `BunTest` (per file; `Phase { Collection, Execution, Done }`), `DescribeScope`, `BaseScope`
 `BaseScopeCfg`, `ScopeMode`, `Only`, `ConcurrentMode`, `HookTag`, `ExecutionEntryCfg`, `RunTestsTask`, `HandleUncaughtExceptionResult`
 `StepResult`. Debug scope `bun_test_group` (`group_begin!`/`group_log!`).
- Three phases: `Collection.rs` (discover `test`/`describe` calls) -> `Order.rs` (collection output -> execution input; randomize) ->
 `Execution.rs` (tree of `ConcurrentGroup[ ExecutionSequence[ beforeEach, test, afterEach ] ]`, with beforeAll/afterAll groups;
 `test.concurrent` entries share a group).
- `ScopeFunctions.rs`: the chainable `test`/`describe` function objects (class `ScopeFunctions` in jest.classes.ts, cached `values:
 ["each"]`): getters `.skip .todo .failing .concurrent .serial .only`, calls `.skipIf .todoIf .failingIf .concurrentIf .serialIf
 .if`, `.each(table)`. `DoneCallback.rs` (done-callback tests).
- `expect.rs` (~3250 lines) façade `expect_core::Expect`; matchers one per file in `test_runner/expect/` (toBe, toEqual, toStrictEqual
 toMatchObject, toThrow, toHaveBeenCalled*, toHaveReturned*, toMatchSnapshot, toMatchInlineSnapshot, toThrowErrorMatching(Inline)Snapshot
 toContain*, toBeCloseTo, toBeWithin, toHaveProperty, toSatisfy, toEqualIgnoringWhitespace, toIncludeRepeated, jest-extended ones like
 toBeOneOf/toBeEven/toContainKeys..., `simple_matchers.rs`). Helper macros in `mod.rs`: `unary_predicate_matcher!`, `expect_throw!`
 (pretty_fmt template, user data never scanned for markup).
- Asymmetric matchers & classes in `jest.classes.ts`: ExpectAnything, ExpectAny, ExpectCloseTo, ExpectObjectContaining
 ExpectStringContaining, ExpectStringMatching, ExpectArrayContaining, ExpectCustomAsymmetricMatcher, ExpectMatcherContext
 ExpectMatcherUtils, ExpectStatic, Expect, ExpectTypeOf, DoneCallback, ScopeFunctions. `expect.extend` custom matchers via
 ExpectCustomAsymmetricMatcher/MatcherContext.
- Diffs/printing: `pretty_format.rs` (jest pretty-format port), `diff_format.rs`, `diff/printDiff.rs`, `diff/text_diff.rs`.
- `snapshot.rs`: `Snapshots` (update_snapshots flag, per-file `__snapshots__/<file>.snap`, inline snapshot source rewriting; debug scope
 `inline_snapshot`).
- `timers/FakeTimers.rs` (+ `FakeTimersConfig.bindv2.ts`): `useFakeTimers` (options object; Jest 26 "modern"/"legacy" string is no-op)
 advanceTimersByTime, etc.; errors "Fake timers are not active. Call useFakeTimers first."
- `debug.rs`, `Timings`.
- `node:test` is a separate JS implementation: `src/js/node/test.ts` + `internal/test_runner/mock_timers.ts`.

## Writing tests in this repo
Use `bun bd test <file>`; verify the test FAILS with `USE_SYSTEM_BUN=1 bun test <file>`. Use `harness` helpers (`bunExe`, `bunEnv`
`tempDir`, `normalizeBunSnapshot`); no sleeps; `port: 0`. Test-runner tests live in `test/js/bun/test/`, CLI test-runner tests in
`test/cli/test/`.

Related: `bun-runtime-cli-commands`, `bun-runtime-bun-apis`.
