# n2b documentation

n2b analyzes a Node.js project and migrates it to Bun. It reports what Bun already supports, what
needs a rewrite and what has no Bun equivalent, and it applies the safe rewrites.

| Page                                 | Content                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [cli.md](./cli.md)                   | Commands, modes, report formats, exit codes and the `n2b.json` manifest         |
| [rules.md](./rules.md)               | The rule registry: tables, entry fields, rule IDs, severities and doc citations |
| [json-schema.md](./json-schema.md)   | JSON output, schema v2                                                          |
| [architecture.md](./architecture.md) | Crates, scan pipeline, migration side effects and the native addon              |

The same `bun_migrate` owner powers:

- the built-in `bun n2b` and `bun migrate` commands;
- the npm package `@aphrody/bun-plugin-n2b`, whose CLI is `bun n2b`;
- the standalone development binary `n2b`. Canonical sources belong to `src/migrate`, an internal member of Bun's root Cargo workspace.

Oxc, the parser behind the import analysis, is documented in
[`packages/bun-oxc/docs`](../../bun-oxc/docs/README.md).
