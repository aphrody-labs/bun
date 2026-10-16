# VPS build factory

The VPS (`vps`, Ubuntu, 12 CPUs, about 46 GiB RAM) is a Google-style build
factory for Chromium, Chromium OS, CEF, Brave and Bun. Production stays on
`dbfr`. The legacy layout (`~/factory`, `~/builds`, `~/aphrody-build`,
`~/shenron-release`, ad-hoc `vendor/depot_tools` copies) is retired.

## Layout

| Path                                                     | Role                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `~/depot_tools`                                          | Single depot_tools checkout, updated daily by the user timer `depot-tools-update.timer` |
| `~/src/<project>`                                        | gclient/repo checkouts: `chromium`, `chromiumos`, `cef`, `brave-core`, `bun`, ...       |
| `~/build/out/<project>/<config>`                         | GN output directories (symlink into the pool, `~/build/storage/out`)                    |
| `~/build/storage/google/cache/{git,sccache,ccache,siso}` | Shared caches: gclient git cache, compiler caches, Siso                                 |
| `~/build/locks/heavy.lock`                               | Heavy-build lock; every sync, gen and build runs under `flock`                          |
| `~/apps`                                                 | Services (Docker compose, Gitea, Komodo, control plane)                                 |

Mounts: `~/src`, `~/apps` and `~/build/storage` are mergerfs pools over
`sdb1` (`~/build`) and `sdc1` (`/mnt/aphrody-storage/disk500`). Heavy outputs and
caches belong in the pool, never on `/`. Check free space on `/`, `~/build` and
the pool before a large sync.

## Tool

`bun factory` (`scripts/factory/factory.ts`) reads the `google` section of
`tools/config/fusion-factory.json`:

```sh
bun factory layout
bun factory plan chromium            # print commands
bun factory depot                    # clone or update ~/depot_tools
bun factory timer                    # install the daily depot_tools timer
bun factory sync|gen|build|all chromium [--config release] [--dry-run]
```

`sync` uses `gclient sync --no-history` (pinned revision when configured) or
`repo sync`; `gen` writes `~/build/out/<target>/<config>`; `build` runs
`autoninja -j 12`. Add a target by adding an entry under `google.targets`.
