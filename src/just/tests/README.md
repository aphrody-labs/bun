# Running the upstream corpus through Bun

By default, the integration tests run Cargo's standalone `just` binary and
the shared `Test` helper selects Bash, as upstream does.

Set `BUN_JUST_TEST_BINARY` to an absolute path to the Bun executable to run
every invocation through `bun --no-env-file just`. The adapter also sets
`npm_lifecycle_event=just` so a fixture's package script cannot intercept the
built-in command. Output, exit codes, fixtures, and assertions are unchanged.

In PowerShell, after building the runtime with `bun bd`:

```powershell
$env:PATH = "C:\Program Files\Git\usr\bin;$env:PATH"
$env:BUN_JUST_TEST_BINARY = (Resolve-Path build/debug/bun-debug.exe).Path
bun scripts/build/rust/cargo-serial.ts --msvc test -p bun_just --test integration -- --test-threads=1
```

On Windows, the Bash mode needs a native Bash such as Git for Windows.
Verify the installed path before adding it to `PATH`; the System32 Bash
launcher starts WSL and must not be used for this corpus. Some tests also
explicitly require additional interpreters or Unix utilities.

That mode retains the helper's Bash override and qualifies the embedded Just
engine with an external shell. Just's default shell remains `sh -cu`.
Set `BUN_JUST_TEST_SHELL=bun` to add `--bun-shell` and use Bun Shell
for tests that have not explicitly selected a shell:

```powershell
$env:BUN_JUST_TEST_SHELL = 'bun'
bun scripts/build/rust/cargo-serial.ts --msvc test -p bun_just --test integration -- --test-threads=1
```

An explicit `.shell(true)` still selects Bash; `.shell(false)` still leaves
the interpreter to the justfile or runtime. Justfile `set shell`,
`set windows-shell`, shebangs, and script interpreters retain their normal
meaning. No failed tests are automatically skipped or rewritten.

Use a standard Rust test filter for a focused pass, for example
`-- alias:: --test-threads=1`, `-- parameters:: --test-threads=1`,
`-- positional_arguments:: --test-threads=1`, or
`-- dependencies:: --test-threads=1`. These exercise recipe execution;
`-- parser:: --test-threads=1` focuses on parsing and diagnostics. On Windows,
`-- windows:: --test-threads=1` and
`-- windows_shell:: --test-threads=1` cover the upstream cmd/PowerShell paths
when their interpreters are installed.

Remove both environment variables to restore the standalone upstream mode:

```powershell
Remove-Item Env:BUN_JUST_TEST_BINARY, Env:BUN_JUST_TEST_SHELL -ErrorAction SilentlyContinue
```
