---
name: bun-install-linkers-workspaces
description: "Bun install node_modules linkers (hoisted vs isolated), workspaces, catalogs, overrides, patches, lifecycle scripts/trust, security scanner, minimum release age"
metadata:
 type: reference
---

# Linkers, workspaces, catalogs, overrides, patch, scripts, scanner

Related: `bun-install-architecture` · `bun-install-lockfile` · `bun-install-cli-map`

## Linker selection
- `bun_install_types::NodeLinker::{Auto, Hoisted, Isolated}`; set by `--linker`, bunfig `install.linker`. Auto resolution in `install_with_manager.rs`:
 configVersion 0 -> hoisted; configVersion 1 -> isolated when the project has workspaces (and lockfile not migrated from npm), else hoisted.
- test/bunfig.toml sets `[install] linker = "isolated"`, `globalStore = false` for the repo test tree.

## Hoisted (`src/install/hoisted_install.rs`, `PackageInstaller.rs`, `lockfile/Tree.rs`, `PackageInstall.rs`)
- Lockfile builds a hoisted tree (`Tree`, depth 0 = `./node_modules`), iterated by `Tree::Iterator`; packages copied from cache with `PackageInstall::Method { Clonefile, ClonefileEachDir, Hardlink, Copyfile, Symlink (file:../) }`; per-OS `BackendSupport` tables (`macos` / `linux` / `windows` in PackageInstall.rs; clonefile is macOS-only); `--backend` flag chooses. Fallback test: `bun-install-hardlink-fallback.test.ts`.
- After hoisted install with Dedupe/Audit/Update: `prune::remove_collapsed_copies`.

## Isolated (pnpm-like) (`src/install/isolated_install.rs` + `isolated_install/{Store.rs, Installer.rs, FileCloner.rs, FileCopier.rs, Hardlinker.rs, Symlinker.rs}`)
- `node_modules/.bun/node_modules` = hidden hoist fallback (pnpm `hoist`); `install.hoist = false` removes it. `hoistPattern` / `publicHoistPattern` (`PnpmMatcher`) control what goes to `.bun/node_modules` vs root `node_modules`.
- Global virtual store: `install.globalStore` / `BUN_INSTALL_GLOBAL_STORE=1` -> shared `<cache>/links/` entries, `node_modules/.bun/<pkg>` symlinks into it.
- Tests: `test/cli/install/isolated-install.test.ts`, `isolated-relink.test.ts`, `public-hoist-pattern.test.ts`, `hoist.test.ts`.

## Workspaces
- package.json `workspaces` (array or `{packages, catalog, catalogs}`) parsed in `lockfile/Package/WorkspaceMap.rs`; lockfile tracks `workspace_paths`, `workspace_versions`; `workspace:` protocol in `dependency.rs` (`workspace:*`, `workspace:^`...). `install.linkWorkspacePackages` controls linking matching-name deps.
- `--filter` (`workspace_selection.rs`, `PackageManager::WorkspaceFilter`, `add_remove_with_filter.rs`), `-r/--recursive` for update/outdated; `RootPackageId::get` -> workspace package id for cwd.
- Self-contained workspaces: `Lockfile.self_contained_workspaces` (test `bun-workspaces-self-contained.test.ts`). Pruned workspace handling `lockfile/pruned_workspaces.rs`.
- Tests: `bun-workspaces.test.ts`, `bad-workspace.test.ts`, `bun-add-filter.test.ts`, `frozen-lockfile-missing-workspace.test.ts`.

## Catalogs (`lockfile/CatalogMap.rs`, `PackageManager/add_catalog.rs`)
- Sources: root package.json `catalog` / `catalogs` (top-level or inside `workspaces` object). `catalog:` == `catalog:default`. Only root + workspaces may reference catalogs; elsewhere unresolvable (a `catalog:` peer becomes optional `*`).
- Stored in bun.lock `catalog` / `catalogs`. `bun add --catalog[=name]` writes catalog entries. Tests: `catalogs.test.ts`, `bun-add-catalog.test.ts`.

## Overrides (`lockfile/OverrideMap.rs`, `override_selector.rs`)
- package.json `overrides` (npm) or `resolutions` (yarn); nested/scoped rules (`parent > child`, `name@range` keys) => `ScopedOverride`, lockfile v3. Tests: `overrides.test.ts`, `nested-overrides.test.ts`.

## Patches (`src/patch/`, `PackageManager/patchPackage.rs`, `patch_install.rs`, CLI `patch_command.rs`, `patch_commit_command.rs`)
- `bun patch <pkg>` prepares `node_modules/<pkg>` for editing; `bun patch --commit <path>` (or `bun patch-commit`) diffs via git (`git_diff_internal`, requires git), writes `$PATCHES_DIR/<name>@<version>.patch` (`--patches-dir`, default `patches/`), updates package.json `patchedDependencies`.
- At install: `PatchTask` (`patch_install.rs`) computes patch hash (`patch_calc_hash_batch`) and applies (`PatchFile::apply`); cache folder suffix `_patch_hash=<hex>`. Tests: `bun-patch.test.ts`, `bun-install-patch.test.ts`, test/js/bun/patch/.

## Lifecycle scripts (`lifecycle_script_runner.rs`, `PackageManagerLifecycle.rs`, `lockfile/Package/Scripts.rs`)
- Order: preinstall, install, postinstall, preprepare, prepare, postprepare. Root/workspace scripts always run; dependency scripts only if trusted: package.json `trustedDependencies` or built-in list `src/install/default-trusted-dependencies.txt` (~367 names, `DEFAULT_TRUSTED_DEPENDENCIES_LIST`). Blocked ones reported in summary (`print_blocked_packages_info`); `bun pm untrusted` / `bun pm trust [--all]` / `bun pm default-trusted`. `bun add --trust` adds to trustedDependencies.
- Parallelism `--concurrent-scripts` / `install.concurrentScripts`; `--ignore-scripts`. `node-gyp` shim tempdir (`node_gyp_tempdir_name`). `postinstall_optimizer.rs` skips known-native postinstalls.
- Test: `bun-install-lifecycle-scripts.test.ts` (uses Verdaccio packages `all-lifecycle-scripts`...).

## Security scanner (`PackageManager/security_scanner.rs`, `scanner-entry.ts`)
- bunfig `install.security.scanner = "<module>"`; spawns bun running `scanner-entry.ts` (placeholders `__SCANNER_MODULE__`, `__SUPPRESS_ERROR__`), IPC: fd 4 input (JSON package list), fd 3 output (`{type:"result", advisories}` or error codes MODULE_NOT_FOUND / INVALID_VERSION / SCAN_FAILED). Advisory levels fatal (abort) / warn (prompt). `bun pm scan` runs it standalone.
- Tests: `bun-install-security-provider.test.ts`, `bun-security-scanner-*.test.ts`, `bun-update-security-*.test.ts`, `bun-pm-scan.test.ts`; tarballs `test-security-scanner-1.0.0-{clean,warn,fatal}.tgz`.

## Minimum release age
`install.minimumReleaseAge` (seconds) / `--minimum-release-age`, `minimumReleaseAgeExcludes`; needs full manifest (publish times; manifest cache v0.0.7). Test `minimum-release-age.test.ts`.

## Optional deps os/cpu/libc
`--os`, `--cpu` override filtering (`Npm::Architecture`, `Npm::OperatingSystem`); test `bun-install-cpu-os.test.ts`, `architecture-match.test.ts` with `dep-*.tgz` fixtures.
