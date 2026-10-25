# Repository organization audit

Scope: ten verified defects corrected on 2026-10-13. Existing concurrent work
was excluded. Paths below are relative to the checkout root.

| # | Defect | Correction |
| --- | --- | --- |
| 1 | Root `misctools/` mixed development utilities outside `tools/`. | Move to `tools/dev/`; update LLDB initialization, ignore rules, generator paths and tooling references. |
| 2 | Tooling manifest advertised an absent `index.js` entry point. | Remove `main`, mark the package private and name it `bun-dev-tools`. |
| 3 | Flat `sync-react-compiler.md` was skipped by skill discovery. | Use `.claude/skills/sync-react-compiler/SKILL.md`, add `name` and update the skill catalog. |
| 4 | WinUI/M3 documentation pointed at absent `packages/bun-webos/examples/`. | Link the existing `apps/desktop/examples/` directories. |
| 5 | Tauri bundler README linked an absent sibling `tauri-cli/`. | Link `../aphrody-tauri-cli`. |
| 6 | Gemini Rust README linked the removed `aphrody-web/docs/web/` tree. | Link the protocol and feature matrix in `docs/aphrody-source/`. |
| 7 | Tauri wrap README linked missing M3 and guide paths, including an absent config document. | Link the current web-to-tauri package, debug guide and Rust `src/wrap/config.rs` contract. |
| 8 | Browser publication inventory named absent `packages/bun-aphrody-web/crates`. | Use `packages/web/rust/crates`. |
| 9 | Search inventory named an absent crawler crate directory. | Use `src/browser/crates/crawl`. |
| 10 | Search inventory assigned Google search to absent root `src/search.ts`. | Use `packages/bun-google/src/search.ts`. |

Regenerating Rust completions also exposed generator drift: `init()` was emitted
as `pub` instead of the tracked `pub(crate)`. The generator now preserves the
crate boundary. Regeneration changes only the two tool-path comments in the Rust
output; completion data and executable code remain identical.

Repository skills live only in `.claude/skills`; the agent plugin generator ships
them to every provider adapter, so no per-provider mirror is kept.
Historical Unicode tools still emit Zig; their format is explicitly documented
in `tools/dev/README.md` and does not qualify Rust code generation.

Validation: 22 path, manifest, skill-discovery, generated-output and moved-content
checks pass, plus a Unicode generator table smoke check. Scoped oxlint with
warnings denied, oxfmt and `git diff --check` pass. Existing unused example code
and seven lint warnings in the moved tooling were corrected. Rust executable
code is unchanged; no native runtime build or host deployment is needed.

## Rust workspace

The Rust code is one flat Cargo workspace (2026-10-17). The root `Cargo.toml` lists
every crate in `members` and keeps the only `Cargo.lock`, `rust-toolchain.toml`,
`[patch.crates-io]` table (the PyO3 fork, the vendored `swc_common`) and profiles.
The former nested workspaces (`packages/bun-winsvc`, `bun-webview-core`,
`bun-nginx/native`, `bun-python-native`, `bun-runtime-sdk`, `bun-native-plugin-rs`,
`bun-dotnet-native`, `bun-video/native`, `bun-build-mdx-rs`, `bun-cosmic`,
`src/rio`, the `wgpu-probe` example, `bench/aphrody/interop`
and the `test/js/bun/ffi/cosmic-window` fixture) are members now. Only `vendor/` and
`scripts/verify-baseline-static` stay in `exclude`.

- `default-members` is what a bare `cargo check|clippy|test` builds: crates that
  need no system SDK and download nothing in a build script. CEF, Rio, nginx, the
  webview hosts, the PyO3 modules, the video, .NET and MDX natives and the cosmic
  crates are left out; their gates name them with `-p`.
- Artifacts built on their own keep their settings in named root profiles, since
  `panic` and `lto` cannot be set per package: `runtime`, `unwind-release`,
  `winsvc`, `webview-host`, `nginx-module`, `mdx`, `cosmic`, `shim`, `wasm`.
  Example: `cargo build --profile winsvc -p bun-winsvc`; the output lands in
  `target/winsvc/`.
- `bun scripts/aphrody/flatten-workspace.ts <dir>` folds a nested workspace: member
  manifests get their inherited fields, dependency specs and lints inline, the
  nested lockfile and toolchain file go away. `--heavy` keeps the crates out of
  `default-members`. `[profile.*]`, `[patch.*]` and `[replace]` entries the root
  lacks stop the fold with their list; `--migrate-tables` moves them into the root,
  and an entry the root declares differently must be reconciled by hand. After the
  fold, `cargo metadata` refreshes `Cargo.lock` and any version that went back
  within its semver series, compared with the root and nested lockfiles, is
  reported (`cargo update -p <name> --precise <version>` restores it).
- `flatten-workspace.ts --check` lists the committed `Cargo.toml` files outside the
  root `exclude` that still declare a `[workspace]`; the `clippy` job of
  `rust-lints.yml` runs it and fails on any output.
- The `aphrody-rust` PyO3 adapter of the Python SDK moved to Bun OS
  (`aphrody-labs/bun-distribution`, now `aphrody-labs/bun-os`, `crates/aphrody-rust`), next to its
  `aphrody-rag-core` dependency: `Cargo.lock` holds no `aphrody-labs/aphrody` source.
