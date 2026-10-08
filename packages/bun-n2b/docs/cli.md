# n2b command line

`n2b --help` lists every flag. `bunx @aphrody/bun-plugin-n2b` and `aphrody n2b` accept the same
arguments.

## Scan and fix

```sh
n2b                          # scan the current directory, text report
n2b path/to/project --report json
n2b --fix                    # apply the safe rewrites
n2b --aggressive             # also apply the rewrites marked `aggressive`
n2b --migrate                # --aggressive plus migration side effects
n2b --fix --dry-run          # compute the rewrites without writing files
```

| Flag                   | Effect                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `[ROOT]`               | Project root. Defaults to `.`.                                                                    |
| `--fix`                | Applies findings with `autofix = true`. Excludes `--aggressive` and `--migrate`.                  |
| `--aggressive`         | Also applies findings marked `aggressive`. Excludes `--fix` and `--migrate`.                      |
| `--migrate`            | Runs `--aggressive`, then the side effects listed below.                                          |
| `--scaffold-polyfills` | With `--migrate`, runs `bunpp scaffold <module>` for each module that Bun lacks.                  |
| `--report <fmt>`       | `text` (default), `json`, `jsonl`, `md`, `markdown` or `sarif`. `md` and `markdown` are the same. |
| `--ignore <glob>`      | Excludes paths. Repeatable. `.gitignore` is always honoured.                                      |
| `--jobs <1..6>`        | Number of scan workers. Defaults to the available parallelism, capped at 6.                       |
| `--dry-run`            | Computes fixes without writing files or running side effects. Excludes `--migrate`.               |
| `--quiet`              | Prints nothing on stdout. The exit code stays meaningful.                                         |
| `--agent`              | Disables colours, logs to stderr and keeps stdout for the payload. A `text` report becomes JSON.  |

`--migrate` runs `bun install`, removes rival lockfiles, moves `pnpm-workspace.yaml` into
`package.json`.
When the sources use `Bun.*`, it adds the upstream `@types/bun` package as a dev dependency.
Every file it touches is backed up first, and n2b restores the backups if the migration fails or panics.

Fix mode is not transactional. When a later file fails, files already processed stay written. Run
`--dry-run` first to review a migration.

## Exit codes

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | No finding, or `--fix`/`--aggressive` completed without an error-severity finding |
| `1`  | Check mode found warnings or info findings                                        |
| `2`  | A finding has severity `error` (an API Bun lacks), or n2b itself failed           |

## Subcommands

| Command                                        | Purpose                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules`                                        | Lists every rule ID, category and docs link. `--report json` prints a flat JSON array.                                                                                                        |
| `prompt`                                       | Prints a Markdown migration prompt for an LLM.                                                                                                                                                |
| `audit`                                        | Lists GitHub issues and pull requests that mention Bun or Node.js.                                                                                                                            |
| `web`                                          | Scans the scripts of a rendered page artifact.                                                                                                                                                |
| `analyze`                                      | Scans and audits one or more repositories, then links findings to their GitHub issues. The `ai` crate feature adds fastembed embeddings.                                                      |
| `patch`                                        | `n2b patch <pkg>` applies the rules to `node_modules/<pkg>` through `bun patch`. `n2b patch --self` writes the rewrites of the current project as a diff (`n2b.patch`) without editing files. |
| `bunpp`                                        | Scaffolds `@bun++/node-<module>` packages for Node modules that Bun lacks (`scaffold`, `scaffold-all`, `status`, `sync`, `doctor`).                                                           |
| `llmstxt`                                      | Generates `llms.txt` and `llms-full.txt` from a crawled site. Needs `siteone-crawler`.                                                                                                        |
| `app`, `bin`, `linux`, `win32`, `wasm`, `rust` | Project scaffolders.                                                                                                                                                                          |

## The `n2b.json` manifest

n2b looks for `n2b.json` in the project root, then in each parent directory. CLI flags override the
manifest, and the manifest overrides the defaults.

```json
{
  "mode": "check",
  "ignore": ["vendor/**", "test/fixtures/**"],
  "rules": {
    "api/fs-readFileSync": "off",
    "cli/npm-install": { "severity": "info", "autofix": false }
  },
  "registry": {
    "packages": [
      {
        "id": "imports/my-logger",
        "package": "my-logger",
        "replacement": "console",
        "note": "use console"
      }
    ]
  }
}
```

`mode` is `check`, `fix`, `aggressive` or `migrate`. A rule override is `"off"`, `"info"`, `"warn"`, `"error"` or `{ "severity", "autofix" }`.

A rule override that disables a rule or sets `autofix: false` keeps the whole file unchanged in fix
mode. The other findings of that file are still reported.

`registry.packages` and `registry.apis` add project-local entries with the same fields as the
built-in [registry](./rules.md).
