# Bun-UV / PyJS plugin

Private Buv plugin source with the `pyjs` skill, a native Bun async LSP broker and automatic source-backed documentation. No additional MCP server is configured; local Aphrody capabilities continue to use `aphrody-mcp`.

```sh
buv packages/bun-uv-plugin/scripts/docs.ts --workspace <selected-workspace>
buv packages/bun-uv-plugin/scripts/docs.ts --workspace <selected-workspace> --watch
buv packages/bun-uv-plugin/scripts/lsp.ts --config <native-server-config.json>
buv packages/bun-uv-plugin/scripts/install.ts --workspace <selected-workspace> --buv <qualified-core> --apply
```

Run the selected fork executable or its qualified `buv` alias. Installation previews use the shared `packages/buv/scripts/core.ts` selection: explicit `--buv` or `BUV_EXECUTABLE`, then the selected checkout's debug/release builds. No upstream Bun executable is selected from PATH. `--apply` qualifies the graph and embedded UV before replacing the plugin, and retains the previous installation for rollback.

Generated `pyjs.md`, `pyjs.html` and bounded `pyjs.json` live under `generated/` and are excluded from Git. The generator reads the selected `bun_python.sqlite`, hashes current source/types, reports missing declared inputs, and registers generated artifacts in that registry. Installed plugins retain their selected checkout in `workspace.json`; `BUV_WORKSPACE` or `--workspace` overrides it. The watch command follows only the declared source files and graph database, cancels cleanly, and suppresses unchanged writes.

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

Omit unavailable backends. Installed `tsgo`, `ty` and `ruff` are discovered without downloading; explicit command arrays also accept `BUV_TS_LSP_COMMAND`, `BUV_PYTHON_LSP_COMMAND`, and `BUV_RUFF_LSP_COMMAND`. The native TypeScript server was found at version `7.0.0-dev.20260707.2`; ty and Ruff were absent from PATH during implementation. `buv/backendStatus` reports configured backends after initialization. Core capability results come from the actual native primary server; unavailable document backends return a protocol error.

The coordinator owns the final test pass. `BUV_TEST_NATIVE_LSP=1` enables a real native TS7 initialize/shutdown test; default tests cover framing, byte bounds, URI projection and source declaration extraction. No fixture server substitutes for a native backend. Installing this private plugin must use the configured Aphrody home and keep provider authentication, sessions and cookies in their existing stores. The `.codex-plugin` skill manifest and `.claude-plugin` LSP manifest have separate client contracts.
