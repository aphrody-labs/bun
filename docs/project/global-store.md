# Shared dependency store

The workstation's personal `.bunfig.toml`, the Bun workspace root and the
owned standalone package configs opt into the isolated global virtual store:

```toml
[install]
linker = "isolated"
globalStore = true
```

The personal configuration also covers packages without a project override.
Existing cache location, release-age limits, lifecycle trust and concurrency
settings are unchanged. Configuration takes effect on the next installation;
it does not migrate existing `node_modules` trees.

Patched packages, trusted lifecycle packages and dependencies connected to
`workspace:`, `file:` or `link:` paths retain project-local entries through the
native eligibility checks. Peer dependency closures have separate store keys.
See [the global-store contract](https://bun.com/docs/pm/global-store).

## CI and fixtures

The repository runner's dependency setup disables the global store when its
subprocess cache will be deleted on return. A persistent CI cache retains the
project's choice. This exception does not set a global test environment override.

The test harness ignores personal bunfig defaults through its fixture config
directory, while preserving `HOME`. Registry fixtures default to project-local
entries and may opt in explicitly; global-store tests use disposable caches.
`test/bunfig.toml` keeps test dependency setup local.

Do not clear a shared cache while installed projects link into it. Such links
need a new installation after the cache is removed. No shared cache, protected
store or existing module tree is removed by this configuration change.
