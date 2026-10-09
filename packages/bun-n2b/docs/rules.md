# Rule registry

The `aphrody-n2b-registry` crate holds the data-driven rules. Five TOML files under
`crates/n2b-registry/registry/` are embedded with `include_str!`, then parsed and validated on first
access. Scanners for configuration files (`tsconfig`, `bunfig.toml`, `.npmrc`, Dockerfiles, CI
workflows, …) add rules written in code in `crates/n2b-core/src/scanners/`.

`n2b rules --report json` prints every rule ID, category and docs link.

## Tables

| File            | Static     | Entries | Matches                                                                          |
| --------------- | ---------- | ------- | -------------------------------------------------------------------------------- |
| `apis.toml`     | `APIS`     | 73      | Node API calls and their Bun rewrite (`fs.readFileSync` → `Bun.file().text()`)   |
| `modules.toml`  | `MODULES`  | 56      | `node:*` built-ins and their Bun support level                                   |
| `packages.toml` | `PACKAGES` | 115     | npm packages with a Bun-native replacement (`dotenv`, `ws`, `better-sqlite3`, …) |
| `cli.toml`      | `CLI`      | 47      | `node`, `npm`, `npx`, `yarn` and `pnpm` commands in scripts and workflows        |
| `globals.toml`  | `GLOBALS`  | 9       | Node globals such as `__dirname`, `process.env` and `module.exports`             |

## Entry fields

Every entry has a unique `id` and an optional `docs` citation.

| Table      | Required fields                                           | Optional fields                                                                                           |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apis`     | `id`, `pattern` (regex), `message`, `severity`, `replace` | `import_from`, `aggressive`, `replacement`, `compat`, `rewrite`, `template`, `codemod_hint`, `confidence` |
| `modules`  | `id`, `module`, `compat`                                  | `bun_reimpl`, `missing_apis`, `equivalent`, `severity`, `rewrite_hint`, `bunpp`                           |
| `packages` | `id`, `package`, `replacement`, `note`                    | `aggressive`, `strategy`, `target`, `apis`                                                                |
| `cli`      | `id`, `pattern`, `replace`, `message`                     | `respect_comments`, `aggressive`, `unless` (regex on the match; a match skips the rule)                   |
| `globals`  | `id`, `symbol`, `bun`, `context`, `rewrite`, `severity`   | `template`, `codemod_hint`                                                                                |

| Enum         | Values                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compat`     | `full`, `partial`, `missing`                                                                                                                                   |
| `rewrite`    | `template` (placeholders `{0}..{n}` or `$1..$n`), `manual` (the finding carries a `codemod_hint`), `drop` (the call disappears, for example `dotenv.config()`) |
| `strategy`   | `drop`, `rewrite`, `shim`                                                                                                                                      |
| `context`    | `esm`, `cjs`, `any`, `dynamic-arg`                                                                                                                             |
| `confidence` | `low`, `medium`, `high`                                                                                                                                        |
| `severity`   | `error`, `warn`, `info`                                                                                                                                        |

When a module entry has no `severity`, n2b derives it from `compat`: `full` gives `info`,
`partial` gives `warn` and `missing` gives `error`.

## Import-aware matching

`crates/n2b-core/src/rules/imports_ast.rs` parses each JavaScript or TypeScript file with Oxc and
builds an `ImportGraph`. A rule with `import_from` matches a symbol only when the file imports it
from that module (default, named, namespace or `require` binding). A local variable named `fs` or
`process` does not trigger the rule.

## Rule ID families

| Prefix                                                                                                                                                               | Source                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `api/*`                                                                                                                                                              | `apis.toml`                                                   |
| `imports/*`                                                                                                                                                          | `modules.toml`, `packages.toml`, and the `node:` prefix check |
| `cli/*`                                                                                                                                                              | `cli.toml`                                                    |
| `globals/*`                                                                                                                                                          | `globals.toml`                                                |
| `next/*`                                                                                                                                                             | `packages.toml` entries for Next.js                           |
| `tsconfig/*`, `bunfig/*`, `npmrc/*`, `env/*`, `shebang/*`, `docker/*`, `docker-compose/*`, `lock/*`, `pkg/*`, `husky/*`, `turbo/*`, `tauri/*`, `ci/*`, `js-config/*`, `workspace/*` | Scanners in `crates/n2b-core/src/scanners/`                   |

`test/*` comes from `crates/n2b-core/src/rules/test_apis.rs`.

## Monorepo and test-runner rules

| ID                                                     | Severity | Fix                                                                                         |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `cli/vitest-run`, `cli/vitest-watch`, `cli/vitest`     | warn     | `aggressive`: `vitest run` becomes `bun test`, `vitest watch`/`dev` becomes `bun test --watch` |
| `cli/jest`                                             | warn     | `aggressive`: `jest` becomes `bun test`                                                     |
| `cli/tsx-watch`, `cli/ts-node`, `cli/node-ts-loader`   | warn     | `tsx watch f` becomes `bun --watch f`; `ts-node`, `tsx`, `node --loader/--import` become `bun` |
| `cli/pnpm-recursive`, `cli/pnpm-filter`                | warn     | `pnpm -r <script>` and `pnpm --filter <name> <script>` become `bun run --filter`            |
| `workspace/pnpm-yaml`                                  | warn     | `--migrate` moves the file into `package.json`                                              |
| `workspace/pnpm-catalog`                               | info     | `--migrate` writes `catalog`/`catalogs`                                                     |
| `workspace/pnpm-overrides`, `workspace/pnpm-patched`   | warn     | `--migrate`; selectors deeper than `a>b`, `pkg@` and `"-"` are only reported               |
| `workspace/only-built-deps`                            | warn     | `--migrate` writes `trustedDependencies`                                                    |
| `workspace/pnpm-settings`                              | info     | `--migrate` writes `bunfig.toml` `[install]`                                                |
| `pkg/pnpm-field`, `pkg/jest-field`                     | warn     | none; the `pnpm` field is migrated like the YAML, `jest` must move to `bunfig.toml [test]`  |
| `test/unsupported-api`                                 | warn     | none; `vi.*`/`jest.*` members that `bun:test` lacks                                         |
| `test/mock-hoisting`                                   | info     | none; `bun:test` does not hoist `vi.mock`/`jest.mock`                                       |

Rule IDs are part of the public contract. Add a new rule instead of renaming or repurposing an
existing ID.

## Doc citations

The `docs` field is free text. It holds a URL or a path citation:

- `https://bun.com/docs/…` links to the published Bun docs;
- `docs/bun/<path>` cites the Bun docs page `docs/<path>` of this repository, for example
  `docs/bun/runtime/nodejs-compat.mdx` cites [`docs/runtime/nodejs-compat.mdx`](../../../docs/runtime/nodejs-compat.mdx);
- `https://nodejs.org/api/<module>.html` links to the Node.js API reference.

Each `docs/bun/*` citation must point to an existing file. Update the citation when the Bun docs move
a page.

## Adding a rule

1. Add the entry to the matching TOML file with a new `id`.
2. Add a fixture or unit test that produces the finding, and one that must not.
3. Run `cargo test -p aphrody-n2b-registry -p aphrody-n2b-core` from `packages/bun-n2b`.
4. If the rule changes reported output, regenerate the baselines under `crates/n2b/tests/baselines/`.
