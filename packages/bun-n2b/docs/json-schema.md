# JSON output

`n2b --report json` prints a document that follows schema v2. The schema is
[`crates/n2b-types/schema/v2.json`](../crates/n2b-types/schema/v2.json). Its Rust types are
`aphrody_n2b_types::schema`. `--report jsonl` prints the findings with one JSON object per line.
`--report sarif` prints SARIF 2.1.0 for code-scanning tools.

This output comes from `n2b . --report json` on a file containing `const fs = require("fs");`:

```json
{
  "schema_version": 2,
  "$schema": "https://raw.githubusercontent.com/aphrody-code/n2b/main/schema/v2.json",
  "tool": "node2bun",
  "version": "0.7.1",
  "mode": "check",
  "root": "/path/to/project",
  "files_scanned": 1,
  "findings_total": 1,
  "files": [
    {
      "path": "a.js",
      "changed": false,
      "findings": [
        {
          "rule_id": "imports/node-prefix",
          "category": "imports",
          "severity": "warn",
          "confidence": 0.95,
          "message": "préfixer 'fs' avec 'node:' (recommandé)",
          "line": 1,
          "col": 21,
          "start_byte": 20,
          "end_byte": 22,
          "original": "fs",
          "replacement": "node:fs",
          "autofix": true,
          "docs_url": "https://bun.sh/docs/runtime/nodejs-apis",
          "context": {
            "before": [],
            "line": "const fs = require(\"fs\");",
            "after": ["console.log(fs.readFileSync(\"a\", \"utf8\"));", ""]
          },
          "compat": { "status": "full", "module": "fs" }
        }
      ]
    }
  ]
}
```

## Top level

| Field             | Type                             | Meaning                                      |
| ----------------- | -------------------------------- | -------------------------------------------- |
| `schema_version`  | `2`                              | Bumped to `3` on a breaking change           |
| `tool`, `version` | string                           | Producer name (`node2bun`) and crate version |
| `mode`            | `check` \| `fix` \| `aggressive` | Mode of the run                              |
| `root`            | string                           | Scanned root                                 |
| `files_scanned`   | integer                          | Number of files with findings or edits       |
| `findings_total`  | integer                          | Number of findings                           |
| `files`           | `FileFix[]`                      | One entry per file with findings or edits    |

## `FileFix`

| Field      | Meaning                          |
| ---------- | -------------------------------- |
| `path`     | Path relative to `root`          |
| `changed`  | `true` when n2b rewrote the file |
| `findings` | `Finding[]`                      |

## `Finding`

| Field                     | Meaning                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `rule_id`, `category`     | Rule ID and its family (see [rules.md](./rules.md))                                                               |
| `severity`                | `error`, `warn` or `info`                                                                                         |
| `confidence`              | `0.0` to `1.0`                                                                                                    |
| `message`                 | Explanation. Registry messages are in French.                                                                     |
| `line`, `col`             | 1-based position                                                                                                  |
| `start_byte`, `end_byte`  | Byte range of `original` in the file                                                                              |
| `original`, `replacement` | Matched text and its rewrite. Manual rules omit `replacement`.                                                    |
| `autofix`                 | `--fix` applies the replacement                                                                                   |
| `aggressive`              | Present and `true` when only `--aggressive` and `--migrate` apply the replacement                                 |
| `docs_url`                | Bun documentation for the rewrite                                                                                 |
| `context`                 | `before` lines, the matched `line` and `after` lines                                                              |
| `compat`                  | Optional module support: `status` (`full`, `partial`, `missing`), `module`, `missing_apis`, `equivalent`, `bunpp` |

The `version` field appears in JSON, JSONL and SARIF output. Regenerate the baselines in
`crates/n2b/tests/baselines/` after a version bump.
