# Bun agent guidance

Bun is a Rust runtime and toolkit with JavaScriptCore C++ bindings, a bundler,
test runner and package manager.

## Git hosting and qualified hosts

- GitHub `aphrody-labs/bun` remains the source of truth. Its private GitLab pull
  mirror is `https://gitlab.com/aphrody-labs/bun`; do not push divergent history
  to the mirror or treat it as a second source of truth.
- Native `glab` 1.123.0 is installed on `vps` and `dbfr`. Both hosts authenticate
  as `aphrody-dev` through their operating-system keyring and use SSH for Git.
  Never copy tokens into repositories, shell profiles, command arguments or
  plaintext CLI configuration.
- `vps` and `dbfr` were reachable through their SSH aliases on 2026-10-14.
  Reachability remains a live fact: verify it before each remote operation.

## Authorization and scope

- No human in the loop: carry the current request through discovery, implementation,
  applicable gates and delivery without intermediate approval or confirmation.
- Resolve routine choices autonomously. If a dependency blocks progress, continue
  independent work and pursue an authorized alternative; report concrete blockers.
- User pauses, cancellations and scope changes take effect immediately. Autonomy
  does not authorize resuming paused work or unrelated tasks.
- The owner authorizes autonomous execution, tools, delegation and all deletions
  needed for the requested task, including recursive cleanup, without further confirmation.
- Verify absolute deletion paths. Preserve unrelated work and protected data unless
  explicitly included in the request. Tool and platform restrictions still apply.
- Use native Windows tools on this workstation; do not start WSL.
- Read repository guidance before changes; preserve concurrent edits and staged work.
- Report actual results and qualification limits. Never print or commit secrets.

## Runtime and builds

- VPS factory layout (Google style, see `docs/project/vps-factory.md`):
  `~/depot_tools` (daily `depot-tools-update.timer`), checkouts in
  `~/src/<project>` (chromium, chromiumos, cef, brave-core, bun), GN outputs in
  `~/build/out/<project>/<config>`, shared caches in
  `~/build/google/cache`, services in `~/apps`. Drive it with
  `bun factory sync|gen|build|all <target>`, which takes free build slots
  (multi-build mode, `bun factory slots`); `bun factory run -- <command>` runs
  any other heavy command, such as `bun bd`, in a slot.
- Use the Aphrody Bun fork for JavaScript, TypeScript and Python tooling.
  Check provenance with `bun agent-plugin doctor --json`.
- Build and execute checkout changes with `bun bd [command]`; test with
  `bun bd test <file>`. Installed Bun does not include checkout changes.
- Run type checking, lint, formatting and migration through the native commands
  `bun check`, `bun lint`, `bun fmt` and `bun n2b`. Do not delegate these commands
  to subprocess backends, `bunx`, standalone Oxc tools, tsgo/tsc or external n2b.
  Qualify checkout changes with `bun bd check`, `bun bd lint`, `bun bd fmt` and
  `bun bd n2b`; fix native failures instead of selecting an external fallback.
  Package scripts may expose these native commands, but must not replace them
  with wrappers or external backends.
- Build scripts accept trailing execution arguments. Put build flags before them;
  see `scripts/build.ts`. Do not invoke the debug executable directly.
- Run long builds asynchronously; keep user updates responsive. Do not impose
  a build timeout on `bun bd`.
- Declaration-only changes need no native build:
  `bun test test/integration/bun-types/bun-types.test.ts`.
- For platform changes, use `bun run rust:check-all`; gated code needs its target built.
- Debug logging: `BUN_DEBUG_QUIET_LOGS=1` or `BUN_DEBUG_<SCOPE>=1`.
- JSC exception checks: `BUN_JSC_validateExceptionChecks=1` and
  `BUN_JSC_dumpSimulatedThrows=1`.

## Tests

- Prefer existing `.test.ts` / `.test.tsx` files beside related coverage.
- Locations: `test/js/bun`, `test/js/node`, `test/js/web`, `test/cli`,
  `test/bundler`, `test/integration`, `test/napi`, `test/v8`.
- Use `itBundled` for bundler tests. Reserve `test/regression/issue/<number>`
  for real GitHub issues that previously worked and then regressed.
