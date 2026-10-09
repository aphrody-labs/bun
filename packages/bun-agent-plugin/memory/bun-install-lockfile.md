---
name: bun-install-lockfile
description: "Bun lockfile internals — Lockfile struct, text bun.lock (v0..v3) format/parser, binary bun.lockb, migration from npm/yarn/pnpm, load/save paths"
metadata:
 type: reference
---

# Lockfile (bun.lock / bun.lockb)

Related: `bun-install-architecture` · `bun-install-linkers-workspaces` · `bun-tests-harness` (`textLockfile` helper)

## Files (src/install/lockfile/ + src/install/lockfile.rs)
- `lockfile.rs` (~3.5k lines): `pub struct Lockfile`, `load_from_cwd::<ATTEMPT_OTHER>` / `load_from_dir`, `save_to_disk`, `LoadResult`, `LoadStep`, `LockfileFormat { Text, Binary }` (file names `bun.lock` / `bun.lockb`), `has_meta_hash_changed`, `eql`, `get_package_id`, `mark_loaded_packages`.
- `lockfile/bun.lock.rs` — text lockfile stringifier (`Stringifier`) + parser (`parse_into_binary_lockfile`-style; reads root keys).
- `lockfile/bun.lockb.rs` — binary serializer (`Serializer` alias), header `#!/usr/bin/env bun\nbun-lockfile-format-v0\n`; optional trailing sections tagged by 8-byte magic: `pAtChEdD`, `wOrKsPaC`, `tRuStEDd`, `eMpTrUsT`, `oVeRriDs`, `cAtAlOgS`, `cNfGvRsN`, `sCoPdOvR`.
- `lockfile/Buffers.rs` (column buffers: dependencies, resolutions, trees, hoisted_dependencies, string_bytes, extern_strings), `Package.rs` (+ `Package/Meta.rs`, `Scripts.rs`, `WorkspaceMap.rs`), `Tree.rs` (hoisted node_modules tree, `Iterator`, `relative_path_and_depth`)
 `CatalogMap.rs`, `OverrideMap.rs` + `override_selector.rs` (scoped overrides), `pruned_workspaces.rs`, `reachable.rs`, `printer/{Yarn.rs,tree_printer.rs}`, `lockfile_json_stringify_for_debugging.rs`.

## Lockfile struct fields
`format`, `text_lockfile_version: bun_lock::Version`, `meta_hash`, `packages: PackageList` (MultiArrayList-like `package::List<u64>`), `buffers: Buffers`, `package_index` (name hash -> id or ids)
`string_pool`, `scripts`, `workspace_paths`, `workspace_versions`, `self_contained_workspaces` (not saved), `trusted_dependencies: Option<Set>` (None vs empty matters)
`patched_dependencies`, `overrides: OverrideMap`, `catalogs: CatalogMap`, `saved_config_version`, runtime-only `loaded_package_count`, `exact_pinned`.
Package ids: root = 0; `invalid_package_id` sentinel. Strings are `bun_semver::String` into `buffers.string_bytes`.

## Text bun.lock format (JSONC-ish, trailing commas)
- Version enum (`bun.lock.rs`): `V0`, `V1` (stop listing workspace deps unnecessarily), `V2` (stricter: npm tarball outside registry needs integrity; safe git `.bun-tag`), `V3` (scoped override objects). `CURRENT = V3`; written version picked by `Stringifier::version_to_write` (V3 only if scoped overrides exist, else V2).
- Root keys parsed: `lockfileVersion` (required), `configVersion`, `workspaces` (object; `""` = root, each has `name`, `version`, dep groups, `optionalPeers`, `bin`/`binDir`), `trustedDependencies`, `patchedDependencies`, `overrides`, `catalog`, `catalogs`, `packages`.
- `packages` entries keyed by hoisted tree path (e.g. `"foo"`, `"bar/foo"`), value array: `[ "name@resolution", "<registry url or ''>", { dependencies, optionalPeers, bin, binDir, os, cpu, bundled... }, "sha512-integrity" ]` (shape varies per resolution tag: npm, folder, local tarball, github, git, workspace, symlink, root).
- `url_is_under_registry(url, registry)` guards tarball URLs (exact prefix + `/`).
- Real example (test/napi/napi-app/bun.lock, written by an older bun with v1):
```
{
 "lockfileVersion": 1
 "configVersion": 0
 "workspaces": {
 "": {
 "name": "napi-buffer-bug"
 "devDependencies": { "node-addon-api": "^8.0.0", "node-gyp": "^11.2.0", }
 }
 }
 "packages": {

 }
}
```
 Npm entries: `[ "name@version", "<tarball url, '' = default registry>", {deps/bin/os/cpu...}, "integrity" ]`; one blank line between packages; trailing commas everywhere. Nested (non-hoisted) copies use keys like `"parent/child"`.
- `configVersion: 0` -> Auto linker resolves to hoisted for that project; new lockfiles get `configVersion: 1` (see `bun-install-linkers-workspaces`).
- Test helper: `textLockfile(version, pkgs)` in test/harness.ts emits `{lockfileVersion, configVersion:1...pkgs}`.

## Load order (`load_from_dir`)
1. `bun.lock` (text) -> parse into binary in-memory Lockfile. 2. else `bun.lockb` (binary). 3. if `ATTEMPT_LOADING_FROM_OTHER_LOCKFILE`: `migration.rs` tries `package-lock.json` (`migration/npm_lock.rs`), `yarn.lock` (`yarn.rs`), `pnpm-lock.yaml` (`pnpm.rs`); prints migrated notice; `LoadResult.migrated != None` forces save.
- Save format: text by default; binary kept if loaded binary and `saveTextLockfile` not true (`load_result.save_format(&options)`); `bun install --save-text-lockfile` converts. `bun pm migrate` handles bun.lockb.
- `--yarn` also writes yarn.lock (`write_yarn_lock_with_progress`, `printer/Yarn.rs`).
- `bun pm hash` / `hash-print` / `hash-string` expose the meta hash (binary lockfile integrity).

## Frozen / meta hash
Frozen check (install_with_manager.rs `frozen_lockfile` block): changed package.json section reported by `frozen_changed_section` ("<section> in package.json changed since bun.lock was saved"); text lockfiles compared structurally (`Lockfile::eql`), binary via `has_meta_hash_changed`.

## Gotchas
- `trusted_dependencies: None` (field absent -> default trusted list applies) differs from `Some(empty)` (explicit `[]` -> nothing trusted); binary format uses separate `tRuStEDd` / `eMpTrUsT` tags for this.
- `loaded_package_count` / `exact_pinned` are runtime-only: they make `get_package_id` keep lockfile pins and exact `=X.Y.Z` pins instead of deduping onto whichever manifest arrived first.
- Text lockfile parse builds the same in-memory binary `Lockfile`; there is one data model, two serializations.
- Strings live in `buffers.string_bytes` (short strings inline in `semver::String`); building new lockfiles uses `StringBuilder` count-then-append (`parse_count` then `parse_append`).
- Debug: `lockfile_json_stringify_for_debugging.rs`; `bun pm ls [--all]` prints the tree via `printer/tree_printer.rs`.

## Tests
`test/cli/install/bun-lock.test.ts`, `bun-lockb.test.ts`, `lockfile-version-2.test.ts`, `migrate-bun-lockb-v2.test.ts`, `migration/` (npm/yarn/pnpm fixtures), `frozen-lockfile-*.test.ts`, `lockfile-only.test.ts`, `config-version.test.ts`, `bun-update-lockfile-sync.test.ts`.
