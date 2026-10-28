# VPS build factory

The VPS (`vps`, Ubuntu, 12 CPUs, about 46 GiB RAM) is a Google-style build
factory for Chromium, Chromium OS, CEF, Brave and Bun. Production stays on
`dbfr`. The legacy layout is retired: do not create new top-level build
directories in `~` (`~/factory`, `~/builds`, `~/aphrody-build`,
`~/shenron-release`) or extra `vendor/depot_tools` copies. Large data such as
`~/.aphrody/models` lives on the `/home` volume.

## Layout

| Path                                             | Role                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `~/depot_tools`                                  | Single depot_tools checkout, updated daily by the user timer `depot-tools-update.timer` |
| `~/src/<project>`                                | gclient/repo checkouts: `chromium`, `chromiumos`, `cef`, `brave-core`, `bun`, ...       |
| `~/build/out/<project>/<config>`                 | GN output directories                                                                   |
| `~/build/google/cache/{git,sccache,ccache,siso}` | Shared caches: gclient git cache, compiler caches, Siso                                 |
| `~/build/bun/install-cache`                      | The single Bun install cache and global store (`BUN_INSTALL_CACHE_DIR`)                 |
| `~/build/locks/heavy{,.1,.2}.lock`               | Build slots; every sync, gen and build holds one or more under `flock`                  |
| `~/apps`                                         | Services (Docker compose, Gitea, Komodo, control plane)                                 |

Storage: `/home` is one btrfs volume (subvolume `@home`, `compress=zstd:1`) over
two disks, about 805 GiB; `/` keeps the OS and Docker on its own disk. `~/src`,
`~/apps`, `~/build` and `~/archive` are plain directories of that volume, so
hardlinks and reflinks work between all of them. Heavy outputs and caches
belong under `~/build`, never on `/`. Check free space on `/` and `/home` before
a large sync.

`BUN_INSTALL_CACHE_DIR` (`~/.config/aphrody/host.sh`) and `install.cache` in
`~/.bunfig.toml` both name `~/build/bun/install-cache`; `~/.bun/install/cache`
is a symlink to it and `~/.bun/install/global` lives beside it in
`~/build/bun/install-global`, so installs hardlink from the cache.

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
`heavy.1.lock` (4-7), slot 2 `heavy.2.lock` (8-11). The factory can allocate
multiple free slots, but the current owner policy reserves at most one slot per
concurrent lane shared by Bun runtime, Bun OS and Web OS.
It runs under `taskset` on the CPUs of its slots, so `nproc`, ninja and cargo
see only those, with `BUN_FACTORY_JOBS`, `CARGO_BUILD_JOBS` and
`CMAKE_BUILD_PARALLEL_LEVEL` set to their jobs. A build waits if its required
slots are unavailable. Locks are
always taken in ascending order, so concurrent builds cannot deadlock. A target
needs at least `"slots": n` and at most `"maxSlots": n`. Target configuration
may specify different limits; apply the current owner policy when scheduling.
Scripts that still `flock heavy.lock` directly hold slot 0.

```sh
bun factory slots                          # which slots are taken
bun factory run --max-slots 1 -- bun bd    # at most one slot, 4 CPUs
```

Each slot has about 12 GiB of RAM once `resources.reserveMemoryGiB` is kept
free. A job that cannot run within the current lane budget needs a separately
coordinated scheduling decision. The caches may grow to
`builds.sccacheGiB` (150) and `builds.ccacheGiB` (100) under `~/build`.
