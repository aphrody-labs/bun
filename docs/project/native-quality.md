# Native quality qualification

The source implementation embeds lint and format through the existing
`aphrody-oxc-tools` Rust library at OXC revision
`b25696441c80fd580c35d671797f1940c642a624`. Default dispatch starts no external
backend and downloads no package. Direct `bun check`, `bun lint` and `bun fmt`
reserve these command names; project scripts use explicit `bun run <name>`.
The published `1.4.3-aphrody.4` runtime does not qualify this new implementation.

Lint supports JSON/JSONC configuration, fixes, Gitignore, ignore patterns and
structured diagnostics. Format supports check/write through the embedded
library. Unsupported flags, inherited custom-plugin configurations and unknown
JavaScript plugins fail explicitly. The Bun getter rule is ported over the
owner's real OXC ESTree parser, preserving receiver, write, inline-cache and
nested-scope exclusions. Only the byte-identical compiled plugin source is
accepted; its severity and applicable overrides remain enforced.

Development, build and deployment use the self-hosted Bun fork. Its workflow
does not require Aphrody; Aphrody consumes Bun. Native compiler libraries and
the pinned TS7 API SDK are internal factory dependencies; they are not
standalone compiler CLI substitutions.

The historical JavaScript adapter is available only with explicit
`--external-backend`. It can select environment overrides, project executables
or download pinned oxlint/oxfmt packages. Its fixture tests qualify this adapter,
not embedded backend behavior. This adapter is outside the authorized native
development, build and deployment profile; it is not a fallback for native gates.

The native checker uses `bun_sema_driver` and bundled TypeScript libraries.
The separately pinned TS7 SDK supports compiler API consumers; that does not
establish native checker emit parity. Existing external repository quality
dependencies remain until actual lint and formatting parity is demonstrated.
Prettier import organization, Markdown, JSONC and binding-generation overrides
require separate comparison receipts. Rust and C++ formatting retain their
existing owners.

Qualification on 2026-10-11:

- Locked `cargo check -p bun_runtime` passed in 21.26 seconds.
- Strict scoped Clippy passed in 42.04 seconds with no owned diagnostics.
- The unchanged getter-rule source passed its real-parser unit test covering
  six representative scenarios.
- The real Windows factory compiled and linked the runtime; 23 native and
  compatibility CLI cases passed, with five terminal-only cases skipped.
  Native fixes, configuration, formatting and command collisions are covered.
- All 23 existing Rust factory planner cases passed, including the new
  dual-library case. Published and other target availability remain separate.
- The exact root lint configuration was executed against `src/js`; it reports
  five unused-expression findings and one getter-rule finding. This root gate
  remains red. Native formatting of the explicitly selected delivery scripts,
  package JSON and two CI YAML files passed without an external backend.

The first Cargo attempt recorded Windows command-length failure OS 206 for
`uv-build-backend`, followed by sccache response timeouts OS 10060. The owner
authorized a process-local wrapper opt-out for qualification; the process saves
and restores its environment. The global cache and server remain unchanged.
The factory accepts an owner library offering both `lib` and `cdylib` by
building only its `rlib`; standalone `cdylib` and static libraries remain
unsupported. The actual Windows factory and CLI fixtures qualify linkage and
runtime startup for this host, without claiming other target qualification.