- Use `bun:test` and harness helpers: `bunExe`, `bunEnv`, `tempDir`,
  `normalizeBunSnapshot`. Prefer in-process fixtures; use a subprocess only when
  the test needs to verify CLI behavior, process isolation, workers or teardown.
- Assert meaningful output before exit status; avoid absence-of-crash assertions.
- Use `port: 0`, local HTTP fixtures and `TestRegistry` from `registry`; no public network.
- Await events or poll with a deadline; no fixed sleeps. Keep tests short and use
  concurrency only for independent work within the resource budget.
- Branch leak bounds on `isASAN` / `isDebug`; avoid inflated global timeouts.
- For regression tests, demonstrate failure with
  `USE_SYSTEM_BUN=1 bun test <file>` and success with `bun bd test <file>`.
- Push runtime changes only after the relevant changed-binary tests pass.

## Source map

- `src/bun_core`: strings, logging, flags, allocation; `src/sys`: syscall wrappers.
- `src/runtime`: entry, CLI, Bun APIs, servers, Node compatibility, crypto, Web APIs.
- `src/jsc` and `src/jsc/bindings`: Rust and C++ JavaScriptCore integration.
- `src/js_parser`, `src/js_printer`, `src/transpiler`, `src/resolver`, `src/ast`:
  parsing, printing, transpilation, resolution and syntax trees.
- `src/bundler`, `src/install`, `src/shell`, `src/css`, `src/http`, `src/sql`,
  `src/bake`, `src/event_loop`: their respective runtime domains.
- `src/js/{node,bun,thirdparty,internal,builtins}`: built-in JavaScript modules.
- `vendor`: native dependency sources; build recipes in `scripts/build/deps`.
- `src/codegen`: generated classes, sinks, modules and functions. Edit inputs,
  not generated output; the build regenerates bindings.
- `plugins/<name>`, `packages/bun-video`: optional add-on submodules; state in
  `docs/project/fork-inventory.json`, guide in `docs/project/add-ons.mdx`.

## Implementation

- Follow neighboring code and reuse existing APIs. Prefer RAII and explicit ownership.
- Arena resets do not run `Drop`; release owned allocations and references first.
- C++ public JS classes use object, prototype and constructor classes, property
  tables, iso subspaces for C++ fields, and cached structures in `ZigGlobalObject`.
- Keep comments short and explain only non-obvious facts. Fix the cause of a bug.
- For GC retention, inspect barriers, strong references, protection, pending
  activity and missing dereferences. Blaming conservative stack scanning requires
  both a heap snapshot excluding other retainers and debugger evidence identifying
  the retaining stack word and frame. Extra sleeps or GC calls are not proof.
- Read `REVIEW.md` for non-obvious choices and the relevant sections of
  `.claude/docs/landing-prs.md` for compatibility, API, performance, platform,
  dependency, documentation and PR changes.

## Bun Video

- Package: `packages/bun-video`, the optional submodule aphrody-labs/bun-video
  (`git submodule update --init --checkout --recursive packages/bun-video`); guidance:
  `.claude/skills/bun-video/SKILL.md`. The runtime links no native video (`videoNative` is off).
- WebGPU compute: `packages/bun-video/docs/webgpu.md`, `bun-video-webgpu` CLI.
- Qualify compute, browser probing, native providers, encoding and DRM playback
  separately; one working layer does not prove the others.

## Delivery and diagnostics

- Commit only owned paths; preserve shared index changes. Use the owner's identity
  `aphrody-dev <contact@aphrody.com>` without co-author or assistant attribution.
- Fetch and check ancestry or rebase before a normal push; never force-push.
- Keep the current branch unless requested otherwise; newly created branches use
  the repository's `claude/` prefix.
- CI: `bun run ci:errors`, `ci:status`, `ci:logs`, `ci:find`, `ci:watch`.
  BuildKite needs `bk` and `BUILDKITE_API_TOKEN`; `.bk.yaml` selects the pipeline.
  Fix incorrect presentation in `scripts/find-build.ts`.
- PR feedback: `bun run pr:comments [number] [--include-resolved] [--json]`.
