---
name: bun-install-cli-map
description: "Map of bun package-manager CLI subcommands (install/add/remove/update/pm/publish/pack/audit/why/link/patch/info/bunx...) to source files, plus bunfig [install] keys.npmrc, flags"
metadata:
 type: reference
---

# PM CLI subcommand -> file map

Related: `bun-install-architecture` · `bun-install-linkers-workspaces` · `bun-install-lockfile`

## Dispatch
`src/runtime/cli/mod.rs`: `RootCommandMatcher` -> `Tag::*Command` (around lines 975-1100), exec table (`exec_pm`, `exec_install`... ~line 1642) and special cases (`bun_info`, `exec_audit`, `exec_prune`).
Each command file lives in `src/runtime/cli/` and calls `PackageManager::init(ctx, cli, Subcommand::X)` then `update_package_json_and_install_and_cli` or `install_with_manager`.

| CLI | aliases | Tag | File |
|---|---|---|---|
| `bun install` | `i`; `-g/--global` re-routes to AddCommand | InstallCommand | `install_command.rs` |
| `bun ci` | = install + `frozen_lockfile` (CommandLineArguments.rs: positional[0]=="ci") | InstallCommand | `install_command.rs` |
| `bun add` | `a` | AddCommand | `add_command.rs` |
| `bun remove` | `rm`, `r`, `uninstall` | RemoveCommand | `remove_command.rs` |
| `bun update` | `up`; `-i/--interactive` | UpdateCommand | `update_command.rs`, `update_interactive_command.rs` |
| `bun outdated` | | OutdatedCommand | `outdated_command.rs` |
| `bun link` / `bun unlink` | | Link/UnlinkCommand | `link_command.rs`, `unlink_command.rs` |
| `bun patch` / `bun patch-commit` | | Patch/PatchCommitCommand | `patch_command.rs`, `patch_commit_command.rs` |
| `bun publish` | | PublishCommand | `publish_command.rs` |
| `bun audit` | | AuditCommand | `audit_command.rs` (POSTs `{registry}/-/npm/v1/security/advisories/bulk`; fix via `src/install/audit_fix.rs`) |
| `bun why` | (`bun pm why`) | WhyCommand | `why_command.rs`, `pm_why_command.rs` |
| `bun info` | | InfoCommand -> `bun_info` in mod.rs | uses `pm_view_command.rs` |
| `bun dedupe` | | DedupeCommand | `dedupe_command.rs` + `src/install/dedupe.rs` |
| `bun prune` | | PruneCommand | `prune_command.rs` + `src/install/prune.rs` |
| `bun x` / `bunx` | | BunxCommand | `bunx_command.rs` |
| `bun pm ...` | `whoami`, `list` at root also -> PackageManagerCommand | PackageManagerCommand | `package_manager_command.rs` |
| `bun upgrade` | (self-upgrade, not PM) | UpgradeCommand | `upgrade_command.rs` |

Reserved (no-op): `deploy`, `cloud`, `config`, `use`, `auth`, `login`, `logout`.

## `bun pm` subcommands (package_manager_command.rs)
`scan` (security scanner), `pack` (`pack_command.rs`), `whoami` (`npm::whoami`), `view` (`pm_view_command.rs`), `bin [-g]`, `hash`, `hash-print`, `hash-string`, `cache` / `cache rm`
`default-trusted`, `untrusted`, `trust` (`pm_trusted_command.rs`), `ls` / `list` (`--all`), `migrate` (bun.lockb/other lockfiles -> bun.lock), `version` (`pm_version_command.rs`: `--git-tag-version`, `--allow-same-version`, `--preid`, `--message`)
`why` (`pm_why_command.rs`: `--top`, `--depth`), `diff` (`pm_diff_command.rs` + `pm_diff_{normalize,profile,relayout,semantic}.rs`), `licenses` (`pm_licenses_command.rs`), `pkg` (`pm_pkg_command.rs`: get/set/delete package.json fields). Only `licenses` accepts `--filter` among pm subcommands.

