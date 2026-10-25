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

## Bun Video

`packages/bun-video` is [aphrody-labs/bun-video](https://github.com/aphrody-labs/bun-video),
an optional submodule (`update = none`) because the runtime's media release scripts
(`scripts/aphrody/release-native-worker.ts`, `media-release.ts`, `media-sdk-*`,
`packages/bun-nginx/scripts`) read it; the release and publish workflows mount it.
FilmCraft is not in this tree any more: Bun OS owns it, and bun-video pins
aphrody-labs/filmcraft `bun-runtime-0.9.0` as `vendor/filmcraft`.

The `bun` executable links no native video: `videoNative` is off and refuses to be
turned on. `Bun.Video` extensions run the `bun-video` executable that the package builds.

```sh
git submodule update --init --checkout --recursive packages/bun-video
cd packages/bun-video && bun install --frozen-lockfile
```

## UI and web packages

`bun-m3`, `bun-plugin-tailwind`, `bun-next`, `web`, `bun-web`, `bun-webview-page`,
`bun-fluent` and `bun-icons` live in [aphrody-labs/bun-ui](https://github.com/aphrody-labs/bun-ui)
as `packages/<name>`; bun-ui builds, tests and publishes them, and Bun OS mounts it as one
submodule. The fork mounts it as the optional submodule `packages/bun-ui` for the release and
site scripts that still import `packages/web/site` and `bun-icons`:

```sh
git submodule update --init --checkout packages/bun-ui
cd packages/bun-ui && bun install --frozen-lockfile
```

The create templates keep depending on the npm package `bun-plugin-tailwind`.

## Bun Python (PyJS)

`buv`, `bun-python-native`, `bun-python-toolchain` and `bun-python-conformance` live in
[aphrody-labs/bun-python](https://github.com/aphrody-labs/bun-python) as top-level directories,
mounted here as the optional submodule `packages/bun-python`. `bun:python` and `bun python`
stay in the runtime and load `bun_python_host` at run time; `bun-runtime-sdk` stays here.

```sh
git submodule update --init --checkout packages/bun-python
cd packages/bun-python && cargo build --locked --release -p bun-python-host
```
