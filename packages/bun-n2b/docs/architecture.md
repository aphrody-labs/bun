# Architecture

`packages/bun-n2b` is its own Cargo workspace. It is not a member of the Bun workspace at the
repository root. The four `aphrody-n2b*` crates share one version and are published to crates.io
together. `crates/napi` builds the Node-API addon of `@aphrody/bun-plugin-n2b` and is not published.

| Crate                  | Path                  | Role                                                                                                                   |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `aphrody-n2b-types`    | `crates/n2b-types`    | `Finding`, `FileFix`, `Severity`, `Mode`, `RunOptions` and the serde types of [schema v2](./json-schema.md)            |
| `aphrody-n2b-registry` | `crates/n2b-registry` | The [rule tables](./rules.md), `ImportGraph` and `derive_severity`                                                     |
| `aphrody-n2b-core`     | `crates/n2b-core`     | Walker, scanners, rules, renderers, manifest, report card, GitHub audit and `llms.txt`                                 |
| `aphrody-n2b`          | `crates/n2b`          | The `n2b` binary, migration side effects and scaffolders. Also exposes `run_from` and `run_from_env` to embed the CLI. |
| addon                  | `crates/napi`         | `version()`, `runCli(args)`, `scan(root, options)` and `transform(path, source, mode)` for Bun                         |

The dependency order is `types` ← `registry` ← `core` ← `n2b`. The registry crate does not depend on
Oxc, reqwest or octocrab, so a consumer that only needs the rule tables stays small.

## Scan pipeline

1. `run::run` walks the root with the `ignore` crate. It honours `.gitignore`, `--ignore` globs and
   the `n2b.json` manifest, and prunes ignored directories before descending into them.
2. Each file goes to the scanner for its kind (`crates/n2b-core/src/scanners/`): JavaScript and
   TypeScript sources, shebangs, `package.json`, lockfiles, `tsconfig`, `bunfig.toml`, `.npmrc`,
   `.nvmrc`, `.env`, Dockerfiles, `docker-compose`, CI workflows, Husky hooks, Procfiles, shell
   scripts, `turbo.json`, `next.config.*`, `components.json`, `tauri.conf.json` and `Cargo.toml`.
3. The source scanner parses JavaScript and TypeScript with Oxc to build the `ImportGraph`, then
   applies the `apis`, `modules`, `packages` and `globals` tables (`crates/n2b-core/src/rules/`).
4. Scanners and rules return `Finding` values. They share only `aphrody-n2b-types` and never call
   each other.
5. Manifest rule overrides run. In `fix` and `aggressive` modes, n2b applies the edits unless
   `dry_run` is set.
6. `report` renders text, JSON, JSONL, Markdown or SARIF.

Up to six worker threads scan files (`--jobs`). `run::run_map_with_jobs` maps each file on its
worker, so the native addon builds the JSON envelope once without keeping file texts. Callbacks
must not enter JavaScript or start another scan.

## Migration side effects

Only `crates/n2b/src/commands/migrate.rs` runs side effects: `bun install`, rival lockfile removal,
`pnpm-workspace.yaml` to `package.json`, `bunpp scaffold` with `--scaffold-polyfills`, and
`bun add -d @types/bun` (the upstream types package) when the sources use `Bun.*`. Each touched file goes through `BackupGuard`
(`crates/n2b/src/subprocess/bun.rs`), which restores the backups on failure or panic.

## Public contract

These surfaces change only as a deliberate breaking change with regenerated baselines. Add a new
rule or flag instead.

| Surface                   | Source of truth                                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| CLI flags and subcommands | `crates/n2b/src/cli/args.rs`                                           |
| Exit codes                | `crates/n2b/src/commands/scan.rs`, `crates/n2b/src/main.rs`            |
| JSON report v2            | `crates/n2b-types/schema/v2.json`                                      |
| Rule IDs                  | `crates/n2b-registry/registry/*.toml`, `crates/n2b-core/src/scanners/` |

## Tests

```sh
cd packages/bun-n2b
cargo test --workspace
```

- `crates/n2b/tests/contract.rs` runs the binary over `crates/n2b/tests/fixtures/` and validates the
  JSON output against the schema.
- `crates/n2b/src/schema_test.rs` round-trips the baselines in `crates/n2b/tests/baselines/`.
- The `crates/n2b-core/tests/proptest_*.rs` property tests fuzz the source and `package.json`
  scanners. Fix the scanner when one fails. Keep the default case count.
