# Local Chromium toolchain

Use the existing `C:/bun` checkout on `main`. GN lives in `vendor/gn`,
depot_tools in `vendor/depot_tools`, and Chromium in `vendor/chromium/src`.
These upstream sources are permanent dependencies, not additional Bun worktrees.
Chromium dependencies and build outputs remain outside the Bun Git index.

```powershell
bun gn exec -- --version
bun depots_tools setup
bun depots_tools exec -- gclient help
bun chromium setup --jobs 8
bun chromium doctor
bun chromium build --jobs 4
```

`depot_tools` is an alias for `depots_tools`. The launchers are checkout package
scripts; they do not add runtime modules or change the installed Bun executable.
`plan` prints commands without applying them. Setup clones missing depot_tools
from its official upstream with shallow history, bootstraps upstream Windows
tools and creates an unmanaged Chromium solution, then runs
`gclient sync --no-history --jobs 4 --revision src@<SHA>`. Existing configurations
resume synchronization. Setup and sync default to the exact source revision
`e20c553087353010f4b71143841c189447ac1628`; use `--revision <40-hex-SHA>` to change
it deliberately. The explicit revision avoids gclient's initial discovery of all
Gerrit references, which took several minutes during the first fetch here.
It does not create a Git mirror or duplicate Chromium history. A process lock in
`build/chromium/setup.lock` rejects concurrent mutations; it is removed on normal
completion and never automatically removes another owner's lock.

Child processes receive depot_tools first in PATH, local Visual Studio selection,
`DEPOT_TOOLS_WIN_TOOLCHAIN=0`, `DEPOT_TOOLS_UPDATE=0`, and Windows-compatible Git
path/line-ending settings. Existing host environment and Git configuration remain
unchanged. depot_tools updates are explicit Git operations in its existing folder.
Builds use Chromium's pinned GN, clang-cl and local Siso/autoninja, with the full
`chrome` target. The default component build has debug symbols disabled to reduce
disk use; upstream WebGPU settings are preserved.

## Windows prerequisites and qualification

The [current upstream Windows instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
require Visual Studio 2026, SDK 10.0.28000.2270 or newer, ATL/MFC and debugger
10.0.26100.3323 or newer. ChromiumOS requires a Linux board SDK and is not a Windows
MSVC target. See the [depot_tools guide](https://chromium.googlesource.com/chromium/tools/depot_tools/+/main/README.md)
for the upstream bootstrap and dependency manager.

On 2026-10-11 this PC had VS Build Tools 18.10.2, SDK 10.0.26100.0 and debugger
10.0.26100.7705. The existing VS catalog offers SDK 10.0.28000.2526. Installing the
missing components through the native owner CLI requires an elevated terminal:

```powershell
sudo.exe --inline --chdir C:\bun bun msvc setup --add Microsoft.VisualStudio.Component.VC.ATLMFC --add Microsoft.VisualStudio.Component.Windows11SDK.28000
```

The non-elevated installation attempt returned installer code 5007. The owner-
authorized `sudo.exe` retry completed with exit code zero. `bun msvc info` now
reports complete SDK `10.0.28000.0`, and the targeted setup dry-run reports
`nothing to do` for both SDK and ATL/MFC.
GN is compiled and qualified separately (see [GN](gn.md)).
depot_tools at `a03dfbf7f2d1cefa2795d81d59ca4f16c8616a8f` bootstrapped successfully
and `gclient help` ran through the Bun launcher. Chromium's primary source at
`e20c553087353010f4b71143841c189447ac1628` was fetched and extracted. The initial
dependency synchronization failed with `SyntaxError: invalid syntax` while
`gclient_eval.EvaluateCondition` parsed an empty DEPS variable. The cause was
missing Windows architecture variables in this session: Python reported an empty
machine architecture, causing `host_cpu` evaluation to fail. The launcher now
restores `PROCESSOR_ARCHITECTURE` only in the child environment, preserving existing
values and using the native Bun architecture as fallback. Real DEPS parsing passes
without upstream changes. Dependency synchronization and a working browser
artifact remain separate qualification steps.

The launcher passed eleven tests and 87 assertions through `bun bd -j4 test
test/internal/chromium.test.ts`, including a real local Windows batch fixture.
Type checking, oxlint, formatting and scope checks passed. Two existing native
build blockers were corrected: a duplicate `graph_native` declaration and stale
Cargo entries after OXC moved to vendored workspace packages. The corrected
lockfile retains package versions and passes the exact locked build unit graph.

## Local performance settings

This PC has an i7-13700F (16 cores, 24 threads), about 32 GiB RAM and a healthy
Micron 2400 NVMe. Its high-performance power plan and AC sleep settings already
satisfy long builds. The pagefile previously peaked near 29 GiB, so maximal CPU
parallelism alone is not a useful default. Use eight jobs for dependency downloads
and four for Chromium compilation initially; measure before increasing build jobs.
`bun bd -j4` bounds the Bun build factory without changing its configuration.
Preserve existing build outputs and the shared 50 GiB sccache; cleaning these
caches forces unnecessary recompilation.

The local Bun and Chromium repositories passed
`git update-index --test-untracked-cache`. Their local Git settings now enable
`core.fsmonitor`, `core.untrackedCache`, `core.preloadindex` and `core.fscache`.
Both fsmonitor daemons report that they are watching their own repository.
These settings do not apply globally. To remove the newly enabled monitors and
untracked caches, run the following in each repository:

```powershell
git fsmonitor--daemon stop
git config --local --unset core.fsmonitor
git config --local --unset core.untrackedCache
```

For build measurements, set `NINJA_SUMMARIZE_BUILD=1` in the current terminal
before `bun chromium build --jobs 4`. Source pins and bounded jobs avoid repeated
work and excessive memory pressure; no download-rate improvement is claimed
without comparable transfer measurements.
