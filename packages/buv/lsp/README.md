# PyJS language server and API docs

A native Bun LSP broker for PyJS (`.pyjs`, `.pyts`, `.pytsx`) and Python files, plus source-backed API documentation. The `pyjs` skill (`.claude/skills/pyjs`) ships with the `bun` agent plugin.

```sh
bun packages/buv/lsp/docs.ts --workspace <selected-workspace>
bun packages/buv/lsp/docs.ts --workspace <selected-workspace> --watch
bun packages/buv/lsp/lsp.ts --config <native-server-config.json>
```

Generated `pyjs.md`, `pyjs.html` and bounded `pyjs.json` live under `packages/buv/generated/` and are excluded from Git. The generator reads the selected `bun_python.sqlite`, hashes current source/types, reports missing declared inputs, and registers generated artifacts in that registry. `BUV_WORKSPACE` or `--workspace` selects the checkout. The watch command follows only the declared source files and graph database, cancels cleanly, and suppresses unchanged writes.

The broker uses UTF-8 `Content-Length` framing, bounded messages/queues, serialized native writes, real request/response forwarding, isolated backend IDs, cancellation and owned child lifetimes. `.pyjs`, `.pyts` and `.pytsx` project to virtual JavaScript/TypeScript/TSX URIs and map edits/diagnostics back. Native `.py` requests route to ty, with Ruff formatting and diagnostics if configured. Embedded Python string-literal analysis and cross-language type inference are not implemented by the broker.

Example configuration:

```json
{
  "root": "<selected-workspace>",
  "typescript": ["<native-tsgo-executable>", "--lsp", "-stdio"],
  "python": ["<native-ty-executable>", "server"],
  "ruff": ["<native-ruff-executable>", "server"],
  "requestTimeoutMs": 30000,
  "maxMessageBytes": 8388608,
  "maxPending": 256
}
```

Omit unavailable backends. Installed `tsgo`, `ty` and `ruff` are discovered without downloading; explicit command arrays also accept `BUV_TS_LSP_COMMAND`, `BUV_PYTHON_LSP_COMMAND`, and `BUV_RUFF_LSP_COMMAND`. `buv/backendStatus` reports configured backends after initialization. Unavailable document backends return a protocol error.

`bun test packages/buv/lsp` covers framing, byte bounds, URI projection and source declaration extraction; `BUV_TEST_NATIVE_LSP=1` adds a real native TypeScript initialize/shutdown test.
