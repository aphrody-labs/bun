---
name: bun-review-rules
description: "Condensed checklist of what blocks Bun PRs (REVIEW.md + .claude/docs/landing-prs.md) — tests, memory safety, errors, style, compat, perf, cross-platform"
metadata:
 type: reference
---

Source of truth: `<bun>\REVIEW.md` (core) and `<bun>\.claude\docs\landing-prs.md` (situational: Node/Web compat, API design, perf, cross-platform, deps, docs/types, PR process). Re-read the relevant section before non-obvious work. Condensed:

## Tests
- Await the observable condition; wire every failure event (error/close/abort/exit) to reject. No `sleep` ≥50ms outside bounded poll loops without a comment.
- Test must fail on unfixed build (`USE_SYSTEM_BUN=1 bun test f`) and pass with `bun bd test f`; deleting each load-bearing clause of the fix must break a test.
- No vacuous assertions (un-awaited `.rejects`, expects in callbacks that may not fire, bare `toThrow`); `toBe` over `toContain`; read snapshots before committing; never `--update` with `-t`.
- Variant matrix: CLI flag AND JS API, ESM+CJS, `--compile`/`--bytecode`/watch, limits ±1, error paths, negative contract. Add variants alongside, never mutate existing tests.
- Subprocess: `Promise.all([proc.stdout.text, proc.stderr.text, proc.exited])`; assert stdout before exitCode.
- Hermetic: no internet (VerdaccioRegistry, `Bun.serve({port:0})`), `using`/`await using` cleanup registered before assertions, `{...bunEnv, KEY: undefined}`, `Buffer.alloc(n, fill).toString` not `"x".repeat(n)`, `test.concurrent`, `test.each`, skip via harness with reason (bare `return` = PASS).
- Every behavior change ships a test; crash fixes need the crashing input as spawned fixture; leak tests: `Bun.gc(true)` + `heapStats`, RSS bounds branch on `isASAN`/`isDebug`.
- Never weaken/skip/delete tests silently; `.todo` with observed failure; un-skip todo tests your fix makes pass.

## Native memory safety (most blocked)
- Pair acquire/release at the acquisition site (Drop guard before fallible calls). One named owner per allocation, freed with its own allocator (arenas don't run Drop).
- External size/index arithmetic is adversarial; validation must survive release builds.
- Exception check after every call that can enter JS (RETURN_IF_EXCEPTION / JSError `?`); never `clearException`; verify with `BUN_JSC_validateExceptionChecks=1 BUN_JSC_dumpSimulatedThrows=1`.
- No pointer/slice outliving its memory (stack buffers, growable containers, reused parser buffers, SSO strings).
- JSValues kept past the call: WriteBarrier in `.classes.ts` + visitChildren, MarkedArgumentBuffer; Strong only for justified keepalive.
- User JS (toString, getters, Proxy, emit) can free your state: coerce first, re-validate after callbacks, ref/defer deref.
- Thread affinity: JS heap only on JS thread; atomics for shared counters; `thread_isolated_copy`; no per-VM state in globals/thread-locals.
- Refcounts balanced on every terminal path. Never blame the conservative stack scanner.

## Correctness
- Fix the whole bug class (sync/async twins, POSIX/Windows, SSL/non-SSL, every caller). Enumerate input space (empty, `.`, CRLF, IPv6, max int, non-ASCII/Latin1/lone surrogates).
- Every added line demonstrably live; verify helper semantics by reading them; ported code (esbuild, Node) is the spec.
- Refactors guilty until proven equivalent; git-blame odd code before deleting. One source of truth; new enum variant → audit every match. Cache keys cover all inputs; bump format version on output change.

## Errors
- Never swallow failures; exit nonzero after error. Error messages: name resource (quoted via `bun.fmt.quote`), constraint, errno, remedy on `note:` line, no "Please", stderr.
- User-reachable failures = recoverable errors, never panics; OOM via `bun_core::handle_oom`.
- Every error/abort path settles promises, calls completion callbacks, clears timers. User callbacks via `event_loop.runCallback`.
- JS errors through `src/jsc/bindings/ErrorCode.ts` / `$ERR_*`, never hand-built `.code`.

## Style
- Use in-tree helpers (`bun_sys`, bun_core strings/fmt/Output, PathBufferPool, WTF:: containers) — never raw std::fs/libc.
- Match file conventions; truthful names; named constants. Delete dead code in the same PR. Early returns, `?`, exhaustive match. Comments: one line, only what code can't say. SAFETY comment above every `unsafe`.
- `src/js/`: `$`-intrinsics (`$isJSArray`, `$call`, `map.$get`), `require("node:x")`, lazy `x ??= require(...)`, `Promise.$resolve`/withResolvers, `createFIFO`, fields declared in class body, `process.platform === "win32"`.

## Architecture
- Fix at the layer owning the invariant. No new fields on ZigGlobalObject, no bindings in monolithic bindings.cpp, no re-export shims. Per-VM state on VirtualMachine/RareData. Simplest mechanism.

## Security
- Validate before allocate/process; archive/lockfile paths reject empty, `.`, `..`, NUL, absolute, both separators; re-verify after realpath. Fail closed. Prototype-pollution-safe options (`{__proto__: null...}`), strict booleans.

## Situational (landing-prs.md)
- Node compat: real Node behavior is the spec (bug-for-bug, exact ERR code/class/message/ordering); port Node tests verbatim into `test/js/node/test/parallel/`, failures as `test.todo`. Web APIs: WHATWG spec/WPT.
- API: names from Web spec > Node > npm/pnpm; no speculative options; ship CLI+API+.d.ts+docs+--help together; new behavior defaults OFF; undefined = default, null = off.
- Perf: numbers from `bench/` for all input classes; no Proxies/getOwnPropertySlot on hot paths; LazyClassStructure, `vm.propertyNames`; count syscalls/copies; state `size_of` changes.
- Deps: last resort; vendor/ read-only; internal manifests pin exact versions.
- Docs voice (`docs/project/contributing.mdx`): short active sentences, present tense, "you", no easy/simple/just. `.d.ts` mirror runtime exactly; no `*/` in JSDoc; verify by compiling under both tsconfigs.
- PR: re-read diff, remove residue (`.only`!), description = squash message naming root-cause line and tests; green CI on all platforms; one concern per PR; branches `claude/*` upstream.

Related: `bun-tests-harness`, `bun-core-idioms`, `bun-fork-aphrody`.
