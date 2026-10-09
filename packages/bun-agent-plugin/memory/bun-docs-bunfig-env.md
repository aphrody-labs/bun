---
name: bun-docs-bunfig-env
description: "Every bunfig.toml key (runtime, [serve], [test], [install], [run]) with defaults.env loading order, Bun-specific env vars, and the full `bun run` flag list from docs"
metadata:
 type: reference
---

# bunfig.toml, env vars, `bun run` flags (docs/runtime/bunfig.mdx, environment-variables.mdx, runtime/index.mdx, snippets/cli/run.mdx)

## Where bunfig is read
- Local `bunfig.toml` next to `package.json`; override path with `--config`/`-c` (default `$cwd/bunfig.toml`).
- Global `$HOME/.bunfig.toml` or `$XDG_CONFIG_HOME/.bunfig.toml` - read ONLY by package-manager commands (install/add/remove/update/pm/bunx). Local overrides global per key; CLI flags override bunfig.
- `bun run` loads only the local bunfig (never global).

## Top-level (runtime)
| key | notes |
|---|---|
| `preload = ["./preload.ts"]` | scripts/plugins run before file/script (= `--preload`/`-r`/`--require`/`--import`) |
| `jsx`, `jsxFactory`, `jsxFragment`, `jsxImportSource` | same as tsconfig compilerOptions; for non-TS projects |
| `smol = true` | less memory, more GC |
| `logLevel` | `"debug" \| "warn" \| "error"` |
| `[define]` `"process.env.bagel" = "'lox'"` | values parsed as JSON; single-quoted strings ok; `'undefined'` -> undefined |
| `[loader]` `".bagel" = "tsx"` | loaders: jsx js ts tsx css file json toml wasm napi base64 dataurl text |
| `telemetry = false` | = `DO_NOT_TRACK`; today only controls anonymous crash reports |
| `env = false` or `[env] file = false` | disable auto .env loading; explicit `--env-file` still loads |
| `[console] depth = 3` | default 2; `--console-depth` overrides |

## `[serve]`
`port` default 3000; also `BUN_PORT` / `PORT` env or `--port`. (Fullstack dev-server plugins go under `[serve.static] plugins = [...]` - see `bun-docs-bundler`.)

## `[test]` (details in `bun-docs-test`)
`root` (".") · `preload` · `pathIgnorePatterns` (globs, pruned during scan; `--path-ignore-patterns` replaces entirely) · `smol` ·
`coverage` (false) · `coverageThreshold` (number or `{ lines, functions }`; `statements` accepted but not enforced) · `coverageSkipTestFiles` (false) ·
`coverageIgnoreSourcemaps` (false) · `coveragePathIgnorePatterns` (string|array) · `coverageReporter` (["text"], add "lcov") · `coverageDir` ("coverage") ·
`randomize` (false) · `seed` (needs randomize) · `rerunEach` (0) · `retry` (0; per-test `{retry:N}` wins) · `concurrentTestGlob` · `onlyFailures` (false) ·
`[test.reporter] dots = true`, `junit = "test-results.xml"`.

