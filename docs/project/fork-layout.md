# Fork layout: what stays here, what lives elsewhere

Goal: keep this repository as close as possible to upstream `oven-sh/bun`
(`bun-v1.4.4`, local tag `upstream/bun-v1.4.4`; the local `bun-v1.4.x` tags are
this fork's). Add-ons leave the tree: each becomes its own `aphrody-labs`
repository, Bun OS ([aphrody-labs/bun-os](https://github.com/aphrody-labs/bun-os),
branch `os`) mounts it as a pinned submodule, and this repository keeps only
what the `bun` executable links or needs to build its release assets.

The machine-readable state is [`fork-inventory.json`](fork-inventory.json): one
entry per component with its path, kind, destination repository, Bun OS path,
pinned revision and migration state.

## Stays in the fork

- Everything upstream ships, plus the fork crates linked into `bun_runtime`
  (`scripts/build/rust.ts` builds `-p bun_runtime --lib`): `src/quality`,
  `src/lint`, `src/sema`, `src/react_compiler`, `src/migrate` (native
  `bun check`, `lint`, `fmt`, `n2b`), the Rio and browser crates in the runtime
  graph, `bun:winui` / `bun:windows`. The inventory lists, for each, what making
  it optional would take.
- The plugin dispatcher (`src/runtime/cli/plugin_command.rs`) and the plugin
  build (`scripts/build/plugins.ts`).
- `vendor/find-msvc-tools`, a path dependency of `bun_runtime` (`bun msvc`).

## Plugins: optional submodules here, pinned in Bun OS

`bun <plugin>` runs `bun-<plugin>`, downloaded on first use from the release
of the running bun and checked against its `SHA256SUMS.txt`
([`docs/runtime/bun-plugin.mdx`](../runtime/bun-plugin.mdx)). Nothing to install.

Each plugin is a repository of its own, mounted here as `plugins/<name>` with
`update = none`, so clones and `git submodule update` skip it. The release
workflows (`aphrody-main-runtime.yml`, `aphrody-release.yml`) and `buv.yml`
mount them before building the assets. To build one from source:

```sh
git submodule update --init --checkout --recursive plugins/<name>   # plugins/ssh too for docker
bun bd --target=plugins
```

Each plugin repository is its own Cargo workspace and lockfile and path-depends
on crates of this checkout (`src/system_tools`, `src/no_window`, `src/zlib_rs`,
`vendor/find-msvc-tools`), so it builds only when mounted here. `bun bd`
skips plugins that are not mounted; the Windows WinFw library
(`scripts/build/deps/winfw.ts`) is built only when `plugins/vpn` is.

| Plugin | Repository | Upstream fork it pins |
| --- | --- | --- |
| `uv` | aphrody-labs/bun-uv | aphrody-labs/uv `bun-0.12.24` (uv 0.12.24 + Bun patches) |
| `vpn` | aphrody-labs/bun-vpn | aphrody-labs/mullvadvpn-app `bun-embedded` |
| `ssh` | aphrody-labs/bun-ssh | none (patched `russh-sftp` in-tree) |
| `docker` | aphrody-labs/bun-docker | none; needs `plugins/ssh` |
| `just` | aphrody-labs/bun-just | aphrody-labs/just `bun` |
| `winmd` | aphrody-labs/bun-winmd | none |

## Bun OS owns the rest

Packages, apps and distribution material (Bun Video, PyJS/Python, UI and web
packages, `factory/`, Chromium patches and docs, distribution scripts) move to
their own repositories or to Bun OS owners; UI and M3 packages go to
aphrody-labs/bun-ui, mounted by Bun OS as one submodule. Their state, and the
reason when one has not moved, is in the inventory.