## bunx (`src/runtime/cli/bunx_command.rs`)
Flags `--bun`/`-b`, `--package`/`-p <pkg>` (`--package=`, `-p=`). Temp install dir `<tmp>/bunx-<uid>-<pkg>/node_modules/.bin` prepended to PATH; trust checks `is_trusted_cached_binary` / `is_trusted_cache_root` (uid ownership, POSIX). Env `npm_lifecycle_event=bunx`, `BUN_INTERNAL_BUNX_INSTALL=true`. Test: `test/cli/install/bunx.test.ts`.

## Flags (PackageManager/CommandLineArguments.rs)
`--access --allow-same-version --analyze --audit-level --auth-type --backend --ca --cache-dir --cafile --catalog --check --commit --concurrent-scripts --config --cpu --cwd --depth --destination --dev --development --diff --dry-run --exact --filename --filter --force --frozen-lockfile --git-tag-version --global --gzip-level --ignore-scripts --interactive --json --latest --linker --lockfile-only --minimum-release-age --network-concurrency --no-cache --no-optional --no-progress --no-save --no-summary --no-verify --offline --omit --only-missing --optional --os --otp --patches-dir --peer --prefer-offline --preid --prod/--production --quiet --recursive --registry --save --save-text-lockfile --silent --tag --tolerate-republish --top --trust --verbose --yarn` (+ `-g -D -E -d -p -r` shorts).

## bunfig.toml `[install]` (src/bunfig/bunfig.rs)
Keys seen: `registry` (string or `{url, token, username, password}`), `scopes`, `cache` (bool | string | `{dir, disable, disableManifest}`), `lockfile` (`{save, print, path, savePath}`), `saveTextLockfile`, `frozenLockfile`, `dryRun`, `production`, `optional`/`dev`/`peer`, `exact`, `globalDir`, `globalBinDir`, `globalStore`, `linker`, `hoist`, `hoistPattern`, `publicHoistPattern`, `linkWorkspacePackages`, `concurrentScripts`, `ignoreScripts`, `logLevel`, `ca`, `cafile`, `auto` (runtime auto-install: true/false/`"force"`/`"fallback"`/`"disable"`), `prefer` (`"online"`/`"offline"`), `offline` (bool), `security.scanner`, `minimumReleaseAge` (seconds, positive), `minimumReleaseAgeExcludes`.
Env equivalents: `BUN_CONFIG_REGISTRY`, `NPM_CONFIG_REGISTRY`, `BUN_INSTALL_CACHE_DIR`, `BUN_INSTALL_GLOBAL_STORE` etc. Precedence test: `test/cli/install/config-precedence.test.ts`.

## .npmrc (src/ini/lib.rs)
`ini::load_npmrc_config` reads project + user `.npmrc`; keys recognised include `registry`, `@scope:registry`, `//host/:_authToken`, `_auth`, `username`/`_password`, `email`, `ca`, `cafile`, `certfile`, `keyfile`, `cache`, `dry-run`, `ignore-scripts`, `save-exact`, `omit`/`include`, `link-workspace-packages`, `node-linker` (`hoisted`/`isolated`), `install-strategy` (`nested`/`shallow`/`linked`), `hoist`, `hoist-pattern`, `public-hoist-pattern`; env `${VAR}` expansion; `RegistryAuth` + `apply_registry_auth` merge into `BunInstall`. JS exposure via `src/install_jsc/ini_jsc.rs`. Tests: `test/cli/install/npmrc.test.ts`, `test/js/bun/ini/`, `redacted-config-logs.test.ts`.

## Semver
`bun_semver` (src/semver) used for ranges; JS `Bun.semver` tests `test/cli/install/semver.test.ts`. Dist tags in `npm.rs` `find_by_dist_tag`.
