# Omar native Windows build factory

The owner authorized Omar's existing Windows machine as an additional native
factory on 2026-10-11. The current Chromium build and its incremental outputs
remain on the owner's PC. Omar uses its existing `C:\bun` checkout; source and
output directories are preserved, including another worker's modified
`.claude/skills/cpp-bun/SKILL.md`.

## Observed host and routing

Both native Infra routes returned `Omar` successfully:

```powershell
aphrody infra ssh exec --host omar -c hostname
aphrody infra ssh exec --host omar-rt -c hostname
```

The direct route selects the catalog's `omar-pc` alias on WireGuard
`10.200.77.10:22`; the reverse route selects the VPS tunnel. The authenticated
Windows account is `Omar\omara`. Its existing SSH token is elevated; `sshd` is
running with automatic startup, its configuration passes `sshd -t`, and its
existing inbound OpenSSH firewall rule is enabled. Existing keys, host trust,
GitHub authentication and firewall scope are retained. Windows sudo is installed
in its existing ForceNewWindow mode; unattended setup uses the already elevated
SSH token without opening a UAC window or changing sudo policy.

Initial inventory: Windows 11 Home `10.0.26200`, Intel i5-14400F with 10 cores and
16 logical processors, 15.84 GiB RAM with 6.27 GiB available, RTX 4060, and
174.08 GiB available on the 930.31 GiB C: volume. Installed commands include Bun
`1.4.4+a2efe6945`, Git `2.55.0.windows.5`, GitHub CLI `2.101.0`, CMake `4.4.4`,
Ninja `1.13.2` and generic LLVM `23.1.3`. GitHub remains authenticated as
`KyrioFox`; this procedure does not replace that account.

The checkout fast-forwarded from
`9f04cc95a89c589e84f75f0ab51129ae99e62dbe` to the published main revision
`72b292a99dc01a36fe513a20fbcee103138cad7e`. The existing dirty skill's SHA-256
was identical before and after. No reset, stash, extra checkout or WSL execution
was used. Existing `build-native-release` objects, PCH files, Ninja metadata and
qualified Bun artifacts remain intact.

## Toolchain setup

[The setup script](../../scripts/aphrody/omar-factory.ps1) provides `Plan`,
`Apply` and `Verify`. Run it through the native Infra SSH route, using an encoded
PowerShell command or a quoted forward-slash script path. Backslashes in an
unquoted remote command can be consumed by the remote command interpreter.

```powershell
powershell.exe -NoProfile -File C:\bun\scripts\aphrody\omar-factory.ps1 -Mode Plan
powershell.exe -NoProfile -File C:\bun\scripts\aphrody\omar-factory.ps1 -Mode Apply
powershell.exe -NoProfile -File C:\bun\scripts\aphrody\omar-factory.ps1 -Mode Verify
```

The reviewed plan completes the existing VS2026 Build Tools instance with
ATL/MFC and SDK 28000 through `bun msvc setup`. It installs missing sccache
`0.18.0` from the exact `Mozilla.sccache` winget package. Persistent machine and
user PATH values are backed up under `build/chromium/omar-factory`, deduplicated
and written through `bun:windows`, preserving registry types and unrelated
entries. Compare-before-write checks refuse observed concurrent edits; registry
readback verifies the result. System32 takes precedence. MSVC include/library
variables remain scoped to `bun msvc exec`. A native `WM_SETTINGCHANGE`
notification informs existing desktop applications; already running processes
still retain their own inherited environment.

Setup verifies the selected SDK, ATL/MFC, tool resolution, `bun msvc doctor`,
`sync --check` and existing SSH persistence. A successful receipt is written only
after these checks. The SDK installer runs under a live Infra SSH command with
an explicit finite deadline. Starting a hidden child and closing its SSH session
did not produce a completion receipt on this host; that attempt was not counted
as a successful setup.

The live apply completed successfully on 2026-10-11 at 13:47 Paris time. The
readback receipt confirms MSVC `14.51.36231`, complete SDK `10.0.28000.0`, ATL/MFC,
sccache `0.18.0`, all eight declared tools, and successful doctor/cache/SSH gates.
A fresh SSH session passed `Verify`. PATH has 24 machine entries and 23 user
entries; System32 is first and the environment notification returned success.
The typed before/after backup is
`build/chromium/omar-factory/path-backup-1791719239591.json`, and the successful
toolchain receipt is `build/chromium/omar-factory/receipt.json`. Available C:
capacity after installation was 170.08 GiB.

Only this checkout's Git settings were adjusted: long paths, preload index and
Windows filesystem caching enabled, fetch pruning enabled, fast-forward-only
pulls and simple pushes. Git identity and the remote URL were preserved. No
Chromium wrapper or MSVC include/library variables were added globally.

