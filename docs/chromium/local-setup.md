# Local Chromium toolchain

Use the existing `C:/bun` checkout on `main`. GN lives in `vendor/gn`,
depot_tools in `vendor/depot_tools`, and Chromium in `vendor/chromium/src`.
These upstream sources are permanent dependencies, not additional Bun worktrees.
Chromium dependencies and build outputs remain outside the Bun Git index.

```powershell
bun gn exec -- --version
bun depots_tools setup
bun depots_tools exec -- gclient help
bun chromium setup
bun chromium doctor
bun chromium build --jobs 4
```

`depot_tools` is an alias for `depots_tools`. The launchers are checkout package
scripts; they do not add runtime modules or change the installed Bun executable.
`plan` prints commands without applying them. Setup clones missing depot_tools
from its official upstream with shallow history, bootstraps upstream Windows
tools and creates an unmanaged Chromium solution, then runs
`gclient sync --no-history --jobs 4`. Existing configurations resume synchronization.
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

The non-elevated installation attempt returned installer code 5007; the owner-
authorized `sudo.exe` retry successfully started the installer with elevation.
Component installation completion must still be checked against `bun msvc info`.
GN is compiled and qualified separately (see [GN](gn.md)).
depot_tools at `a03dfbf7f2d1cefa2795d81d59ca4f16c8616a8f` bootstrapped successfully
and `gclient help` ran through the Bun launcher. Chromium source synchronization
and a working browser artifact must be qualified separately; a `.gclient` file
or a successful launcher plan does not establish a completed Chromium build.

The launcher passed nine tests and 70 assertions through `bun bd test
test/internal/chromium.test.ts`, including a real local Windows batch fixture.
Type checking, oxlint, formatting and scope checks passed. Two existing native
build blockers were corrected: a duplicate `graph_native` declaration and stale
Cargo entries after OXC moved to vendored workspace packages. The corrected
lockfile retains package versions and passes the exact locked build unit graph.
