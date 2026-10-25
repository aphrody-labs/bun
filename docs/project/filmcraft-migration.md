# FilmCraft → Aphrody Video

The complete FilmCraft fork at `9cfaa22b408a73b2b374dda0c81a6a1d06284f8b`
was owned by `src/media/filmcraft` until 2026-10-25. It now lives in Bun OS
(`crates/filmcraft-*`, `apps/filmcraft*`) and in aphrody-labs/filmcraft branch
`bun-runtime-0.9.0`, which `bun-video-native` (aphrody-labs/bun-video) mounts as
`vendor/filmcraft`. See [fork layout](fork-layout.md).
The upstream manifest is retained under `docs/bun-source` for provenance.

The browser editor remains the existing egui/Rust application compiled to WASM.
Its import, editing, rendering, audio, project persistence and export code is
retained. `window.aphrodyVideo` aliases the existing `window.filmcraft` object;
browser storage and project identifiers are unchanged. Native-only capabilities
still require separate qualification and must not be advertised as browser support.

The editor adapts its central theme to the canonical Bun Material 3 roles from
`packages/aphrody-migrated/m3/aphrody-m3/packages/m3-theme/tokens.css`.
Third-party trademark artwork is removed; copyright and licence notices remain.

## Dependency reconciliation

The workspace fold flagged four differences from FilmCraft's old standalone
lockfile. The resulting versions are **unchanged from Bun's existing root lock**:
`encoding_rs 0.8.35`, `raw-window-metal 1.0.0`, `smithay-clipboard 0.7.2`, and
`toml_edit 0.19.8`. They satisfy FilmCraft's manifests. Forcing encoding_rs
0.8.42 conflicts with the existing saphyr dependency's `<0.8.40` requirement.
Retain the root resolution and qualify the merged owners together rather than
updating unrelated runtime dependencies or suppressing the fold diagnostic.

## Hosting

Build and qualify on the VPS through `bun factory run`, using the existing
FilmCraft target cache. The named `filmcraft` and `filmcraft-dev` profiles
preserve FilmCraft's unwind contract without changing Bun's default profiles.
Run the `xtask` package's `web` command from the FilmCraft workspace (Bun OS, or
aphrody-labs/filmcraft `bun-runtime-0.9.0`); `src/media/filmcraft` is gone.

`packages/bun-video/src/apps/filmcraft/server.ts` serves only a configured web
artifact directory using Bun.serve. It binds loopback and exposes `/health`.
The existing reverse proxy owns TLS and `/film/`. Activate a versioned release
only after WASM startup, import, editing, save/reload and export tests pass;
keep the previous artifact for rollback. Never replace the other Craft apps.
