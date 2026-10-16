# VPS build factory

The VPS (`vps`, Ubuntu, 12 CPUs, about 46 GiB RAM) is a Google-style build
factory for Chromium, Chromium OS, CEF, Brave and Bun. Production stays on
`dbfr`. The legacy layout is retired: do not create new top-level build
directories in `~` (`~/factory`, `~/builds`, `~/aphrody-build`,
`~/shenron-release`) or extra `vendor/depot_tools` copies. Large data such as
`~/.aphrody/models` lives in the pool behind a symlink.

## Layout

| Path                                                     | Role                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `~/depot_tools`                                          | Single depot_tools checkout, updated daily by the user timer `depot-tools-update.timer` |
| `~/src/<project>`                                        | gclient/repo checkouts: `chromium`, `chromiumos`, `cef`, `brave-core`, `bun`, ...       |
| `~/build/out/<project>/<config>`                         | GN output directories (symlink into the pool, `~/build/storage/out`)                    |
| `~/build/storage/google/cache/{git,sccache,ccache,siso}` | Shared caches: gclient git cache, compiler caches, Siso                                 |
| `~/build/locks/heavy{,.1,.2}.lock`                       | Build slots; every sync, gen and build holds one or more under `flock`                  |
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
`autoninja` with the jobs of its slots. Add a target by adding an entry under
`google.targets`.

## Multi-build mode

`builds` in `tools/config/fusion-factory.json` splits the 12 CPUs into 3 slots
of 4 (`"mode": "multi"`). Slot 0 is `heavy.lock` (CPUs 0-3), slot 1
`heavy.1.lock` (4-7), slot 2 `heavy.2.lock` (8-11). A step takes the first free
set of slots with `flock -n`, runs under `taskset` on their CPUs, so `nproc`,
ninja and cargo see only those, and waits when every set is taken. Locks are
always taken in ascending order, so concurrent builds cannot deadlock. A target
may hold more slots with `"slots": n` (Chromium builds in 2 slots, 8 jobs).
Scripts that still `flock heavy.lock` directly hold slot 0.

```sh
bun factory slots                          # which slots are taken
bun factory run -- bun bd                  # any heavy command in one free slot
bun factory run --slots 2 -- cargo build   # in two slots, 8 CPUs
BUN_FACTORY_MODE=single bun factory build chromium   # one exclusive build, 12 jobs
```

Each slot has about 12 GiB of RAM once `resources.reserveMemoryGiB` is kept
free; give memory-heavy links two slots.
