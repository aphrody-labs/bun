# Clean Windows release qualification — 2026-10-10

The owner factory completes a release build from clean source commit
`d5bdc8a4e0322be490e0cfac6cc8772ee23969d2`, using MSVC toolset 14.44,
four Ninja jobs and four linker workers. Default ThinLTO and symbols are
retained. The process-local cache-wrapper opt-out is deliberate; neither
the global cache configuration nor system pagefile is changed.

```powershell
bun msvc --toolset 14.44 exec -- bun run build:release --link-threads=4 -j4 mcp --profile codex --cwd C:\bun\tmp\owner-consolidation
```

The resulting `bun-profile.exe` is 152247296 bytes, SHA256
`82ee0046851ec9868aa93ba294dff679352f683e8c06c07f2a933658d9737886`.
The factory and its stdio MCP subprocess exit zero. MCP initialization
announces `1.4.4 (d5bdc8a4e)`, negotiates protocol `2025-06-18`, lists
35 tools and successfully runs `docs_search`. All four response IDs are
present and no JSON-RPC error occurs.

The fourth response, `skill_read` for `bun-build`, reports `isError=true`:
that skill is absent from the selected source checkout's skill catalog.
The separately installed plugin contains the build skill. This run proves
clean release linkage and MCP transport, but does not prove every tool or
installed-plugin lookup works in this source-checkout context.

Receipts: `tmp/clean-d5-windows-release-mcp.jsonl`,
`tmp/clean-d5-windows-release.stderr`,
`tmp/clean-d5-windows-release.exit` and
`tmp/clean-d5-windows-release-receipt.json`.

PATH promotion, provider-session activation, matched-source performance
and binary-size gates remain open. The executable is retained in the
isolated owner build checkout; no shared launcher is replaced.
