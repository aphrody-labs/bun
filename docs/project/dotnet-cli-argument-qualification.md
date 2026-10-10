# Native Windows argument transport — 2026-10-10

Windows `Bun.spawn` now encodes UTF-16 arguments through `OsString`, retaining
unpaired surrogate code units in the WTF-8 transport expected by libuv. Existing
NUL and batch-file metacharacter checks remain in place. The common Windows argv
store retains the encoded `OsString` bytes instead of using a lossy string.

The file-based .NET launcher forwards Unix argument bytes through `OsStringExt`
and converts Windows WTF-8 back to UTF-16. The producer-owned .NET host already
accepts native `OsStr` arguments and passes wide strings to hostfxr on Windows.

The new regression reads the child's actual `GetCommandLineW` buffer, using its
native length, and checks the high/low surrogate code units. It fails on the
installed runtime, which prints an empty match, and passes on the rebuilt native
executable. This verifies native command-line transport rather than a text display.

Changed-binary Windows gates pass 58 tests, 330 assertions:

- Argument suite: ten tests, 167 assertions, including curated/generated Windows
  command lines, Unicode, quotes, backslashes and the new native regression.
- Selected SDK/CLR/.csts integration: five tests, 12 assertions.
- Python/PyCUDA/Buv/PyJS with compiler and GPU gates enabled: 43 tests,
  151 assertions, including real Cython/Nuitka artifacts.

`bun_core` strict Clippy passes all six Windows/Linux/macOS x64/ARM64 targets.
The complete runtime still fails with nine GNU Linux and 148 Windows diagnostics.
The .NET launcher file has no diagnostics on Windows/Linux GNU x64/ARM64; other
functions in the spawn bindings retain unrelated Windows diagnostics. Scoped
TypeScript, oxlint, oxfmt and whitespace checks pass for the owned test.

Limits: the JavaScript `process.argv` projection still replaces lone surrogates.
The external Windows .NET SDK also replaces them in the managed file-based app,
as verified independently with `C:/Program Files/dotnet/dotnet.exe`. Native transport
is preserved; this does not claim managed or JavaScript surrogate round trips.
Unix non-UTF-8 argument execution, release distribution and deployment remain pending.

Local receipts: `tmp/windows-wtf8-spawn-{native-final,system-baseline}.log`,
`tmp/windows-wtf8-buv-gpu-native.log`, `tmp/dotnet-cli-native-final.log`,
`tmp/windows-wtf8-argv-probe.log`, `tmp/dotnet-wtf8-external-probe.log`,
`tmp/dotnet-cli-core-clippy-*.jsonl` and `tmp/windows-wtf8-osstring-clippy-*.jsonl`.
