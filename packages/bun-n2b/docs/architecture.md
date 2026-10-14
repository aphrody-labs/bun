# Architecture

Bun owns one internal Rust package, `bun_migrate`, under `src/migrate`. Its domain types,
report schema, rule registry, scanning engine and CLI are modules of the same crate. The runtime
and the Node-API adapter in `packages/bun-n2b/crates/napi` link this owner directly.

| Module | Canonical source | Role |
| --- | --- | --- |
| Domain types | `src/migrate/types.rs` | Findings, modes and run options |
| Report schema | `src/migrate/schema` | Versioned JSON schema and generated Rust report types |
| Registry | `src/migrate/registry` | Rule data, imports and compatibility tables |
| Engine | `src/migrate/engine` | Walkers, scanners, rewrites and reports |
| CLI | `src/migrate/cli` | Public `bun n2b` and `bun migrate` commands |

## Scan pipeline

1. `run::run` walks the root with the `ignore` crate. It honours `.gitignore`, `--ignore` globs and
   the `n2b.json` manifest, and prunes ignored directories before descending into them.
2. Each file goes to the scanner for its kind (`src/migrate/engine/scanners/`): JavaScript and
   TypeScript sources, shebangs, `package.json`, lockfiles, `tsconfig`, `bunfig.toml`, `.npmrc`,
   `.nvmrc`, `.env`, Dockerfiles, `docker-compose`, CI workflows, Husky hooks, Procfiles, shell
   scripts, `turbo.json`, `next.config.*`, `components.json`, `tauri.conf.json` and `Cargo.toml`.
3. The source scanner parses JavaScript and TypeScript with Oxc to build the `ImportGraph`, then
   applies the `apis`, `modules`, `packages` and `globals` tables (`src/migrate/engine/rules/`).
4. Scanners and rules return `Finding` values from `bun_migrate::types` and never call
   each other.
5. Manifest rule overrides run. In `fix` and `aggressive` modes, n2b applies the edits unless
   `dry_run` is set.
6. `report` renders text, JSON, JSONL, Markdown or SARIF.

Up to six worker threads scan files (`--jobs`). `run::run_map_with_jobs` maps each file on its
worker, so the native addon builds the JSON envelope once without keeping file texts. Callbacks
must not enter JavaScript or start another scan.

`run::run_with_settings` and `run::run_map_with_settings` return a scan summary with the actual
eligible-file count. Legacy vector APIs remain available. One shared budget covers nested source
scopes, retained file text and report contexts. Nested Git repositories require explicit opt-in;
generated inputs, toolchains and isolated stores are pruned before traversal.

## Migration side effects

Only `src/migrate/cli/commands/migrate.rs` runs side effects: `bun install`, rival lockfile removal,
`pnpm-workspace.yaml` to `package.json`, `bunpp scaffold` with `--scaffold-polyfills`, and
`bun add -d @types/bun` (the upstream types package) when the sources use `Bun.*`. Each touched file goes through `BackupGuard`
(`src/migrate/cli/subprocess/bun.rs`), which restores the backups on failure or panic.

## Public contract

These surfaces change only as a deliberate breaking change with regenerated baselines. Add a new
rule or flag instead.

| Surface                   | Source of truth                                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| CLI flags and subcommands | `src/migrate/cli/cli/args.rs`                                           |
| Exit codes                | `src/migrate/cli/commands/scan.rs`, `src/migrate/bin/n2b.rs`            |
| JSON report v2            | `src/migrate/schema/v2.json`                                      |
| Rule IDs                  | `src/migrate/registry/data/*.toml`, `src/migrate/engine/scanners/` |

## Tests

```sh
cargo test -p bun_migrate
```

- `src/migrate/tests/contract.rs` runs the binary over `src/migrate/tests/fixtures/` and validates the
  JSON output against the schema.
- `src/migrate/cli/schema_test.rs` round-trips the baselines in `src/migrate/tests/baselines/`.
- The `src/migrate/tests/proptest_*.rs` property tests fuzz the source and `package.json`
  scanners. Fix the scanner when one fails. Keep the default case count.
