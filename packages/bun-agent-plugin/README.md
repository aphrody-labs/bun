# Bun agent plugin

One source for Claude Code, Codex, Antigravity, Gemini CLI, OpenCode and local-model harnesses. Skills, native command rewriting and source-derived catalogs are shared. Each harness receives its own configuration and hook protocol; Antigravity is not Gemini CLI.

Run this package as a standalone tool with official Bun upstream canary. Fork-specific MCP and native features require their own executable and are not supplied by upstream Bun; adapter migration is in progress.

## Generate and install

```text
bun packages/bun-agent-plugin/bin/bun-agent-plugin.ts generate
bun packages/bun-agent-plugin/bin/bun-agent-plugin.ts generate --check
bun packages/bun-agent-plugin/bin/bun-agent-plugin.ts install claude codex agy opencode local
bun packages/bun-agent-plugin/bin/bun-agent-plugin.ts doctor --json
```

Use `gemini` only for Gemini CLI. `agy` uses Antigravity's plugin schema and native hooks. `local` exports MCP configuration, AGENTS.md and skills for an explicitly chosen harness; it does not configure an inference server, install model weights or select a model.

## Sources and contracts

- [Adapter contracts and official schemas](docs/agent-adapters.md).
- [Rust/Bun policy](../../.claude/skills/bun-rust-first/SKILL.md).
- [Native Bun.Video and media workflows](../../.claude/skills/bun-video/SKILL.md).
- [Shared project memory](memory/bun-agent-shared-memory.md).
- [Current skill router](memory/bun-skills-catalog.md).
- [Fork feature catalog](../../docs/runtime/fork-features.mdx) and its [memory note](memory/bun-fork-features.md): what Bun OS adds to upstream Bun.

Skills come from `.claude/skills` and `.claude/commands` only. Generated skills and tools come from the current checkout, not a historical README snapshot. Graph and type evidence must identify the real source domain and target binary.

## Installation boundaries

Codex receives no lifecycle hooks: its adapter contains MCP, skills and AGENTS.md.

The generated bundle lives in `$BUN_INSTALL/agent-plugin`. Codex and Claude retain native marketplace registration. OpenCode merges its own MCP schema and installs a native callback delegating to the shared rewriting engine. Gemini uses a native extension; Antigravity uses its own plugin. Existing providers, authentication, raw sessions and unrelated configuration remain in their isolated stores.

Uninstall removes owned integrations while retaining modified OpenCode skills and other MCP servers. Installation refuses conflicting OpenCode ownership or an ambiguous JSONC configuration. CLI registration failures are reported; generating a valid bundle does not prove execution in every installed client.

The checkout plugin and installed runtime can differ. Plugin content hashes identify instructions and adapters, not a runtime build or archive checksum. Runtime changes require changed-binary gates with `bun bd`; pure plugin scripts and declarations have their own scoped checks.
