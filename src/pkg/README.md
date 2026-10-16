# Package store crates

- `bun_pkg_core`: I/O-free contracts and npm, Cargo sparse, NuGet, vcpkg and PyPI JSON
  parsers preserving metadata and integrity. Unsupported floating NuGet/vcpkg constraints error.
- `bun_pkg_store`: streaming SHA-256 content-addressed store, verified reflink/copy
  materialization, process locks, owner references and dry-run/apply garbage collection.
- `bun_pkg_net`: bounded concurrent HTTP downloads, cancellation, strong ETag resume
  validation and digest verification before publication.
- `bun_pkg_cli`: store/index commands and remote npm/Cargo/NuGet metadata.

These crates are std-only leaves outside `bun install`; they do not change its lockfile,
cache or linker.
