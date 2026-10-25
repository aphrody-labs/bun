---
name: bun-add-ons
description: Install, build, update the pin of and release the add-ons that left the Bun fork (the uv, vpn, ssh, docker, just and winmd plugins and Bun Video), their optional submodules, the Bun OS vendor/bun-<name> mounts and docs/project/fork-inventory.json. Use before touching plugins/, packages/bun-video or a moved component.
---

# Bun add-ons

The fork is upstream oven-sh/bun 1.4.4 plus what `bun` links. Each add-on is its own
`aphrody-labs` repository, an optional submodule of this checkout (`update = none`) and a
pinned `vendor/bun-<name>` submodule of Bun OS (aphrody-labs/bun-os, branch `os`).
User guide: `docs/project/add-ons.mdx`; split and rationale: `docs/project/fork-layout.md`.

| Add-on | Mount here | Repository | Nested fork |
| --- | --- | --- | --- |
| uv | `plugins/uv` | aphrody-labs/bun-uv | `vendor/uv`, aphrody-labs/uv `bun-0.12.24` |
| vpn | `plugins/vpn` | aphrody-labs/bun-vpn | `vendor/mullvad`, aphrody-labs/mullvadvpn-app `bun-embedded` (GPL) |
| ssh | `plugins/ssh` | aphrody-labs/bun-ssh | patched `russh-sftp` in-tree |
| docker | `plugins/docker` | aphrody-labs/bun-docker | none; path-depends on `plugins/ssh` |
| just | `plugins/just` | aphrody-labs/bun-just | `vendor/just`, aphrody-labs/just `bun` |
| winmd | `plugins/winmd` | aphrody-labs/bun-winmd | none; uses `vendor/find-msvc-tools` here |
| Bun Video | `packages/bun-video` | aphrody-labs/bun-video | `vendor/filmcraft`, aphrody-labs/filmcraft `bun-runtime-0.9.0` |

Old in-tree paths (`src/plugins/*`, `src/bun_vpn`, `src/ssh`, `src/docker`, `src/just`,
`vendor/uv`, `vendor/mullvad`, `vendor/russh-sftp`, `src/media/filmcraft`) are gone; do not
recreate them. `aphrody-labs/bun-distribution` is now `aphrody-labs/bun-os`; the earlier
`aphrody-labs/bun-os` mirror is the archived `aphrody-labs/bun-os-legacy`.

## Source of truth

`docs/project/fork-inventory.json`: one entry per component, with `path` (old in-tree
paths), `destinationRepo`, `forkMount`, `forkMountUpdate`, `bunOsPath`,
`submoduleRevision`, `bunOsCommit`, `upstream` and `migrationState` (`moved`, `pending`,
`stays`). Read it before saying where something lives. If another session owns the file,
ask it to change the file rather than editing it yourself.

## Install (users)

Nothing to install. `bun <plugin>` (`src/runtime/cli/plugin_command.rs`) runs `bun-<name>`
found next to `bun`, else in `$BUN_PLUGINS_DIR` or `$BUN_INSTALL/plugins/<name>/<version>/`.
If it is in neither place, it downloads `bun-<name>-<os>-<arch>[-musl][.exe]` from the release
of the running `bun`: `bun-v<version>` (or `aphrody-v<version>` for a version-tagged build),
then `main-runtime-<rev12>`. It checks the file against `SHA256SUMS.txt`. Commands:
`bun plugin list|install|remove`. Variables: `BUN_PLUGINS_DIR`, which is then the only place
looked at, `BUN_PLUGIN_RELEASE_URL`, `BUN_PLUGIN_NO_DOWNLOAD=1`, `APHRODY_BUN_REPO`,
`GITHUB_TOKEN`. Bun Video: `bun add @aphrody/bun-video@next`. The runtime links no native
video (`Bun.Video.available` is `false`; `videoNative` is a configure error).

## Mount and build

```sh
git submodule update --init --checkout --recursive plugins/<name>   # plugins/ssh too for docker
git submodule update --init --checkout --recursive packages/bun-video
bun bd --target=plugins                                             # mounted plugins only
```

`--checkout` overrides `update = none`. The repositories are public, so no credentials are
needed to fetch them. Each plugin is its own Cargo workspace and `Cargo.lock`. It
path-depends on `src/system_tools`, `src/no_window`, `src/zlib_rs` and
`vendor/find-msvc-tools`, so it builds only while mounted here. Do not fold it into the root
workspace. Direct build: `cd plugins/<name> && cargo build --locked --profile plugin -p bun_plugin_<name> --bin bun-<name>`.
On Windows, `vpn` needs WinFw, which only `bun bd` builds (`scripts/build/deps/winfw.ts`,
enabled when `plugins/vpn` is mounted). Heavy builds go to the VPS:
`bun factory run -- bun bd --target=plugins`.

## Change an add-on and update its pin

1. Work in the add-on's repository. In the mount, run `git -C plugins/<name> switch main`
   (a mounted submodule is detached), then commit and push to `aphrody-labs/bun-<name>`
   `main` as `aphrody-dev`.
2. Pin it here: `git -C plugins/<name> checkout --detach <sha>`,
   `git -C plugins/<name> submodule update --init --recursive`, rebuild with
   `bun bd --target=plugins`, and run the plugin's tests.
3. Update `submoduleRevision` in the inventory, through its owner, and commit by path:
   `git commit -m "..." -- plugins/<name> docs/project/fork-inventory.json`. `git add` of
   the submodule path stages only the gitlink.
4. Bun OS (aphrody-labs/bun-os, branch `os`): move `vendor/bun-<name>` to the same commit,
   update its `sources.lock.json` entry and nested `gitlinks`, and update `toolchains/bun`
   when the runtime pin changes too. Then record `bunOsCommit` in the inventory.
   `docs/runtime-heavy-migration.md` there lists the pins.

## Release

Plugins have no release of their own. `aphrody-main-runtime.yml`, which runs on every push to
`main` and publishes `main-runtime-<rev12>`, and `aphrody-release.yml` (`bun-v*`,
`aphrody-v*` tags) mount `plugins/*`, build `bun-<name>` per target
(`nativePluginAssets` in `scripts/aphrody/release-native-worker.ts`) and upload the executables
with `SHA256SUMS.txt`. So bumping the pin and pushing `main` is the release. Check it with
`gh release view main-runtime-<rev12> -R aphrody-labs/bun --json assets` and
`BUN_PLUGINS_DIR=<empty dir> bun plugin install <name>`. Bun Video is published to npm
(`next`) by `bun-video-release.yml` on a `bun-video-v*` tag of this repository. That
workflow and the runtime media release scripts mount `packages/bun-video`.

## Add a new plugin

Register it everywhere the six are listed:

- `PLUGINS` in `src/runtime/cli/plugin_command.rs`, plus its `*_command.rs` dispatch;
- `plugins` in `scripts/build/plugins.ts`;
- a `.gitmodules` entry with `update = none` and `branch = main`;
- the `for plugin in ...` loop of `aphrody-main-runtime.yml`;
- an inventory entry;
- the Bun OS mount;
- `docs/runtime/bun-plugin.mdx` and `docs/project/add-ons.mdx`.

Not moved yet (inventory `pending`): PyJS/Python, the UI packages (to aphrody-labs/bun-ui),
the other packages and the distribution material.
