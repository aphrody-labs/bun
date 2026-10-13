# Bun development tools

Repository-only utilities live here; this package is private and has no library
entry point. Run commands from the checkout root.

| Tool | Purpose |
| --- | --- |
| `generate-add-completions.ts` | Regenerate `src/runtime/cli/add_completions.rs` and format it with rustfmt. |
| `generate-cli-completions.ts` | Generate `completions/bun-cli.json` from CLI help. |
| `gen-unicode-table.ts`, `unicode-generator.ts` | Unicode table generation utilities; their emitted Zig format is historical and is not a Rust source generator. |
| `cold-jsc-start.cpp` | Standalone JSC startup probe; requires matching JSC headers and libraries. |
| `lldb/` | Bun and WebKit LLDB printers, loaded by the root `.lldbinit`. |

```sh
bun tools/dev/generate-add-completions.ts
bun tools/dev/generate-cli-completions.ts
```
