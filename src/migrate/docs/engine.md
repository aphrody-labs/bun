<!-- SPDX-License-Identifier: Apache-2.0 -->

# Migration engine

The internal engine of [n2b](../README.md), the Node.js to Bun migration analyzer:

- `run::run(&RunOptions)`: walks a project (honouring `.gitignore` and the ignore globs), routes
  every file to its scanner and returns the per-file results (`Vec<FileFix>`); in `Fix` and
  `Aggressive` modes it writes the rewrites unless `dry_run` is set;
- `run::run_with_jobs(&RunOptions, jobs)`: the same recursive engine with 1–6
  file workers. `run()` defaults to available parallelism capped at six. Ignored
  directories are pruned before descent; a bounded pending-result queue is drained
  concurrently. The complete returned report still retains its file texts in memory.
  The shared Yolo core lease serializes N2B and repository mapper scans within the
  linked native owner, including calls from multiple Bun workers. It does not reserve
  resources in other processes or separately loaded copies of the native library.
- `run::run_map_with_jobs`: consumes each completed file on its native worker before
  queuing the mapped result. The C ABI uses the shared JSON enrichment here, releases
  `before`/`after`, and serializes the final envelope once. Findings, context snippets
  and the final JSON remain in memory. Callbacks must not enter JS or re-enter the scan.
- `manifest`: the optional `n2b.json` project manifest (ignores, rule overrides, local registry
  entries), resolved parent-first;
- `report_card`: the migration report card;
- `audit`: GitHub issues and pull requests mentioning Bun or Node.js (`n2b audit`);
- `llmstxt`: `llms.txt` and `llms-full.txt` generation from a crawled site (`n2b llmstxt`, needs
  `siteone-crawler`; the optional page summaries call the Anthropic API with
  `ANTHROPIC_API_KEY`).

The same crate owns `ai`, `github`, `report`, `rules` (the import graph and Node-to-Bun rule
application), `scanners` and `util`. Shared findings and options live in `bun_migrate::types`,
report validation types in `bun_migrate::schema`, and rule tables in `bun_migrate::registry`.

Read, traversal and write failures return errors. Fix mode is not transactional:
files completed before a later error can already have been written. Use `dry_run`
to review a migration before applying it. Rule overrides run before writes. If a
matching rule is disabled or sets `autofix: false`, the entire file stays unchanged;
other findings remain available. Selective edits within such a file require a
future per-rule edit plan.

## Example

```rust,no_run
use bun_migrate::report::render_json;
use bun_migrate::run::run;
use bun_migrate::types::{Mode, Report, RunOptions};

let opts = RunOptions {
    root: ".".into(),
    mode: Mode::Check,
    report: Report::Json,
    quiet: true,
    ignore: Vec::new(),
    agent: true,
    dry_run: true,
    since: None,
};
let fixes = run(&opts)?;
println!("{}", render_json(&fixes, &opts));
# Ok::<(), anyhow::Error>(())
```

## License

Apache-2.0.
