# Native Just owner

`bun_just` owns Just's parser, analyzer, recipe runner, functions, module imports,
configuration, formatting, cache and reporting directly in the Bun Cargo workspace.
The canonical upstream is [casey/just](https://github.com/casey/just), forked as
[aphrody-labs/just](https://github.com/aphrody-labs/just). The integrated revision and
per-file source hashes are recorded in `upstream-source.json`. The CC0-1.0 license
and upstream authorship remain in `LICENSE` and `Cargo.toml`.

`run_from(args, bun_executable) -> i32` parses only the supplied Just arguments,
including their program name, and returns an exit code. It does not reparse Bun's
global command line. The existing `run(iterator) -> Result<(), i32>` API and the
standalone `just` development target use the same parser and runner.

Embedded execution preserves Just's default `sh -cu <recipe source>`.
`bun just --bun-shell` explicitly selects
`bun --no-env-file exec --nounset <recipe source>` instead. Just's own dotenv
policy supplies the environment once in this mode. Explicit shell arguments, CLI
shell selection, `set shell`, `set windows-shell`, Windows PowerShell settings and
shebang interpreters retain their existing precedence. The Bun executable lives
in each invocation's `Config`; no process-global environment override is installed.
Child processes use Bun's shared `bun_no_window` owner.
Embedded shell, script and chooser children inherit `npm_lifecycle_event=just`,
so recursive calls keep using the linked runner when entering another package.

Recursive recipes can use `{{just_command()}} recipe arguments`: this expands to
a shell-quoted executable and the embedded `--no-env-file just` dispatch prefix.
The command includes `--bun-shell` when that mode is selected.
It uses the same quoting convention as Just's existing `quote()` function. The
default chooser preview uses that command too. `just_executable()` retains its
path-only contract; recipes using it as a standalone command must adopt
`just_command()` when running inside Bun. Explicit shell overrides and shebang
scripts retain their interpreter's command syntax.

The upstream integration corpus and unit tests are retained. `CHANGELOG.md` is
required by `just --changelog`, completion files by `--completions`, and examples
and README examples by the integration suite. CI, release automation, website and
book sources are excluded. This source import alone does not qualify native
execution, signal handling, POSIX scripts or Windows interpreter availability.

Validation after the shared build slot is available:

```powershell
bun src/just/scripts/verify-source.ts
bun scripts/build/rust/cargo-serial.ts --msvc test -p bun_just --lib -j1
bun scripts/build/rust/cargo-serial.ts --msvc test -p bun_just --test integration -j1
```

The complete upstream integration suite expects its external interpreters and
tools. Bun's changed-binary CLI tests qualify the explicit Bun Shell mode and
the default POSIX shell separately. Standalone `just --bun-shell` returns a usage
error because that mode requires a Bun host.