## `[install]` (details in `bun-docs-pm`)
| key | default | notes |
|---|---|---|
| `optional` / `dev` / `peer` | true | which dep kinds to install |
| `production` | false | skip devDeps + freezes lockfile (add/remove/update then fail) |
| `exact` | false | default writes caret `^x.y.z` |
| `ignoreScripts` | false | skips pre/install/postinstall/prepare for project AND trustedDependencies |
| `concurrentScripts` | 2 x CPU cores | `--concurrent-scripts` |
| `saveTextLockfile` | true (since 1.2) | false -> binary `bun.lockb` when no lockfile exists |
| `auto` | "auto" | auto-install: `auto` / `force` / `disable` / `fallback` (`bun -i`) |
| `prefer` | "online" | `offline` (= `--prefer-offline`) / `latest` (= `--prefer-latest`) |
| `offline` | false | never touch network; missing cache = error |
| `frozenLockfile` | false | mismatch package.json vs bun.lock errors |
| `dryRun` | false | |
| `globalDir` | `~/.bun/install/global` | env `BUN_INSTALL_GLOBAL_DIR` |
| `globalBinDir` | `~/.bun/bin` | env `BUN_INSTALL_BIN` |
| `registry` | `http<registry.npmjs.org>/` | string, `{ url, token }`, or `http<user>:pass@host` |
| `linkWorkspacePackages` | true | |
| `[install.scopes] myorg = ...` | | string or `{ url, token }` / `{ url, username, password }`; `$ENVVAR` substitution |
| `ca` / `cafile` | | PEM string / path (multi-cert ok) |
| `[install.cache] dir / disable / disableManifest` | `~/.bun/install/cache`, false, false | |
| `[install.lockfile] save / print` | true / - | `print = "yarn"` also writes yarn.lock (only value) |
| `linker` | `isolated` for new workspaces, `hoisted` for single-package and pre-1.3.2 projects | |
| `globalStore` | false | isolated only; share installs in `<cache>/links/`; env `BUN_INSTALL_GLOBAL_STORE` |
| `publicHoistPattern` | [] | isolated: hoist to root node_modules (pnpm public-hoist-pattern) |
| `hoistPattern` | ["*"] | isolated: hoist into `node_modules/.bun/node_modules` |
| `hoist` | true | false = no `.bun/node_modules` fallback (no phantom deps); beats hoistPattern |
| `logLevel` | | debug/warn/error |
| `[install.security] scanner = "<pkg>"` | | disables auto-install; cancels install on fatal findings |
| `minimumReleaseAge` | null | seconds (259200 = 3 days); `minimumReleaseAgeExcludes = [...]` |

## `[run]`
- `shell` - `"bun"` default on Windows, `"system"` elsewhere (system tries bash, sh, zsh). Flag `--shell bun|system`.
- `bun = true` - prepend PATH with `node` -> bun symlink for scripts (recursive, also node shebangs); default on only if `node` not on PATH. = `--bun`/`-b`.
- `silent = true` - don't print the script command (= `--silent`).
- `elide-lines = N` - with `--filter` in a TTY, keep last N lines (0 = all).
- `noOrphans = true` - exit when parent dies and kill descendants (Linux prctl PDEATHSIG; macOS kqueue NOTE_EXIT; Windows Job Object). = `--no-orphans` / `BUN_FEATURE_FLAG_NO_ORPHANS=1`.

## .env loading
Order (increasing precedence): `.env` -> `.env.{production|development|test}` (by NODE_ENV) -> `.env.local` (skipped when NODE_ENV=test) -> `.env.{mode}.local`.
- `--env-file=a --env-file=b` overrides set; works for files and scripts; accepts pipes/FIFOs/`/dev/stdin` (read once at startup; Workers and `bun test --parallel` reuse values; `--watch` reload / fork re-read).
- `--no-env-file` or bunfig `env = false` disables auto load. When invoked as `node` (`--bun`, `bunx --bun`, node symlink) Bun disables auto .env to match Node (helps Vite `loadEnv`).
- Quotes: `'..'`, `".."`, backticks. Expansion `$VAR` of earlier vars; escape `\$`. dotenv/dotenv-expand unnecessary.
- Read: `process.env`, `Bun.env`, `import.meta.env` (aliases). `bun --print process.env` dumps all.
- Types: all `string | undefined`; augment via `declare module "bun" { interface Env { AWESOME: string } }`.
- Cross-platform inline env: `bun exec 'FOO=x bun run dev'`; on Windows package scripts already run in Bun Shell.

