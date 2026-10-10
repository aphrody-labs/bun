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

## Clean 8d release with installed skills

The same factory completes from clean source
`8d20fce4aa955ce17564e0e7074e128f56cbad6d`. Its executable is
152248832 bytes, SHA256
`ed8560da686c675c3587754804a3439eca51d1a87ca991f024031ead67222ca3`.
The release MCP announces `1.4.4 (8d20fce4a)`. Codex and Claude profiles
each return all four protocol responses, list 35 tools and successfully
read the actual installed `bun-build` skill with no RPC or tool errors.
The earlier source-checkout skill-discovery gap is fixed in this artifact.

The clean release passes the entire internal suite: 895 passes, 33
inherited skips, zero failures, five snapshots and 146192 assertions
across 92 files (23.53 s). It also verifies 37 exact PyCUDA -> WGSL/D3D12
-> NVRTC CUDA results on the RTX 4070, with source revision `8d20fce4aa9`
reported by the executable. The GPU SDK passes three tests and the shared
Buv/PyJS PyCUDA consumer passes one, both with zero failures. These GPU
consumers use the previously qualified native provider DLL and explicit
host transfers; no zero-copy or Linux GPU qualification is inferred.

Receipts: `tmp/clean-8d-windows-release-receipt.json`,
`tmp/clean-8d-windows-release-mcp.jsonl/.exit`,
`tmp/clean-8d-release-claude-mcp.jsonl/.exit`,
`tmp/clean-8d-release-internal.log/.exit`,
`tmp/clean-8d-release-gpu-pipeline.log/.exit`,
`tmp/clean-8d-release-gpu-sdk.log/.exit` and
`tmp/clean-8d-release-pycuda.log/.exit`.

This development release has no distribution `--version-tag`. The
owner publication factory supplies the Aphrody prerelease tag while
keeping the base `Bun.version` for semver compatibility. Matched-source
performance, distribution tagging, PATH promotion and provider-session
activation remain open. No shared installation is replaced here.
