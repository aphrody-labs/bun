# MCP installed-plugin discovery and function lookup — 2026-10-10

The source MCP server previously searched `~/.bun/agent/skills` while the
plugin installer writes `~/.bun/agent-plugin/<target>/skills`. Discovery
now includes the installed target selected by the MCP profile: `claude`,
`agy`, or `codex` for Codex and generic clients. `BUN_INSTALL` remains
authoritative. Legacy skills remain readable; explicit environment paths
and project skills retain their later precedence. Memory databases and
provider stores are neither moved nor imported.

Four isolated tests create a custom installation root with both legacy
and installed skills. All four fail against the installed system Bun and
pass against the first changed debug build. That full run also exposes
two pre-existing failures in the existing MCP suite.

TypeScript graph extraction labels functions with trailing `()`. Exact
bare-name lookup previously missed those nodes. Resolution now compares
both names after removing that optional suffix while retaining exact ID
matching and namespace suffix matching. The existing graph test verifies
paths using both bare and explicit function names, reverse impact through
imports and community analysis. No graph traversal or extraction rule
is changed. The dependency documentation test now expects the actual
Markdown heading `## Usage`; the HTTP test asserts the JSON object shape
without assuming `Response.json()` returns a statically known type.

Validation uses the MSVC 14.44 owner debug factory with four jobs and
four linker workers, full symbols and a documented process-local cache
wrapper opt-out. GNU strict gates run on VPS with canonical heavy/Cargo
locks, four jobs and the qualified LLVM 23 ARM64 sysroot.

Scoped TypeScript, strict oxlint, Prettier, rustfmt and diff checks pass.
TypeScript uses the repository's test configuration and existing locked
`@types/node` 26.2.0 from the selected workspace store; no dependency is
installed or changed.

Receipts: `tmp/mcp-installed-skills-before.log/.exit`,
`tmp/mcp-installed-skills-typecheck.log/.exit`,
`tmp/mcp-installed-skills-lint.log/.exit`,
`tmp/mcp-installed-skills-format.log/.exit`,
`tmp/mcp-installed-skills-rustfmt.log/.exit`,
`tmp/mcp-final-native.log/.exit` and `tmp/mcp-final-<target>.*`.
GNU receipts remain in the VPS checkout's `tmp/owner-linux-qualification/`.

This source correction does not promote the shared PATH runtime or reload
an existing provider session. Installed registration, changed-engine MCP
calls and clean-release promotion remain separate qualification layers.

Final changed-engine suite: 16 pass, zero fail, 283 assertions (2.74 s). Strict bun_mcp Clippy exits zero on GNU x64/ARM64 and MSVC x64/ARM64. Existing unrelated bun_runtime Windows diagnostics remain 45 per target.

Real stdio MCP processes for Codex and Claude each initialize, list 35 tools, run docs_search and read the installed bun-build skill. Each has four response IDs, zero JSON-RPC/tool errors and exit zero. Receipts: tmp/mcp-installed-live-<profile>.jsonl/.stderr/.exit.

The same changed debug engine verifies all 37 PyCUDA -> WGSL/D3D12 -> NVRTC CUDA results on the RTX 4070 (explicit host transfers); GPU SDK tests pass 3/0 and shared Buv/PyJS PyCUDA passes 1/0. Receipts: tmp/mcp-final-gpu-pipeline.log/.exit, tmp/mcp-final-gpu-sdk.log/.exit and tmp/mcp-final-pycuda.log/.exit. The debug executable is 433107456 bytes, SHA256 078d5f1123212f03b5740dd28dcb977508f3f2ce1a54bda9a715750207cbd378. The checkout is based on d95f38a7913 with the owned MCP patch; revision metadata remains pinned to d69d5ebe8b40be626c476871190e2da295325b84 and is not the source commit.
