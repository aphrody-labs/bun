---
name: bun-docs-pm
description: "Bun package manager cheat-sheet (install/add/remove/update/audit/dedupe/prune/patch/pm/publish/bunx/create/init, bunfig [install], lockfile, linkers, trust, catalogs, overrides, workspaces, --filter) verified from docs/pm, docs/runtime/templating, docs/guides/install"
metadata:
 type: reference
---

Source: <bun>\docs\pm\*.mdx, docs\pm\cli\*.mdx, docs\runtime\templating\{create,init}.mdx, docs\guides\install\*, docs\snippets\cli\*.mdx (flag lists).
Related: `bun-docs-bunfig-env` (full bunfig/env ref), `bun-docs-test`, `bun-docs-map`.

## bun install (`bun i`)
- Installs deps+devDeps+optionalDeps; peerDeps installed by default (optional peers in `peerDependenciesMeta` reuse existing dep if possible).
- Runs ROOT project's `{pre|post}install` + `{pre|post}prepare`; dependency lifecycle scripts only if trusted (see Trust).
- Flags: `--production` (no devDeps, IMPLIES `--frozen-lockfile`; leaves already-present devDeps -> use `bun prune --production`)
 `--frozen-lockfile` (exact lock, error if package.json disagrees; no lockfile -> installs from package.json, writes none)
 `--dry-run`, `--lockfile-only`, `--no-save` (no lockfile), `--save` (default true), `--yarn` (also write yarn.lock v1)
 `--save-text-lockfile`, `--omit dev|peer|optional` (repeatable), `--only-missing`, `--force`, `--no-verify`
 `--ignore-scripts`, `--trust`, `--concurrent-scripts N` (default 2x CPU), `--network-concurrency N` (default 48)
 `--backend hardlink|clonefile|clonefile_each_dir|copyfile|symlink`, `--linker isolated|hoisted`, `--cpu`, `--os`
 `--filter/-F`, `-g/--global`, `--registry`, `--ca`, `--cafile`, `--cache-dir`, `--no-cache`, `--config/-c`, `--cwd`
 `--verbose`, `--silent`, `--no-progress`, `--no-summary`, `--analyze`, `--minimum-release-age <sec>`
 `--prefer-offline` (cached metadata regardless of age; fetch only missing), `--offline` (never network; uncached = error).
- `bun ci` == `bun install --frozen-lockfile` (requires committed bun.lock). CI does NOT auto-enable frozen.
- Validate lock w/o install: `bun install --frozen-lockfile --dry-run`. Fully offline CI: `--offline --frozen-lockfile` with restored cache.
- `--production`/`--omit` installs don't cache the omitted groups (cache warming must place the same packages, same platform).
- Pruned monorepo (turbo prune/Docker): frozen install skips workspaces missing package.json with `note:`; fails if a kept ws depends on a skipped one.
- `--cpu` values: arm arm64 ia32 mips mipsel ppc ppc64 s390 s390x x32 x64. `--os`: aix darwin freebsd linux openbsd sunos win32 android.
 Lockfile stores normalized cpu/os -> lock identical across platforms; disabled pkgs skipped at runtime.
