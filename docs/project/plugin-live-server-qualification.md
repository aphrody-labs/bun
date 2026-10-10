# Installed plugin and live MCP qualification — 2026-10-10

The actual provider CLIs independently report `bun@aphrody-bun` installed
and enabled at version `1.4.4+2fb86b44ed79`:

```powershell
codex plugin list --marketplace aphrody-bun --json
claude plugin list --json
```

Codex resolves the local marketplace's `codex` directory. Claude resolves
its `claude` directory and reports user scope. These observations verify
provider registration, rather than only the install manifest. The existing
installation's content hash remains
`2fb86b44ed790069182d6cb9920cb9955b59b1305e81aa9829415cdbeec9ba08`.

The installed MCP configuration invokes `bun mcp`. A real stdio process
using that PATH command negotiates protocol `2025-06-18`, lists 35 tools,
and successfully handles `docs_search` and `skill_read` after the initialized
notification. All four JSON-RPC response IDs are present, with no RPC
errors; both tool results report `isError=false`. The server exits zero
when its input closes. The skill lookup is used to inspect the build
workflow, not to modify provider memory.

The invoked PATH runtime reports `1.4.3-aphrody.4 (41211b568)`. Thus this
proves the installed launcher is callable; it does not establish that PATH
has been promoted to the newly built 1.4.4 release. The prior common-pin
1.4.4 release doctor reports the plugin current, and installed payload
hashes have their separate qualification. No authentication, raw sessions,
cookies, provider histories or unrelated settings are changed here.

Receipts: `tmp/plugin-live-mcp-tools.json`,
`tmp/plugin-live-mcp-requests.jsonl`,
`tmp/plugin-live-mcp-responses.jsonl` and `tmp/plugin-live-mcp.exit`.

A direct MCP probe is not proof that this already-running conversation
has reloaded the plugin. New provider-session activation and release PATH
promotion retain separate gates; no restart is forced during concurrent
work.
