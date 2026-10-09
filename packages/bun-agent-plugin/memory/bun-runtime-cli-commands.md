---
name: bun-runtime-cli-commands
description: "Bun CLI dispatch — argv[0]/first-arg routing to Command Tag, every subcommand + alias and the Rust file implementing it"
metadata:
 type: reference
---

# Bun CLI command dispatch (src/runtime/cli/)

## Entry & routing
- Process entry: `src/runtime/bin_entry/mod.rs` (+ `c_abi_exports.rs` for C-ABI symbols C++ looks up). `bun_runtime` crate = root of crate graph.
- Dispatch lives in `src/runtime/cli/mod.rs` (~2400 lines):
 - `fn which -> Tag` (line ~915) classifies argv.
 - `pub(crate) fn start(log)` (~1186) `match tag` -> `exec_*` helpers.
 - `cold_exec!` macro stamps trivial `init(Tag::X)?; XCommand::exec(ctx)` arms.
 - `tag_print_help(tag..)` per-command help (~2011+).
- The `Tag` enum lives in **`src/options_types/command_tag.rs`** (so install/bundler can switch on it without depending on cli).
 `Tag::char` = crash-report letter (must stay in sync with bun.report remap.ts).
- Flag parsing: `src/runtime/cli/Arguments.rs` (clap-like `parse_param!` tables; test flags around lines 580-660; `parse` test options ~1773).
- Pre-dispatch argv0 checks: `is_bun_x(argv0)` -> `BunxCommand` (or Add/Exec with `BUN_INTERNAL_BUNX_INSTALL`); `is_node(argv0)` ->
 `RunAsNodeCommand` (sets `PRETEND_TO_BE_NODE`, disables unknown-flag warnings).
- Leading `-flags` are skipped (except `-e...`) before matching first positional via `strings::ExactSizeMatcher<12>`.
- No match -> `Tag::AutoCommand` (run file / package.json script / bin).

## Subcommand table (keyword -> Tag -> implementation)
| keyword(s) | Tag | impl |
|---|---|---|
| (none), file, script, `-e` | AutoCommand | `exec_auto_or_run` -> `run_command.rs` (`RunCommand::exec`) |
| `run` | RunCommand | `run_command.rs` |
| `init` | InitCommand | `init_command.rs` (+ templates `cli/init/`: README.default.md, tsconfig.default.json, react-app, react-shadcn, react-tailwind, rule.md) |
| `build`, `bun` | BuildCommand | `build_command.rs` |
| `discord` | DiscordCommand | `discord_command.rs` |
| `upgrade` | UpgradeCommand | `upgrade_command.rs` |
| `completions` | InstallCompletionsCommand | `install_completions_command.rs`, `shell_completions.rs`, `add_completions.rs/.txt` |
| `getcompletes` | GetCompletionsCommand | `bun_getcompletes` in mod.rs |
| `link` / `unlink` | Link/UnlinkCommand | `link_command.rs` / `unlink_command.rs` |
| `x` (and bunx exe) | BunxCommand | `bunx_command.rs` |
| `repl` | ReplCommand | `repl_command.rs` + `repl.rs` (native TUI REPL). `--interactive` stays AutoCommand -> node-style REPL (`src/js/eval/node-repl.ts`) |
| `i`, `install` (`-g`/`--global` -> AddCommand), `ci` | InstallCommand | `install_command.rs` |
| `c`, `create` | CreateCommand | `create_command.rs`, `cli/create/SourceFileProjectGenerator.rs`, `create/projects` |
| `test` | TestCommand | `test_command.rs` + `cli/test/` (see `bun-runtime-test-runner`) |
| `pm`, `whoami`, `list` | PackageManagerCommand | `package_manager_command.rs` |
| `add`, `a` | AddCommand | `add_command.rs` |
| `update`, `up` | UpdateCommand | `update_command.rs` (`-i` -> `UpdateInteractiveCommand::exec` in `update_interactive_command.rs`) |
| `patch` / `patch-commit` | PatchCommand / PatchCommitCommand | `patch_command.rs` / `patch_commit_command.rs` |
| `r`, `remove`, `rm`, `uninstall` | RemoveCommand | `remove_command.rs` |
| `help` | HelpCommand | `HelpCommand::exec` in mod.rs |
| `exec` | ExecCommand | `exec_command.rs` (runs a Bun Shell script string, see `bun-runtime-shell`) |
| `outdated` | OutdatedCommand | `outdated_command.rs` |
| `publish` | PublishCommand | `publish_command.rs` |
| `audit` | AuditCommand | `audit_command.rs` |
| `check` | CheckCommand (AutoCommand if package.json has a `check` script: `check_command::is_package_script`) | `check_command.rs` (TS type check; also `bun run --check`, `bun test --check`, `bun build --check`) |
| `info` | InfoCommand | `bun_info` in mod.rs -> PackageManager `Subcommand::Info` (pm_view) |
| `dedupe` | DedupeCommand | `dedupe_command.rs` |
| `prune` | PruneCommand | `prune_command.rs` |
| `why` | WhyCommand | `why_command.rs` |
| `fuzzilli` | FuzzilliCommand (only if `Environment::ENABLE_FUZZILLI`) | `fuzzilli_command.rs` |
| `deploy`,`cloud`,`config`,`use`,`auth`,`login`,`logout` | ReservedCommand | prints reserved message |
| argv0 `node` | RunAsNodeCommand | `exec_run_as_node` |

## `bun pm <sub>` (package_manager_command.rs, `subcommand` matching)
`scan` (`scan_command.rs`, security scanner), `pack` (`pack_command.rs`), `whoami`, `view` (`pm_view_command.rs`), `bin`, `hash`
`hash-print`, `hash-string`, `cache` / `cache rm`, `default-trusted`, `untrusted`, `trust` (`pm_trusted_command.rs`), `ls`/`list` (`--all`
`--trusted`), `migrate`, `version` (`pm_version_command.rs`), `why` (`pm_why_command.rs`), `diff` (`pm_diff_*.rs`), `licenses`
(`pm_licenses_command.rs`, only sub allowing `--filter`), `pkg` (`pm_pkg_command.rs`). Also `pm_update_package_json.rs`.

## run-related helpers
- `run_command.rs`: classifies positional as file vs package.json script; boots VM (`Run::boot` -> `VirtualMachine::init` -> `Run::start`)
 or runs script through bun shell / system shell; PATH stitching, `node_modules/.bin`, markdown rendering, Windows bunx fast path; `.sh`
 files run via Bun Shell.
- `filter_run.rs` = `--filter` workspace runs; `multi_run.rs` = `bun run --parallel/--sequential` (Foreman-style prefix output, `--no-exit-on-error`).
- `which_npm_client.rs`, `ci_info.rs` (CI detection), `open.rs` (open in editor/browser), `colon_list_type.rs`, `typescript_libs.rs/.bin`.
- Install scripts: `cli/install.sh`, `install.ps1`, `uninstall.ps1`.

## Completions list
`DEFAULT_COMPLETIONS_LIST` in mod.rs: build install add run update link unlink remove create bun upgrade discord test pm x repl info.

Related: `bun-runtime-bun-apis`, `bun-runtime-test-runner`, `bun-runtime-shell`.
