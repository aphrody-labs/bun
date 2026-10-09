---
name: bun-install-architecture
description: "Bun package manager core architecture — crates, PackageManager singleton, install pipeline, tasks/threads, registry/manifest cache, global cache dirs"
metadata:
 type: reference
---

# bun install — architecture (Rust, verified 2026-10-08)

Related: `bun-install-lockfile` · `bun-install-linkers-workspaces` · `bun-install-cli-map` · `bun-tests-patterns`

## Crates
- `src/install/` = crate `bun_install` (~46k lines). `lib.rs` declares modules; PascalCase files mounted via `#[path]`.
 Aliases in lib.rs: `package_manager` -> `package_manager_real` (PackageManager.rs), `lockfile` -> `lockfile_real` (lockfile.rs)
 `bin` -> `bin_real`, `repository` -> `repository_real`. `bun_json` = `bun_parsers::json` + `bun_ast`.
- `src/install_types/` = `bun_install_types`: `NodeLinker.rs` (enum `NodeLinker { Auto(default), Hoisted, Isolated }`, `PnpmMatcher`)
 `resolver_hooks.rs` (lower-tier types shared with resolver: `Behavior` bitflags PROD/OPTIONAL/DEV/PEER/WORKSPACE/BUNDLED
 `DependencyVersionTag { Uninitialized, Npm, DistTag, Tarball, Folder, Symlink, Workspace, Git, Github, Catalog }`
 `ResolutionTag { Root=1, Npm=2, Folder=4, LocalTarball=8, Github=16, Git=32, Symlink=64, Workspace=72, RemoteTarball=80, SingleFileModule=100 }`, `Features`, `PreinstallState`).
- `src/install_jsc/` = JSC bridge, keeps JSValue out of install: `hosted_git_info_jsc.rs`, `ini_jsc.rs`, `install_binding.rs`, `npm_jsc.rs`.
- `src/semver/` (`bun_semver`): `Version.rs` (`VersionType<T>`, `parse`, `PinnedVersion`), `SemverQuery.rs` (`Query`, `List`, `Group`, `parse(input, SlicedString)`, `satisfies`, `satisfies_including_prerelease`), `SemverRange.rs`, `intersects.rs`; `lib.rs` has `semver_string::String` (inline-or-offset string into lockfile string buffer), `ExternalString`, `SlicedString`.
- `src/ini/lib.rs` (`bun_ini`, `#![forbid(unsafe_code)]`): .npmrc parser `Parser`, `ConfigItem`, `RegistryAuth`, `load_npmrc_config`, `load_npmrc`, `apply_registry_auth`.
- `src/bunfig/` (`bun_bunfig`): `bunfig.rs` parses bunfig.toml `[install]`, `[test]`, `[run]`...; `arguments.rs` (`load_config`).
- `src/patch/lib.rs` (`bun_patch`): `PatchFile::apply(patch_dir)`, `parse_patch_file`, `git_diff_internal`, `spawn_opts`.
- Windows bin shims: `src/install/windows-shim/` (`BinLinkingShim.rs` encodes `.bunx` files, `bun_shim_impl.rs` freestanding PE; own Cargo.toml).

## PackageManager (src/install/PackageManager.rs)
- Leaked process singleton (`PackageManager::get`), `init(ctx, cli, Subcommand)` -> `(&mut PackageManager, cwd)`.
- Sub-modules in `src/install/PackageManager/`: `CommandLineArguments.rs` (flag parsing, `AuditLevel`), `PackageManagerOptions.rs` (`Options`, `Enable`/`Do` bitflags, `LogLevel`, `OfflineMode`, global dirs)
 `PackageManagerDirectories.rs` (cache/temp dirs, cache folder names), `PackageManagerEnqueue.rs` (enqueue deps/tarballs/git, `get_or_put_resolved_package`), `PackageManagerResolution.rs`
 `runTasks.rs` (`run_tasks`, network/patch/dependency queues, `generate_network_task_for_tarball`), `install_with_manager.rs` (main install driver)
 `updatePackageJSONAndInstall.rs` (add/remove/update entry: `update_package_json_and_install_and_cli`), `PackageJSONEditor.rs`, `package_json_write_back.rs`
 `UpdateRequest.rs`, `PopulateManifestCache.rs`, `processDependencyList.rs`, `PackageManagerLifecycle.rs`, `patchPackage.rs`, `security_scanner.rs` + `scanner-entry.ts`
 `add_catalog.rs`, `add_remove_with_filter.rs`, `workspace_selection.rs`, `workspace_manifests.rs`, `WorkspacePackageJSONCache.rs`, `ProgressStrings.rs`.
- `enum Subcommand { Install, Update, Pm, Add, Remove, Link, Unlink, Patch, PatchCommit, Outdated, Pack, Publish, Audit, Info, Why, Dedupe, Prune }`;
 `supports_workspace_filtering` = Outdated/Install/Update/Add/Remove/Prune/Pm; `should_chdir_to_root` = all but Link; JSON output = Audit/Pm/Info.
- Key fields: `lockfile: Box<Lockfile>`, `options: Options`, `manifests: PackageManifestMap`, `thread_pool`, `network_task_fifo`, `pending_tasks: AtomicU32`
 `update_requests`, `event_loop: AnyEventLoop`, `workspace_package_json_cache`, `preinstall_state`, `active_lifecycle_scripts`, `root_package_id: RootPackageId`.