## Public native helper qualification

Only these public source snapshots were uploaded through native Infra SFTP:

| Source                          | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `chromium-launcher.c`           | `7ce69b1099221edaaa80d357866f10c3eccce3eb1486089e9e22b6f4ba2c5638` |
| `chromium-profile-snapshot.cpp` | `f2d693331363417b619e35152d5c7168419c6e86ec56a6c535331b417e3e537c` |

They are compiled in the ignored directory
`C:\bun\build\chromium\qualification\native-helpers-7ce69b109922-f2d693331363`.
The source snapshot was recorded against owner checkout revision
`6ce08b5d8a6bfd6c04d97cb35dce5b9e05732b84`; hashes bind the then-uncommitted
helper contents independently of that Git revision.

MSVC `14.51.36231` and the initially selected SDK `10.0.26100.0` compiled the GUI
launcher, VSS/inventory helper and conditional launcher test with `/W4 /WX /O2`.
The GUI launcher and helper additionally used `/guard:cf /DYNAMICBASE /NXCOMPAT`.
The executable test passed nine Windows argument round trips, including Unicode,
empty strings and quoted backslashes, plus the command-length boundary.

The inventory helper examined only a generated public fixture: one ordinary file
of 18 bytes and one named NTFS stream of 16 bytes. All four expected counts
matched. No VSS snapshot or private Chrome data was accessed by these gates.
`receipt.json` in the qualification directory records source and executable
hashes, compiler/SDK versions and the observed fixture result.

After SDK installation, all three native executables were rebuilt with SDK
`10.0.28000.0`; the nine argument round trips, boundary case and exact named-stream
fixture counts passed again. The earlier receipt is preserved as
`receipt-sdk26100.json`. SDK 28000 executable SHA-256 values are:

| Executable          | SHA-256                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `bun-chromium.exe`  | `24c9c38d803dd3b32a675ebbdb31c120da553affa4040656fb0d4dcd2f4afe08` |
| `snapshot.exe`      | `51ee1525d19bff92eba190907ccc71e4ac46b0afed9ffd0db0961a1b6a05786f` |
| `launcher-test.exe` | `64236af6200faab2f33e939e2489534a72609581b00e0c4eda56563cc8d7a59e` |

## Changed Bun runtime gate

The checkout subsequently fast-forwarded to
`b55a418351ad075dc04d0b5f853c17b2764d64a9`, preserving the same foreign skill
hash. The existing canonical `build/release` cache was reused with its release,
LTO-off and canary-off settings. The refreshed graph required 292 pending steps,
including 116 C++ compilations; no additional build directory was created.

```powershell
bun run build:release --lto=off --canary=off -j2 test test/internal/chromium.test.ts test/js/bun/chrome.test.ts
```

This build-then-execute gate completed with exit code 0. The changed runner
reported `1.4.4 (b55a41835)`: 18 tests passed across two files, with 124 assertions
and no failures. Coverage includes Chromium setup/path/lock handling and native
Chrome/Chromium builtin identity and bundling resolution.

Two workers did not bound final-link memory: the observed `lld-link` working set
reached at least 8.84 GiB and available physical RAM fell to 0.52 GiB. The existing
24.6 GiB pagefile remained unchanged. Linking completed successfully, but future
fleet admission must reserve at least 10 GiB for this Bun link plus 4 GiB for the
host. The initial available RAM does not satisfy that budget. Profile extraction
was deferred during the link.

Both direct and reverse SSH routes then returned connection refused before
artifact hashing and the separate runtime receipt could be collected. The
completed test result is recorded by the native Infra command; a new executable
hash is pending host reconnection. No SSH service, firewall, authentication or
power setting was changed to recover access.

## Chromium readiness boundary

Omar initially had no Chromium/depot_tools source tree and no qualified Chromium
artifact. Its generic LLVM installation does not replace Chromium's pinned
clang-cl toolchain. The existing Aphrody factory configuration still targets the
VPS with POSIX paths; that configuration has not been represented as a Windows
factory dispatcher.

[Chromium's Windows build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
require at least 100 GB free space and recommend more than 16 GB RAM. The initial
disk inventory exceeds that minimum, but source size, output growth, remaining
headroom and bounded concurrency still require qualification before a large
download or full build. The same instructions state that the external
`rbe-chromium-untrusted` remote-execution service does not support Windows builds.
SSH connectivity alone therefore does not distribute the owner's active Siso
compilation onto Omar.

The helper tests qualify native Windows tools and public helper code only. They
do not qualify a Chromium browser, installed launcher, WebGPU, embedded Bun or
JSC/V8 parity. Browser installation and profile migration retain their separate
qualification and protected storage boundaries.
