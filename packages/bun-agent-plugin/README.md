# bun-agent-plugin

The [aphrody-labs/bun](https://github.com/aphrody-labs/bun) fork as a plugin for Claude Code, Codex and Antigravity/Gemini CLI: the fork's MCP server (`bun mcp`), hooks that run `bun`, `bunx` and `bun uv` instead of `node`, `npm`, `npx`, `yarn`, `pnpm`, `pip` and `python`, and skills for building, testing and navigating Bun.

```sh
bun agent-plugin install            # the copy carried by the bun executable, into every agent found
bun agent-plugin install claude     # one agent
bun agent-plugin uninstall
bun agent-plugin doctor
```

From a checkout of the repository (generates from the checkout first):

```sh
bun scripts/aphrody/agent-plugin.ts install
bun run agent-plugin install        # same, through the package.json script
```

## Commands

| Command | Does |
| --- | --- |
| `install [claude\|codex\|agy]... [--home DIR] [--dry-run] [--update] [--quiet] [--json]` | install for the agents named, or every agent found |
| `uninstall [claude\|codex\|agy]... [--home DIR] [--dry-run]` | take back exactly what `install` added |
| `generate [--out DIR] [--check]` | write the three plugins (default `dist/`); `--check` fails when `dist/` is stale |
| `pack --out FILE` | the archive the build embeds in the executable (`codegen/agent-plugin.bin`) |
| `inputs` | every file `generate` reads |
| `memory --from DIR` | import notes (`bun-*.md`) into `memory/`, without personal paths, hosts, accounts or credentials |
| `doctor` | whether the `bun` on `PATH` is the fork, and which plugin is installed |

Common options: `--root DIR` (the checkout; default: the one this package is in), `--skills DIR` (more skill directories, `<dir>/<name>/SKILL.md`), `--from DIR` (install an already generated tree).

## Layout

| Path | What |
| --- | --- |
| `src/generate.ts` | the generator: repository skills and commands, docs, `CLAUDE.md`, `package.json` scripts, crates, `test/harness.ts` exports and `memory/` into `claude/`, `codex/`, `agy/` and the two marketplaces |
| `src/install.ts` | the installer: `~/.bun/agent-plugin`, merged into `~/.claude/settings.json`, `~/.codex/config.toml` and `AGENTS.md`, `~/.gemini/config/plugins/bun` |
| `src/hooks/` | the hook scripts, shipped as is in every target |
| `src/catalog.ts` | the tools of `bun mcp` and the languages of `bun lsp`, read from their sources |
| `src/sanitize.ts` | what a note may not contain once shipped |
| `src/archive.ts` | the archive format read by `src/runtime/cli/agent_plugin_command.rs` |
| `memory/` | the notes the skills reference |

The plugins are generated, never edited: change the sources, then `generate`. Documentation: `docs/project/agent-plugin.mdx`.
