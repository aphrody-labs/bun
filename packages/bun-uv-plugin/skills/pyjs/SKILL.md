---
name: pyjs
description: Develop Buv PyJS, PyTS and PyTSX against native Python and graph APIs, refresh source-backed docs, and connect qualified native language servers.
---

Use the selected native Bun/Buv workspace, its AGENTS.md and current gates. Load the current generated API evidence with `buv <plugin-root>/scripts/docs.ts --workspace <workspace>`. Regenerate after an owned API, types, graph or benchmark change; `--watch` performs bounded native async updates while active. The generator hashes source and declaration files and reads graph/benchmark evidence from the selected `bun_python.sqlite`; it never ingests provider sessions or credentials.

`.pyjs` is JavaScript, `.pyts` is TypeScript and `.pytsx` is TSX. Write valid host syntax. Embed Python explicitly:

```ts
import { Python } from "bun:python";

await using py = await Python.async();
await py.exec`
values = [20, 22]
`;
console.log(await py.evalJSON<number>("sum(values)"));
```

For synchronous ownership use `using py = Python.open()` and ``py.run(String.raw`...`)``. Tagged exec takes one literal with no interpolation. The current declarations and native tests are authoritative; wrappers and fixture success do not qualify CPython extension imports or ABI changes. Do not describe these instructions as model training or fine-tuning.

The bundled `scripts/lsp.ts` speaks real JSON-RPC LSP over stdio and launches configured native backends. It selects installed `tsgo --lsp -stdio`, `ty server`, and `ruff server` when available; `--config <file>` or explicit `BUV_*_LSP_COMMAND` JSON arrays override discovery. It never installs a missing server. Core files route to TypeScript; `.py` files route to ty, with Ruff for formatting and lint diagnostics when configured. PyJS file URIs project to virtual `.js/.ts/.tsx` documents and map back to editor URIs. Python inside string literals is executed by the native runtime; this LSP broker does not claim Python string-literal analysis or cross-language type inference.

Check actual backend availability and versions before enabling a capability. Report missing native backends and keep unsupported language features explicit. Keep stdio reserved for framed protocol bytes; diagnostics belong on stderr. Honor cancellation and close child processes when the editor or session exits. Codex uses this skill and bundled scripts; Claude's LSP manifest is a separate client declaration, not a Codex LSP feature.

Read [the source and protocol references](../../references/sources.md) for version and provenance boundaries. Use the repository factory for builds and the coordinator's single final test pass.
