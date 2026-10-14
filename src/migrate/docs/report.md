<!-- SPDX-License-Identifier: Apache-2.0 -->

# Migration report types

Shared types of [n2b](../README.md), the Node.js to Bun migration
analyzer:

- `types`: the runtime model used by scanners, rules and renderers (`Finding`, `FileFix`,
  `Severity`, `Mode`, `Report`, `RunOptions`, `CompatInfo`, `CompatStatus`, `MakeFindingOpts`).
  Scanners and rules only share this model; they never depend on each other.
- `schema`: serde types generated from the versioned JSON report schema (v2), such as
  `N2bReport`, for tools that read `n2b --report json` output.

## Example

```rust
use bun_migrate::schema::N2bReport;

fn files_scanned(report_json: &str) -> serde_json::Result<u64> {
    let report: N2bReport = serde_json::from_str(report_json)?;
    Ok(report.files_scanned)
}
```

## License

Apache-2.0.