- Up-to-date check: reads only `"name"`/`"version"` of node_modules/*/package.json (early-exit parser). Lock present+unchanged -> lazy downloads.
- Feature flags to disable postinstall optimizations (esbuild, sharp...): `BUN_FEATURE_FLAG_DISABLE_NATIVE_DEPENDENCY_LINKER=1`, `BUN_FEATURE_FLAG_DISABLE_IGNORE_SCRIPTS=1`.
- Registry metadata cache: binary `~/.bun/install/cache/${hash(name)}.npm`; Cache-Control ignores `Age` -> may lag npm ~5 min.

## Backends (global-cache)
- Default: `hardlink` Linux+Windows, `clonefile` macOS (CoW). `clonefile_each_dir` macOS only, slower. `copyfile` fallback (fcopyfile / copy_file_range).
- `symlink`: hoisted only; default only for `file:` deps outside project + transitive `file:`; `--backend=symlink` ignored on Windows; Node needs `--preserve-symlinks` (Bun runtime supports it too). `link:` = one symlink to dir.

## Linkers: hoisted vs isolated
- Default from lockfile `configVersion`: v1 + workspaces -> `isolated`; v1 no workspaces -> `hoisted`; v0 -> `hoisted`.
- New projects get configVersion 1; pre-v1.3.2 lockfiles w/o version get 0. Migration: from pnpm -> 1; from npm/yarn -> 0.
 workspace pkgs symlinked to source. Hidden fallback `node_modules/.bun/node_modules` (all pkgs) -> `install.hoist = false` (or `.npmrc hoist=false`) removes it for strictness; root node_modules still reachable.
- Store dir resolution suffix capped at 80 bytes (63 + `+` + 16 hex). Windows: >260-char path breaks lifecycle script cwd.
- Stale store entries stay until `bun prune`. Debug: `--linker isolated --verbose`.
- `.npmrc`: `install-strategy=hoisted|linked`, `node-linker=isolated|hoisted|pnpm|node-modules`.
- Global virtual store (off by default, isolated only): `[install] globalStore = true` or `BUN_INSTALL_GLOBAL_STORE=1`; entries in `<cache>/links/<storepath>-<16hex hash of dep closure>`;
 ~7x faster warm installs. Stays project-local if: patched, in trustedDependencies, or (transitively) depends on workspac<file>:/link:. Breaks true phantom deps; hoistPattern/publicHoistPattern unreachable from store pkgs. `bun pm cache rm` clears it. Concurrency-safe (tmp dir + rename).

## [install] bunfig keys (defaults from docs)
```toml
[install]
optional = true; dev = true; peer = true; production = false
saveTextLockfile = true; frozenLockfile = false; dryRun = false
concurrentScripts = 16 # 2x cpu
linker = "hoisted" # real default depends on configVersion
minimumReleaseAge = 259200 # seconds (example); minimumReleaseAgeExcludes = ["@types/node"]
registry = "http<registry.npmjs.org>" # or { url, token } or "http<user>:pass@host"
globalStore = false; hoist = true # isolated fallback dir created by default
# other keys (no default stated here): exact, ignoreScripts, linkWorkspacePackages, hoistPattern, publicHoistPattern
# prefer = "offline" (= --prefer-offline), offline = true (= --offline)
globalDir = "~/.bun/install/global"; globalBinDir = "~/.bun/bin"
[install.cache] # dir = "~/.bun/install/cache"; disable = false; disableManifest = false
[install.lockfile] # print = "yarn"
[install.security] # scanner = "<npm pkg>"
```
- bunfig lookup for install/add/remove: `$XDG_CONFIG_HOME/.bunfig.toml` or `$HOME/.bunfig.toml`, then `./bunfig.toml` (project overrides global).
- bunfig values may use `$VAR`; `bun install` auto-loads `.env.production.local`, `.env.local`, `.env.production`, `.env` regardless of NODE_ENV.

## Env vars (override bunfig)
- `BUN_CONFIG_REGISTRY` / `NPM_CONFIG_REGISTRY` (registry; NPM form accepts `url:username=U:_password=P`), `BUN_CONFIG_TOKEN` / `NPM_CONFIG_TOKEN` (also used by `bun publish`).
- `BUN_CONFIG_YARN_LOCKFILE`, `BUN_CONFIG_SKIP_SAVE_LOCKFILE`, `BUN_CONFIG_SKIP_LOAD_LOCKFILE`, `BUN_CONFIG_SKIP_INSTALL_PACKAGES`.
- `BUN_INSTALL_CACHE_DIR` (cache, default `~/.bun/install/cache`, entries `${name}@${version}`; pre/build suffix hashed), `BUN_INSTALL_GLOBAL_STORE=0|1`.

## .npmrc
- Precedence (later wins): `~/.npmrc` (or `$XDG_CONFIG_HOME/.npmrc`) < `./.npmrc` < bunfig (global, project) < env vars < CLI flags.
- Keys: `registry`, `@scope:registry`, `//host/:_authToken|username|_password(base64)|_auth(base64 user:pass)|email`, `link-workspace-packages`
 `save-exact`, `ignore-scripts`, `dry-run`, `cache` (path|false), `ca`/`ca[]`/`cafile`, `omit`/`omit[]`/`include` (dev|peer|optional)
 `install-strategy`, `node-linker`, `public-hoist-pattern[]`, `hoist-pattern`, `hoist`. `${NAME}` kept as-is if unset; `${NAME?}` -> "".
- Credentials matched by host+path even if registry set in bunfig.

## Lockfile
- `bun.lock` = text JSONC (default since 1.2; introduced 1.1.39). Commit it. Old binary `bun.lockb`: migrate with
 `bun install --save-text-lockfile --frozen-lockfile --lockfile-only` then delete .lockb. `bun bun.lockb` prints yarn-format; git textconv `diff.lockb.textconv bun`.
- Always rewritten unless `--frozen-lockfile`/`--production`. `--lockfile-only` (install/add/remove/update/dedupe) still fills cache.
- Auto-migration when no bun.lock: yarn.lock v1, package-lock.json v2/3/4 (not v1 -> warn), pnpm-lock.yaml v7-9 (pnpm-workspace.yaml packages+catalogs -> package.json `workspaces`; pnpm.overrides/patchedDependencies -> root). Originals kept. `bun pm migrate` = migrate without install.
- Nested/version-scoped overrides -> written as `lockfileVersion` 3 (older Bun can't read). Catalog defs stored in lock.

## Trust & lifecycle scripts
- Default-secure: dependency scripts run only for allow-list. Omitted `trustedDependencies` -> built-in default list (npm sources only; fil<link>:/gi<github>: must be listed explicitly).
- `trustedDependencies: [..]` REPLACES default list (re-add e.g. sharp, esbuild). `[]` = trust nothing. Trust is not transitive.
- `--ignore-scripts` / `install.ignoreScripts` / `.npmrc ignore-scripts=true` disables all. Scripts run in parallel (`--concurrent-scripts`).
- `bun pm untrusted` (blocked scripts), `bun pm trust <names>|--all` (runs now + adds to list), `bun pm default-trusted`, `bun pm ls --trusted`, `bun add --trust`.
- Symptoms of missing postinstall: `could not determine executable to run for package`, `ENOEXEC`.

## bun add
- Default group dependencies, `^` range; existing entry in other group updated in place. `-d/-D/--dev`, `--optional`, `--peer`, `-E/--exact`, `-g/--global` (no package.json change; bins in `~/.bun/bin`).
- `--catalog` / `--catalog=<name>` (must use `=`): writes root catalog entry + `"catalog:"`; reuses existing entry unless version given (then replaces for all). `bun add react` w/o version writes `catalog:` if default catalog lists it. Rejects relative paths/workspace pkgs.
- `--filter`: add to matching workspaces; `*` excludes root; no match = error; not with `--global`; links only selected ws.
- `--minimum-release-age <sec>`: filters new resolutions (direct+transitive) only; stability check extends up to 7 days; exact version bypasses stability check; no `time` field = pass.

## Other commands
- `bun remove` (`rm`, `uninstall`, `r`): removes from all groups; `--filter` ('*' = every ws).
- `bun update` (`up`): newest within ranges for direct+transitive; preserves `^`/`~`; exact pins, dist-tags, `*`, `1.x`, `>=` untouched (lock only) unless `--latest/-L`; never rewrites `catalog:` (updates catalog entry).
 Names/globs/`!excl`; `bun update caniuse-lite` fixes transitive w/o adding to package.json; unknown name = error. `-i/--interactive` (space, enter, a, n, i, l=latest, j/k).
 `-r/--recursive` all ws package.json; `--filter`; `--dev/-D`, `--prod/-P`, `--no-optional` (selection only); `-g`; `--no-save`; `--dry-run`. Patched deps kept (moved by --latest / audit fix).
- `bun outdated [pkg|glob|!glob]`: Current/Update/Latest; `--filter`, `-r` (incl. catalogs, Workspace column).
- `bun audit`: reads bun.lock only; `--audit-level=low|moderate|high|critical`, `--prod/-p/-P`, `--omit=dev|optional|peer`, `--ignore <GHSA|id>` (not CVE), `--json` (raw, unfiltered).
 `bun audit fix [--latest] [--dry-run] [--json]`: lowest safe version within ranges; exact direct pins treated as `^`; rejects `--prod/--frozen-lockfile/--no-save`; re-audits after. Exit 0 none remaining / 1 otherwise; request fail -> 1.
- `bun dedupe [--check (exit 1 if dupes) | --dry-run | --lockfile-only]`: only among already-locked versions; never edits package.json; needs lock in sync; not with frozen/production/no-save; keeps patched.
- `bun prune [--production|--omit=..] [--dry-run] [--filter] [--linker] [--os/--cpu]`: deletes node_modules entries not in bun.lock (incl. stale `.bun` entries); no registry, no scripts, no lock edits; always from ws root; no `--global`.
- `bun why <pkg|glob> [--top] [--depth N]`. `bun info <pkg>[@v] [prop.path] [--json]` (alias `bun pm view`).
- `bun link` (register cwd) / `bun link <name> [--save]` -> `"link:<name>"`; `bun unlink`.
- `bun publish [tarball]`: strips `catalog:`/`workspace:`; `--access public|restricted`, `--tag` (default latest; first version also latest), `--dry-run`, `--tolerate-republish`, `--gzip-level 0-9` (9), `--auth-type web|legacy`, `--otp`. No lifecycle scripts when given a tarball. `publishConfig.access/tag` honored.
- workspace: on publish: `workspace:*`->`1.0.1`, `^`->`^1.0.1`, `~`->`~1.0.1`, `workspace:1.0.2`->`1.0.2`.

## bun pm
- `pack [--dry-run --destination dir | --filename f --ignore-scripts --gzip-level --quiet]` (destination XOR filename). `bin [-g]`. `ls [--all|--trusted]` (= `bun list`).
- `licenses [--json --long --prod -D --omit --filter]` (needs lock + node_modules). `diff a b [:paths] [--raw --minify --unminify -w --stat --name-only -U n --json]` (`bun pm diff pkg` = locked -> latest; plain patch when piped/NO_COLOR).
- `whoami`, `hash`, `hash-string`, `hash-print`, `cache` (path), `cache rm`, `migrate`, `untrusted`, `trust`, `default-trusted`.
- `version patch|minor|major|pre*|prerelease|from-git|1.2.3 [--no-git-tag-version --allow-same-version -m "%s" --preid beta -f]` (commits+tags by default).
- `pkg get|set|delete|fix` (dot/bracket paths; `set k=v --json`).

## bun patch
1. `bun patch <pkg|pkg@ver|node_modules/pkg>` (makes unlinked fresh copy; skipping this may edit global cache).
2. Edit in node_modules. 3. `bun patch --commit <pkg|path> [--patches-dir=dir]` (alias `bun patch-commit`) -> `patches/*.patch` + `patchedDependencies` in package.json + lock.

## Catalogs
- Root package.json `workspaces.catalog` (default) / `workspaces.catalogs.<name>` (also allowed top-level). Use `"catalog:"` / `"catalog:<name>"` in deps/devDeps/optionalDeps/peerDeps and root overrides.
- `catalog:default` == `catalog:`; package in both `catalog` and `catalogs.default` = error. Only valid in root/ws package.json; `bun publish`/`bun pm pack` replace with real ranges.

## Overrides / resolutions
- Root package.json only (ignored in workspaces); apply to peers too. Values: any specifier (`npm:@org/fork@^1`, `catalog:`, `"$foo"` = reuse own declared range).
- Nested (1 level only): `{"micromatch": {".": "^4", "picomatch": "^2.3.2"}}`, `"a>b"`, `"a@^4>b"`; resolutions `"a/b"`, `"**/a/**/b"`. Specificity: parent@ver > parent > top-level.
- Version-scoped keys `"semver@<7.5.2": "7.5.2"` compare with DECLARED range; dist-tag/catalog/workspace/git/URL dependents never match. Unsupported: `a>b>c`, pnpm `"pkg@"`, `"-"` (warned).

