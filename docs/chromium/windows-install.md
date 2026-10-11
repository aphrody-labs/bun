# Native Windows installation and Chrome profile migration

The Windows installer separates the browser payload, the native launcher and
private browser data. It installs the qualified fork into
`C:\Program Files\BunChromium\Application`, with the compiled GUI launcher
`C:\Windows\System32\bun-chromium.exe`. Windows Explorer and the owner's Google
Chrome installation retain their existing executables and associations.

The launcher resolves Windows known folders rather than trusting environment
variables for executable selection. Its default profile is
`%LOCALAPPDATA%\Chromium\User Data`, the
[standard Chromium location](https://chromium.googlesource.com/chromium/src/+/main/docs/user_data_dir.md).
WebGPUService is enabled by default, matching `bun:chromium`; later user flags
can override the default. Additional arguments use Windows quoting rules, including empty strings,
backslashes before quotes, Unicode and URLs. An explicit trailing
`--user-data-dir` suppresses the default profile argument and permits isolated qualification without touching the imported
profile. The launcher forwards arguments to the installed `chrome.exe` using
`CreateProcessW`; it adds no remote debugging listener or sandbox bypass.

## Plan and protected profile copy

```powershell
powershell.exe -NoProfile -File C:\bun\scripts\aphrody\chromium-install.ps1 -Mode Plan
bun msvc exec cl /nologo /W4 /WX /EHsc C:\bun\scripts\aphrody\chromium-profile-snapshot.cpp /FoC:\bun\build\chromium\install\snapshot.obj /FeC:\bun\build\chromium\install\snapshot.exe /link vssapi.lib ole32.lib
sudo.exe --inline powershell.exe -NoProfile -File C:\bun\scripts\aphrody\chromium-install.ps1 -Mode Profile
```

The source is the complete `%LOCALAPPDATA%\Google\Chrome\User Data` directory,
including every profile, `Local State`, SQLite databases and WAL files. Chrome
can remain running: the native helper uses a single volume shadow copy through
[VSS](https://learn.microsoft.com/en-us/windows/win32/api/vss/ne-vss-vss_snapshot_context)
and checks asynchronous snapshot completion. This is an atomic crash-consistent
snapshot, not a browser-coordinated application backup. SQLite retains its normal
recovery mechanism. A directory symlink exposes the snapshot to Robocopy, and
the script always attempts deletion of only its own snapshot afterward.

Staging, logs, receipts and compressed backups stay under the owner's private
`%LOCALAPPDATA%\BunChromium` directory. Its ACL permits the owner and SYSTEM.
The archive is stored under `Backups`, outside source repositories and memory.
Robocopy preserves named NTFS streams. A native `FindFirstStreamW` inventory
checks their count and sizes on both the snapshot and copy; file sizes are read
through handles rather than cached directory metadata. With no named streams,
ordinary files are directly compressed into 7z. When streams exist, the script
first creates and tests a stream-preserving WIM with `7z -twim -sns`, then
compresses that WIM into 7z. Restoration of that variant requires extracting
both layers. The 7z format itself does not implement `-sns`; the installed
7-Zip 26.03 WIM format does, as verified using a public dummy stream fixture.
Every ordinary copied file is SHA-256 compared with the frozen source, and
`7z t` verifies the archive. Directory reparse points cause refusal instead of
an incomplete migration. An existing Chromium destination is preserved.

The complete archive preserves singleton artifacts; the published destination
omits `SingletonLock`, `SingletonCookie` and `SingletonSocket` so stale runtime
locks do not become active Chromium locks. The original Chrome directory is
never edited. Encryption keys, cookies and passwords remain opaque; copying
them does not establish that Chromium can decrypt Chrome's product-bound
credentials. No credential decryption or security bypass is performed.

## Qualified browser payload

Installation requires `build/chromium/qualification.json`, produced by the
separate browser qualifier. Its executable path and SHA-256 must match the
actual compiled browser, its page/canvas/Wasm checks must pass, and the WebGPU
compute result must be `[10,11,12,13]`.

Generate the payload list with the installer's read-only `Payload` mode. It
selects Chromium's pinned GN, the actual source directory, the local Visual
Studio 2026 instance from `bun msvc info` and depot_tools. Architecture fallback
and toolchain variables are set only for the GN child. The saved provenance
binds the dependency list to the Chromium Git revision and `args.gn` hash:

```powershell
powershell.exe -NoProfile -File C:\bun\scripts\aphrody\chromium-install.ps1 -Mode Payload
sudo.exe --inline powershell.exe -NoProfile -File C:\bun\scripts\aphrody\chromium-install.ps1 -Mode Install
```

The installer copies GN-selected DLLs, executables, locales, data and generated
runtime resources, preserving relative paths. It deduplicates entries and omits
PDBs and build stamps. It rejects missing files, paths outside the output
directory and compiler intermediates. The whole object directory is never
copied. The source Chromium license is included as `LICENSE.chromium`, alongside
the exact runtime resources selected by GN. The browser payload and installed
launcher receive independent hash
checks and an installation receipt. Existing installed products are preserved;
an upgrade requires a separately owned replacement operation.

The native launcher is built through `bun msvc exec cl /W4 /WX /guard:cf`, with
ASLR and NX enabled. Its conditional native test exercises nine Windows
argument round trips and the command-line length boundary:

```powershell
bun msvc exec cl /nologo /W4 /WX /O2 /DBUN_CHROMIUM_LAUNCHER_TEST C:\bun\scripts\aphrody\chromium-launcher.c /FoC:\bun\build\chromium\install\launcher-test.obj /FeC:\bun\build\chromium\install\launcher-test.exe /link shell32.lib
C:\bun\build\chromium\install\launcher-test.exe
```

Successful compilation of this launcher does not qualify the browser. The full
Chromium build, installation, actual installed-process launch and GPU checks
must complete before reporting an installed working product.

## Local profile qualification — 2026-10-11

The complete Chrome 154.0.8037.57 user data was copied from a native VSS snapshot
to the canonical Chromium directory: 24,142 files and 2,559,369,778 bytes.
All ordinary source/copy SHA-256 comparisons passed. Native file-handle and
stream enumeration confirmed 24,142 copied files and zero named NTFS streams.
The integrity-tested compressed archive contains 971,714,561 bytes and stays
in the owner's private `BunChromium\Backups` directory. Its SHA-256 remained
unchanged after an unsupported `7z -sns` update was rejected.

The earlier source directory-entry length sum was 2,555,951,958 bytes. That
metadata sum is retained separately in the private receipt; actual copied
lengths use `GetFileSizeEx`, with content equality established by the file hashes.
The new migration path compares native handle-based inventories before and
after copying rather than using cached directory-entry lengths.

The destination ACL is protected and permits only the owner and SYSTEM.
The owned shadow copy and its exposure symlink were removed, and original
Chrome stayed running. A public dummy NTFS stream survived WIM creation,
integrity verification and extraction; the resulting native inventory found
one file and one named stream. No browser authentication transfer has been
qualified. Browser installation remains conditional on the compiled artifact
and its separate page/WebGPU qualification receipt.

## Private imports on the owner's remote hosts

The same verified archive is transferred through authenticated, pinned SSH
to private stores outside repositories. Linux hosts use
`~/.local/share/bun-chromium/Backups` with directory mode `0700` and file mode
`0600`. Windows uses `%LOCALAPPDATA%\BunChromium\Backups`, protected for the
target owner and SYSTEM. Resumable uploads first compare the existing remote
prefix against a streaming local SHA-256 calculation. A complete remote
SHA-256 match and archive integrity check are required before extraction.

The standard Linux locations are `~/.config/google-chrome` and
`~/.config/chromium`; Windows uses `%LOCALAPPDATA%\Google\Chrome\User Data`
and `%LOCALAPPDATA%\Chromium\User Data`. Each browser gets a separate copy.
Existing profiles remain untouched: their imported copy stays in the private
`BunChromium/Imports` store and is selected explicitly with `--user-data-dir`.
Import receipts record actual destinations, archive hashes, file counts,
byte counts and private permissions. Windows protected authentication stores
remain opaque; their usability on another user or operating system is not
qualified by successful transfer or extraction.

### Qualified VPS import

On 2026-10-11 the VPS received the complete 971,714,561-byte archive through
pinned resumable SFTP. Full remote SHA-256 matched the local receipt and the
single-thread archive integrity/extraction gates passed. Both independent
copies contain 24,142 files and 2,559,369,778 bytes. Chromium uses
`/home/ubuntu/.config/chromium`. The existing Google Chrome profile was retained;
its imported copy lives in the owner's protected `BunChromium/Imports` store
and its private launcher selects that directory with `--user-data-dir`.

Both copies have owner-only directory mode `0700`, file mode `0600`, and zero
entries owned by another user. The archive remains private, mode `0600`.
Post-import free space was 112,434,400 KiB. Windows-protected authentication
usability on Linux is not qualified.

DBFR's full two-copy import retains its 14,000,000 KiB pre-extraction floor.
An explicitly separate Chromium-only mode budgets one exact source copy,
8 GiB final reserve, 256 MiB metadata allowance and the delivery owner's
152,306,720-byte runtime allocation. It requires full archive verification,
private staging, no-clobber publication and an actual final-reserve check;
the second Chrome copy remains pending until its own capacity gate passes.
Omar import remains pending recovery of the existing authenticated SSH route.

### Qualified DBFR Chromium-only import

DBFR received the same complete archive, with a full remote SHA-256 match.
The original reserved 62,989,836-byte incomplete upload prefix was verified
against the local archive prefix and retired only after complete private
archive publication. The explicit single-copy plan included the exact profile
bytes, 8 GiB reserve, metadata allowance and pending runtime allocation.

Single-thread archive integrity/extraction and protected publication completed:
`/home/ubuntu/.config/chromium` contains 24,142 files and 2,559,369,778 bytes.
Directory mode is `0700`, file mode `0600`, and all entries belong to the target
owner. No existing profile was replaced. Actual post-import free space was
10,589,569,024 bytes, exceeding the 8 GiB reserve. The complete archive remains
private; the separate Google Chrome profile copy is still pending capacity.
No cross-platform authentication usability is qualified.

## Delivery boundaries — 2026-10-11

The independent native helpers passed MSVC `/W4 /WX` compilation. The launcher
passed nine argument round trips and its command-line length boundary; without
an installed browser payload, its actual GUI process returns error 2. The
PowerShell installer passed parsing and its read-only plan check. These gates
qualify the helpers and migration, rather than a compiled browser installation.

The delivery owner separately qualified the production Aphrody site using the
native Bun 1.4.4 runtime, existing Google Chrome, 20 public pages, four font/PWA
checks, normal TLS verification and zero browser exceptions. That site receipt
does not qualify this Chromium fork, imported account sessions or native AI
backends. Google account login still requires the registered OAuth callback to
match the deployed callback.

The compiled Chromium 157.0.8099.0 is installed in Program Files with 5,106
verified runtime files, including its license, and the native System32 launcher.
The browser SHA-256 is `8e40f755b04cbaf123920466322131e9276219cf2440480bfd491457616ab147`.
Both source and installed-browser qualification passed local fetch, canvas,
Wasm and WebGPU compute `[10,11,12,13]` on NVIDIA Lovelace without a fallback
adapter. Receipts are retained under `build/chromium/qualification.json` and
`build/chromium/installed-qualification.json`; the payload inventory is installed
as `Application/bun-chromium-install.json`.

Actual System32 launch returned zero and exposed Chrome 157.0.8099.0 over CDP
1.3 using a fresh explicit profile. Process inspection confirmed the installed
Program Files executable. The launcher omits its default profile argument when
an explicit `--user-data-dir` is present, avoiding duplicate switches; native
tests cover both supported switch forms and a similar unrelated switch.
The initial launcher probe exposed this duplicate-switch bug and could open the
imported Chromium profile; the source Google Chrome profile was not edited.
Account authentication transfer remains unqualified. Omar import remains blocked
by the existing SSH route; DBFR's second Chrome copy remains blocked by capacity.
