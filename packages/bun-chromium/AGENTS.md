# Chromium SDK agent contract

Use Bun's native `bun check`, `bun lint`, `bun fmt` and `bun n2b` commands directly for type checking, linting, formatting and migration. Do not install or invoke external backends for these commands.

Read [README.md](README.md) and repository instructions. Preserve exact identity
of bun:chrome and bun:chromium; never copy implementation. Chromium launcher,
GN/depot_tools, browser runtime and Obscura CDP keep their existing owners.
Claim disjoint paths; preserve active builds and protected browser profiles.

Use pure helpers and identity tests, not live CDP or browser launch. Run
`bun check`, `bun lint`, `bun fmt` and scoped `bun bd test` directly. Source publication
does not establish native receipts or parity. Keep graph limitations explicit.