## Install pipeline (`install_with_manager`, PackageManager/install_with_manager.rs)
1. DNS prefetch of default registry (unless proxy/offline).
2. `lockfile.load_from_cwd::<true>` -> `LoadResult` (NotFound / Err / Ok{format, migrated...}); migration from package-lock.json / yarn.lock / pnpm-lock.yaml (`migration.rs`, `migration/npm_lock.rs`, `yarn.rs`, `pnpm.rs`).
3. `mark_loaded_packages`; `choose_config_version` sets `options.config_version`; force-save if migrated / config version changed / binary + `saveTextLockfile`.
4. Diff root package.json vs lockfile (`Package::DiffSummary`), enqueue changed deps (`enqueue_dependency_with_main`), `run_tasks` loop until `pending_tasks==0`; peers resolved after (`wait_for_peers`).
5. Security scanner (`run_security_scanner`) if `install.security.scanner` configured.
6. `--frozen-lockfile` (also `bun ci`): compares lockfile (text: `Lockfile::eql`; binary: meta-hash) -> "lockfile had changes, but lockfile is frozen" + crash.
7. `--lockfile-only` -> `save_lockfile_only`.
8. Linker choice: `NodeLinker::Auto` -> ConfigVersion V0 => Hoisted; V1 => Isolated if workspaces exist and not migrated from npm, else Hoisted.
 Hoisted -> `hoisted_install::install_hoisted_packages`; Isolated -> `isolated_install::install_isolated_packages`.
9. Save lockfile (`save_to_disk`), root lifecycle scripts (`run_root_lifecycle_scripts`), summary print.
- `ConfigVersion { V0, V1 }` (`src/install/ConfigVersion.rs`, CURRENT = V1) stored as `configVersion` in bun.lock.

## Tasks / network
- `PackageManagerTask.rs` `Task` tags: `PackageManifest, Extract, GitClone, GitCheckout, LocalTarball, GitCommit`; run on `thread_pool`, results via queues, processed on main thread in `run_tasks`.
- `NetworkTask.rs`: manifest + tarball HTTP. Accept header `application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*` (abbreviated/"corgi"); extended (`application/json`) when minimum-release-age needs publish times.
- `TarballStream.rs` streaming extract; `extract_tarball.rs` (`ExtractTarball`, integrity verify via `integrity.rs`); `git_runner.rs` git subprocesses; `repository.rs`, `hosted_git_info.rs`.
- `npm.rs`: `registry::Scope`, `PackageManifest`, `find_best_version(_with_filter)`, `find_by_dist_tag`, `whoami`. Disk manifest cache file `<cache>/<16hex>.npm` (or `<hash>-<scopehash>.npm` for non-default registry), header `#!/usr/bin/env bun\nbun-npm-manifest-cache-v0.0.7\n` (49 bytes).
- `auto_installer.rs` = runtime auto-install (`init_with_runtime`, `runtime_auto_install`).

## Directories
- Cache (`fetch_cache_directory_path`): `$BUN_INSTALL_CACHE_DIR` > bunfig `install.cache.dir` > `$BUN_INSTALL/install/cache/` > `$XDG_CACHE_HOME/.bun/install/cache/` > `$HOME/.bun/install/cache/` > `node_modules/.bun-cache`.
- Global dir: `$BUN_INSTALL_GLOBAL_DIR` > `$BUN_INSTALL/install/global` > `$XDG_CACHE_HOME/.bun/install/global` > `~/.bun/install/global`; bin dir `$BUN_INSTALL_BIN` > `$BUN_INSTALL/bin`.
- Global virtual store (isolated only): `Enable::GLOBAL_VIRTUAL_STORE` via `BUN_INSTALL_GLOBAL_STORE=1` or `install.globalStore = true` -> entries in `<cache>/links/`.
- Env knobs: `BUN_INSTALL_PROGRESS`, `BUN_TMPDIR`, `BUN_DISABLE_SLOW_FILESYSTEM_WARNING`.
- `Options` default `Enable = MANIFEST_CACHE | MANIFEST_CACHE_CONTROL | CACHE`; other flags FORCE_SAVE_LOCKFILE, FORCE_INSTALL, EXACT_VERSIONS, ONLY_MISSING, GLOBAL_VIRTUAL_STORE.
- `Options` notable: `node_linker`, `public_hoist_pattern`, `hoist_pattern`, `hoist`, `offline: OfflineMode`, `security_scanner`, `minimum_release_age_ms`, `minimum_release_age_excludes`, `cpu`/`os` overrides, `save_text_lockfile: Option<bool>`, `max_concurrent_lifecycle_scripts`, `publish_config`.

## Other install modules
`bin.rs` (bin linking, `Bin`), `dependency.rs` (`Dependency`, `Version` parsing, `workspace:` protocol), `resolution.rs`, `PackageInstall.rs` (`Method { Clonefile, ClonefileEachDir, Hardlink, Copyfile, Symlink }`)
`PackageInstaller.rs` (hoisted per-package install + trust check), `dedupe.rs`, `prune.rs`, `update_scope.rs`, `update_transitive.rs`, `audit_fix.rs` + `audit_fix/`
`postinstall_optimizer.rs`, `padding_checker.rs`, `PackageManifestMap.rs`, `resolvers/folder_resolver.rs`.
