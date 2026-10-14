<!-- SPDX-License-Identifier: Apache-2.0 -->

# Bun migration

`n2b` is a Node.js to Bun migration analyzer and codemod. It scans a JavaScript or TypeScript
project (sources, `package.json`, lockfiles, `tsconfig`, Dockerfiles, CI workflows and other
configuration files), reports what Bun already supports, what needs a rewrite and what has no
Bun equivalent, and can apply the safe rewrites.

## Run

```sh
bun n2b
```

This is an internal Bun owner. The optional `ai` Cargo feature enables fastembed crosslinks in
`n2b analyze` when building the standalone development target from this checkout.

## Usage

```sh
n2b                          # scan the current directory, text report
n2b path/to/project --report json
n2b --fix                    # apply the safe rewrites
n2b --aggressive             # also apply the rewrites marked `aggressive`
n2b --migrate                # --aggressive plus side effects (bun install, rival lockfile
                             # removal, pnpm-workspace.yaml to package.json), with backups
n2b rules --report json      # every rule id, category and docs link
n2b prompt                   # a Markdown migration prompt for an LLM
n2b audit                    # GitHub issues and pull requests mentioning bun/node
```

Reports: `--report text|json|jsonl|md|markdown|sarif`. `--agent` disables colours, logs to
stderr, keeps stdout for the structured payload and switches a text report to JSON. `--ignore
<glob>` excludes paths. Exit codes: `0` clean, `1` findings, `2` error.

Other subcommands: `web` (scripts of a rendered page artifact), `llmstxt` (`llms.txt` generation
through `siteone-crawler`), `analyze`, `patch`, `bunpp`, and the project scaffolders `app`, `bin`,
`win32`, `linux`, `wasm` and `rust`. `n2b --help` lists every flag.

## Library

The crate also exposes `bun_migrate::run_from` and `run_from_env`, which run the CLI inside an
embedding process (with an explicit argument iterator, or the process arguments). The scanning
engine lives in [`bun_migrate`](docs/engine.md).

## JSON report

The JSON report follows schema v2 (`schema_version: 2`); its Rust types are in
[`bun_migrate::schema`](docs/report.md).

## License

Apache-2.0.