## Bun-specific env vars (documented table)
- `NODE_TLS_REJECT_UNAUTHORIZED=0` disable TLS verification.
- `BUN_CONFIG_VERBOSE_FETCH=curl|1` log fetch (and node:http) requests; `curl` prints curl commands.
- `BUN_RUNTIME_TRANSPILER_CACHE_PATH` - cache dir for transpiled files > 4 KB (`.pile` files, content-addressed, global, safe to delete); `""`/`"0"` disables; Docker images disable it.
- `TMPDIR` (default /tmp, macOS /private/tmp). `NO_COLOR=1`; `FORCE_COLOR=1` wins over NO_COLOR.
- `BUN_CONFIG_MAX_HTTP_REQUESTS` (default 256; fetch + bun install concurrency).
- `BUN_CONFIG_NO_CLEAR_TERMINAL_ON_RELOAD=true` for `--watch`.
- `DO_NOT_TRACK=1` disables crash report upload to bun.report (on by default on macOS & Windows).
- `BUN_OPTIONS="--hot"` prepends CLI args to every bun invocation (e.g. `BUN_OPTIONS="--cpu-prof-md"`).
- Others mentioned elsewhere: `BUN_PORT`/`PORT`, `BUN_INSTALL`, `BUN_INSTALL_BIN`, `BUN_INSTALL_GLOBAL_DIR`, `BUN_INSTALL_GLOBAL_STORE`, `BUN_INSTALL_CACHE_DIR` (see `bun-docs-pm`)
 `DATABASE_URL`/`PG*`, `REDIS_URL`, `S3_*`/`AWS_*` (see `bun-docs-runtime-apis-n-z`).
- Dev-build only: `BUN_DEBUG_<scope>=1`, `BUN_DEBUG_QUIET_LOGS=1`, `BUN_DEBUG=<file>.log` (see `bun-docs-voice-contributing`).

## `bun run` semantics
- `bun [bun flags] run <script|file> [script flags]` - Bun flags MUST precede `run`; trailing flags go to the script. Naked `bun file.ts` = `bun run file.ts`.
- `bun <script>` works unless a built-in command has the same name (built-in wins). `bun run` with no args lists scripts. `pre<x>`/`post<x>` run; failing pre aborts.
- Resolution: 1) package.json script 2) source file 3) project bin (node_modules/.bin) 4) (`bun run` only) system command. Absolute and `./` paths always files.
- `bun run -` reads TS+JSX from stdin. Node-shebang CLIs run with node unless `--bun`.
- `--check` type-checks first (exit 1, nothing runs) - see `bun check` in `bun-docs-runtime-apis-a-m`.

## `bun run` flags (snippets/cli/run.mdx)
Execution: `--silent`, `--if-present`, `-e/--eval`, `-p/--print`, `--elide-lines`, `-F/--filter`, `--workspaces`, `--parallel`, `--sequential`, `--no-exit-on-error`
`-b/--bun`, `--shell`, `--interactive` (node:repl), `--smol`, `--expose-gc`, `--no-deprecation`, `--throw-deprecation`, `--title`, `--zero-fill-buffers`
`--no-addons` (blocks process.dlopen + ffi cc), `--no-ffi-cc`, `--unhandled-rejections strict|throw|warn|none|...`, `--console-depth` (2), `--check`.
Watch/debug: `--watch`, `--watch-kill-signal`, `--hot`, `--no-clear-screen`, `--inspect[=url]`, `--inspect-wait`, `--inspect-brk`.
Profiling (benchmarking.mdx): `--cpu-prof`, `--cpu-prof-md`, `--cpu-prof-name`, `--cpu-prof-dir`, `--heap-prof`, `--heap-prof-md` (md wins if both), `--heap-prof-name`, `--heap-prof-dir`.
Modules: `-r/--preload`, `--require`, `--import`, `--no-install`, `--install=auto|force|fallback|disable`, `-i`, `--prefer-offline`, `--prefer-latest`, `--conditions`
`--main-fields`, `--preserve-symlinks`, `--preserve-symlinks-main`, `--extension-order` (default `.tsx.ts.jsx.cts.cjs.js.mjs.mts.json.node`), `--tsconfig-override`.
Transpile: `-d/--define K:V` (JSON), `--drop=console`, `--loader .js:jsx`, `--no-macros`, `--jsx-factory`, `--jsx-fragment`, `--jsx-import-source` (react), `--jsx-runtime`
`--jsx-side-effects`, `--ignore-dce-annotations`.
Network: `--port`, `--fetch-preconnect <url>`, `--max-http-header-size` (16 KiB), `--dns-result-order verbatim|ipv4first|ipv6first`, `--use-system-ca`, `--use-openssl-ca`
`--use-bundled-ca`, `--redis-preconnect`, `--sql-preconnect`, `--user-agent`.
Misc: `--env-file`, `--no-env-file`, `--cwd`, `-c/--config`, `--no-orphans`.