## Workspaces
- `"workspaces": ["packages/*", "!**/test/**"]` full glob incl. negation; refer with `workspace:*` or semver. Guide: root should be `private`, no deps.
- `installConfig.hoistingLimits = "workspaces"` in ws package.json or root `workspaces.selfContained: [path|name]` -> hoisting barrier + real copies (hoisted linker only; not in lock).

## --filter syntax (`-F`)
- Works with: `bun run`, install, add, remove, update, outdated, prune, `pm licenses`. For PM commands put it AFTER subcommand (`bun --filter x word` runs script).
- `name-glob` (full name; `*` doesn't cross `/`; use `@acme/*`), `./path-glob` (must match ws dir: `./packages/*`), `'{dir}'` (subtree; `{.}`), `foo...` (+deps), `foo^...` (deps only), `...foo` (+dependents), `...^foo`, `!` prefix excludes (`'!...foo'`).
- Multiple flags: union of positives minus negatives. No-match: warning (install/outdated), error (add/remove/update/prune/licenses).
- Scripts: `bun --filter '*' dev` (parallel, TUI, dependency order respected); `bun run --parallel|--sequential --filter|--workspaces script ["build:*"] [--no-exit-on-error] [--if-present]`; output prefix `pkg:script |`. Only `./path` selects nameless package.

## Security scanner
- `[install.security] scanner = "<npm pkg>"` (install it with `bun add -d`); runs on install/add/update/audit fix; auto-install disabled when configured.
- Levels: `fatal` -> stop, non-zero exit; `warn` -> prompt on TTY, exit in CI. Detects CVEs, malware, license issues. Auth via scanner-specific env vars.
- Scanner interface itself is NOT specified in these docs: see template github.com/oven-sh/security-scanner-template.

## bunx (`bun x`)
- `bunx [--bun] [-p/--package pkg] [--no-install] [--verbose|--silent] <bin>[@ver] args...`. Local first, else install into global cache.
- Respects `#!/usr/bin/env node` shebang (runs node) unless `--bun`, which must come BEFORE the bin name.

## bun create / bun init
- `bun create ./Comp.tsx`: bundler scan -> package.json, `bun install --only-missing`, `.html/.client.tsx/.css`, dev server; Tailwind (`bun-plugin-tailwind`, `[serve.static] plugins`) and shadcn auto-detect.
- `bun create <tpl> [dest]` = `bunx create-<tpl>` (react/next only print a hint; elysia/elysia-buchta/stric from @bun-examples). `bun create <user>/<repo>|github.com/u/r [dir]`: download, install, git init.
- Local templates `$HOME/.bun-create/<name>` or `<root>/.bun-create/<name>`: DELETE destination first. `"bun-create": {preinstall, postinstall (string|array), start}` removed after copy.
- Flags: `--force` (overwrite; default never overwrites), `--no-install`, `--no-git`, `--open`.
- `bun init [dir] [-y|--yes] [-m|--minimal] [--react[=tailwind|shadcn]]`: templates Blank/React/Library; creates package.json (`typecheck` script -> `bun check`), tsconfig/jsconfig, index.ts, README.gitignore, CLAUDE.md / .cursor rule if detected; installs `@aphrody/bun-types` + `typescript`. Non-destructive re-run.

## Gotchas
- `--production` implies frozen; `bun prune --production` to drop leftover devDeps.
- Defining trustedDependencies drops the default allow list.
- `bun audit` options are CLI-only (no bunfig); JSON output ignores `--audit-level`.
- `bun pm cache rm` or `rm -rf ~/.bun/install/cache` to clear cache.
