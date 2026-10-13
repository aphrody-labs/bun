# Agent adapter contracts

Verified on 2026-10-13 through Context7 (`/google-gemini/gemini-cli`,
`/anomalyco/opencode`) and the official documentation linked below. These are
integration contracts, not evidence that a particular installed client has
successfully executed Bun tools. Installed client versions and resolved settings
remain the authority for runtime qualification.

## Shared skills and ownership

Keep skill sources in this package. Generate adapters from those sources rather
than maintaining independent instructions per client. A portable skill is a
directory containing `SKILL.md` with YAML `name` and `description`; use lowercase
names matching their directory. Clients load skill bodies on demand. Instructions
are guidance; loading them does not enforce code language or resource limits.

Gemini CLI and OpenCode both discover project `.agents/skills/` and user
`~/.agents/skills/`. Gemini gives this alias precedence over `.gemini/skills/`
within the same scope. OpenCode additionally supports `.opencode/skills/` and
`~/.config/opencode/skills/` plus Claude-compatible locations. Shared discovery
does not imply shared provider sessions or credentials.

Sources: [Gemini skills](https://geminicli.com/docs/cli/skills/),
[OpenCode skills](https://opencode.ai/docs/skills/).

## Gemini CLI

User settings live at `~/.gemini/settings.json`; project settings live at
`.gemini/settings.json`. Project context defaults to `GEMINI.md`. A native
extension uses `gemini-extension.json` with `name`, `version`, `mcpServers` and
optionally `contextFileName`; `${extensionPath}` resolves to its installation
directory. Do not infer that another executable such as `agy` implements this
contract solely from its name.

```json
{
  "mcpServers": {
    "bun": {
      "command": "bun",
      "args": ["mcp"],
      "timeout": 30000
    }
  }
}
```

Stdio server fields include `command`, `args`, `env`, `cwd`, `timeout` and
`trust`. Do not silently enable trust or replace existing server definitions.
Configuration strings support environment references; secrets remain in their
existing isolated stores.

Gemini hooks use `BeforeTool`, `AfterTool`, `BeforeAgent`, `AfterAgent`,
`BeforeModel`, `AfterModel`, `BeforeToolSelection`, `SessionStart`, `SessionEnd`,
`Notification` and `PreCompress`. They are not Claude event aliases.

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "run_shell_command",
        "sequential": true,
        "hooks": [
          {
            "type": "command",
            "name": "bun-policy",
            "command": "bun /absolute/path/to/adapter.ts",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

Hook timeouts are milliseconds (default 60000). The subprocess receives JSON on
stdin and returns only JSON on stdout; logs belong on stderr. `BeforeTool`
receives `tool_name` and `tool_input`. Its denial response is
`{"decision":"deny","reason":"..."}`; argument overrides belong in
`hookSpecificOutput.tool_input`. `SessionStart` injects
`hookSpecificOutput.additionalContext` and cannot block startup. Copying a
Claude hook payload or output into this adapter is incorrect.

Sources: [settings](https://geminicli.com/docs/reference/configuration/),
[MCP](https://geminicli.com/docs/tools/mcp-server/),
[extension manifest](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md),
[hooks](https://geminicli.com/docs/hooks/reference/).

## OpenCode

Project configuration is `opencode.json` or `opencode.jsonc`; user configuration
is `~/.config/opencode/opencode.json`. Use the official schema
`https://opencode.ai/config.json`. `OPENCODE_CONFIG` selects a custom config file;
`OPENCODE_CONFIG_DIR` selects a custom agent configuration directory. Preserve
these overrides and existing JSONC content when installing.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bun": {
      "type": "local",
      "command": ["bun", "mcp"],
      "enabled": true,
      "environment": {}
    }
  }
}
```

This uses `mcp`, a command array and `environment`; it is not the Gemini/Claude
`mcpServers` schema. OpenCode hook integrations are JS/TS plugins under
`.opencode/plugins/` or `~/.config/opencode/plugins/`. Their callbacks include
`tool.execute.before`, `tool.execute.after` and an `event` callback for session
events such as `session.created` or `session.idle`. They are not a JSON
`PreToolUse` hook block. Use the installed `@opencode-ai/plugin` definitions
before implementing a callback; document-only compatibility does not prove
plugin execution.

Sources: [configuration](https://opencode.ai/docs/config/),
[MCP](https://opencode.ai/docs/mcp-servers/),
[plugins](https://opencode.ai/docs/plugins/).

## Local models

A model server is distinct from the agent harness that discovers skills,
launches MCP and executes hooks. Ollama or another OpenAI-compatible endpoint
does not acquire those features by receiving an `AGENTS.md` file. Configure the
chosen harness and qualify its tool-call behavior with the actual served model.

OpenCode documents a local provider using `@ai-sdk/openai-compatible`, an
explicit `options.baseURL` such as `http://localhost:11434/v1`, and explicit
`models` entries. Resolve model identifiers from the owner's live server
inventory; do not install weights, pick an obsolete example model or overwrite
the selected model during Bun plugin installation. Provider authentication,
raw sessions and cookies remain outside generated plugin artifacts and project
memory.

Source: [OpenCode providers](https://opencode.ai/docs/providers/).

## Antigravity

Verified separately through Context7 `/websites/antigravity_google` on
2026-10-13. Antigravity is its own harness; Gemini CLI extension manifests and
hook event names do not define its plugin contract.

The native plugin root contains `plugin.json`, optionally `mcp_config.json`,
`hooks.json`, `skills/`, `agents/` and `rules/`. Its published manifest contract
accepts `name` and `description`, with additional properties disabled. The
documentation recommends the editor schema URL
`https://antigravity.google/schemas/v1/plugin.json`; its direct fetch was not
available during this verification, so the documented field reference is the
evidence here. Do not copy Claude marketplace fields or Gemini `version` into
this manifest. Bundle provenance remains in the plugin's separate metadata.

IDE and Antigravity 2.0 discover global plugins at
`~/.gemini/config/plugins/<name>/` and workspace plugins at
`.agents/plugins/<name>/`. The CLI installs local bundles with
`agy plugin install <absolute-plugin-directory>`, stages them at
`~/.gemini/antigravity-cli/plugins/<name>/`, and exposes
`agy plugin list --json` for inspection. These locations represent distinct
surfaces; copying into one location does not prove all surfaces loaded it.

All surfaces support workspace `.agents/skills/`. Global standalone skills live
under `~/.gemini/config/skills/` for IDE/2.0 and
`~/.gemini/antigravity-cli/skills/` for CLI. Plugins carry their own `skills/`.

MCP settings use `~/.gemini/config/mcp_config.json` globally or
`.agents/mcp_config.json` in a workspace. The stdio schema is
`mcpServers: { bun: { command: "bun", args: ["mcp"] } }`; environment values use
`env`. Remote transports use `serverUrl`, not Gemini's `url` or `httpUrl`.

Hooks belong to a plugin-root `hooks.json`, workspace `.agents/hooks.json`, or
global `~/.gemini/config/hooks.json`. Hook names contain native event definitions:

```json
{
  "bun-session": {
    "SessionStart": [
      {
        "type": "command",
        "command": "bun /absolute/path/to/session-start.ts agy",
        "timeout": 10
      }
    ]
  },
  "bun-commands": {
    "PreToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          {
            "type": "command",
            "command": "bun /absolute/path/to/pre-tool-use.ts agy",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Timeouts are seconds, default 30. Lifecycle events (`SessionStart`,
`PreInvocation`, `PostInvocation`, `Stop`) take a direct handler list; tool events
take matcher groups containing `hooks`. `SessionStart` runs once per new
conversation; `PreInvocation` runs before every model call.

Inputs use camelCase: `conversationId`, `workspacePaths`, and for tool hooks
`toolCall.name` / `toolCall.args`. `run_command` uses `CommandLine` and `Cwd`.
Pre-tool argument replacement is `overwrite: { CommandLine: "..." }` together
with a native `decision`. Startup context uses
`injectSteps: [{ ephemeralMessage: "..." }]`; post-tool output is `{}`.
Absolute hook script paths avoid assuming an undocumented plugin working
directory or plugin-root interpolation variable. Configuration validation and
actual execution on each installed surface remain separate gates.

Sources: [plugins](https://antigravity.google/docs/plugins),
[hooks](https://antigravity.google/docs/hooks),
[skills](https://antigravity.google/docs/skills),
[MCP](https://antigravity.google/docs/mcp).
