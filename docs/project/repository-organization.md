# Repository organization audit

Scope: ten verified defects corrected on 2026-10-13. Existing concurrent work
was excluded. Paths below are relative to the checkout root.

| #   | Defect                                                                                    | Correction                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Root `misctools/` mixed development utilities outside `tools/`.                           | Move to `tools/dev/`; update LLDB initialization, ignore rules, generator paths and tooling references. |
| 2   | Tooling manifest advertised an absent `index.js` entry point.                             | Remove `main`, mark the package private and name it `bun-dev-tools`.                                    |
| 3   | Flat `sync-react-compiler.md` was skipped by skill discovery.                             | Use `.claude/skills/sync-react-compiler/SKILL.md`, add `name` and update the skill catalog.             |
| 4   | WinUI/M3 documentation pointed at absent `packages/bun-webos/examples/`.                  | Link the existing `apps/desktop/examples/` directories.                                                 |
| 5   | Tauri bundler README linked an absent sibling `tauri-cli/`.                               | Link `../aphrody-tauri-cli`.                                                                            |
| 6   | Gemini Rust README linked the removed `aphrody-web/docs/web/` tree.                       | Link the protocol and feature matrix in `docs/aphrody-source/`.                                         |
| 7   | Tauri wrap README linked missing M3 and guide paths, including an absent config document. | Link the current web-to-tauri package, debug guide and Rust `src/wrap/config.rs` contract.              |
| 8   | Browser publication inventory named absent `packages/bun-aphrody-web/crates`.             | Use `packages/web/rust/crates`.                                                                         |
| 9   | Search inventory named an absent crawler crate directory.                                 | Use `packages/web/rust/crates/web-crawl`.                                                               |
| 10  | Search inventory assigned Google search to absent root `src/search.ts`.                   | Use `packages/bun-google/src/search.ts`.                                                                |

Regenerating Rust completions also exposed generator drift: `init()` was emitted
as `pub` instead of the tracked `pub(crate)`. The generator now preserves the
crate boundary. Regeneration changes only the two tool-path comments in the Rust
output; completion data and executable code remain identical.

Matching skills under `.agents/skills` and `.claude/skills` are provider discovery
surfaces with a shared generator. They are not deleted as redundant runtime code.
Historical Unicode tools still emit Zig; their format is explicitly documented
in `tools/dev/README.md` and does not qualify Rust code generation.

Validation: 22 path, manifest, skill-discovery, generated-output and moved-content
checks pass, plus a Unicode generator table smoke check. Scoped oxlint with
warnings denied, oxfmt and `git diff --check` pass. Existing unused example code
and seven lint warnings in the moved tooling were corrected. Rust executable
code is unchanged; no native runtime build or host deployment is needed.
