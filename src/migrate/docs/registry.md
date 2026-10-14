<!-- SPDX-License-Identifier: Apache-2.0 -->

# Migration rule registry

The data-driven rule registry of [n2b](../README.md), the Node.js to Bun
migration analyzer. Five TOML files shipped in the crate (`registry/data/apis.toml`, `modules.toml`,
`packages.toml`, `cli.toml`, `globals.toml`) are embedded with `include_str!`, then parsed and
validated on first access:

- `APIS`: Node.js APIs and their Bun rewrites (`ApiEntry`, `Rewrite`, `ReplaceKind`);
- `MODULES`: Node.js built-in modules and their Bun compatibility (`ModuleEntry`, `Compat`);
- `PACKAGES`: npm packages with a Bun-native replacement (`PackageEntry`, `PackageStrategy`);
- `CLI`: `node`, `npm`, `npx`, `yarn` and `pnpm` commands and their `bun` equivalents
  (`CliEntry`);
- `GLOBALS`: Node.js globals (`GlobalEntry`, `GlobalContext`).

`ImportGraph` and `ImportBinding` describe the imports of a file so rules only match a symbol
that is really imported from the expected module; `derive_severity` maps a module's `Compat`
status to a finding `Severity`.

## Example

```rust
use bun_migrate::registry::{APIS, MODULES};

assert!(!APIS.is_empty());
assert!(!MODULES.is_empty());
```

## License

Apache-2.0.
