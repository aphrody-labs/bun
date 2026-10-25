---
name: bun-fork-features
description: "What the Bun OS fork adds to upstream Bun (CLI, Bun.* APIs, bun:* modules, packages, MCP tools, skills, apps); read before saying Bun lacks a capability"
metadata:
  type: reference
---

Full catalog with owners and docs: `docs/runtime/fork-features.mdx` (site: /docs/runtime/fork-features), skill `bun-fork-features`. Verified from source: CLI dispatch `src/runtime/cli/mod.rs`, registry `src/resolve_builtins/HardcodedModule.rs`, `packages/*/package.json`, diff against the upstream merge base. Search it, then `rg` the owner, before adding a dependency or a script.

## CLI (beyond upstream run/test/build/install/pm)

- Quality: `bun check` (typescript-go port, `src/sema`), `bun lint` (`src/quality`, `src/lint`), `bun fmt`, `bun n2b` and `bun migrate` (`src/migrate`), `bun wasm build`, `bun rename`, `bun docs`, `bun parse`, `bun bench`.
- Agents: `bun mcp` (`src/mcp`), `bun agent-plugin`, `bun lsp` (`src/lsp`), `bun just`, `bun video`.
- Configuration and sessions: `bun env` (`.env` files: list/get/set/unset/check/files, secrets masked), `bun cookie` (cookie jars: import/list/get/header/rm/check), both in `src/env_cookie`.
- Hosts and network: `bun ssh` (plugin, aphrody-labs/bun-ssh), `bun docker` (plugin, aphrody-labs/bun-docker), `bun vpn` (plugin, aphrody-labs/bun-vpn, embedded Mullvad), `bun host` (resource registry), `bun git|rclone|rsync` (pinned tools, `rsync --native`), `bun search` (Google).
- Platform: `bun msvc`, `bun winmd`, `bun dotnet`, `bun python`, `bun uv`, `bunsh` (Bun Shell as system shell), coreutils applets (`src/coreutils`).
- Config: `bun env`, `bun cookie` (`src/env_cookie`).
- Build: `bun bd` (`scripts/build.ts`), `bun factory` (`scripts/factory/factory.ts`, VPS slots).

## APIs and modules

- `Bun.Video`, `Bun.HTML`, `Bun.BrowserRealm`, `Bun.Crawl`, `Bun.Curl`, `Bun.WebDetect`, `Bun.VectorIndex`, `Bun.Terminal`/`Bun.TerminalScreen`, `Bun.Archive` (tar/zip).
- Fork-only `bun:*`: yolo, graph (+index, native, graphx), python, dotnet, windows, winrt, winui, linux, cosmic, nginx, chromium, google, adblock, privacy, rio, obscura, wasm, vitest.

## Agent surface

- MCP tools: read/write/edit_file, vfs_find/grep/edit/apply, deps_*, git_ingest, lsp_*, graph_*, docs_*, examples_search, skills_list/skill_read, run/test/shell, html_parse/css_parse, memory_*, host_inventory/host_find, yolo_decide.
- Skills: sources in `.claude/skills`; generated ones come from `src/agent_tools/skills.json` via `src/codegen/generate-agent-tools.ts` (never hand-edit them).

## Packages and apps

Add-ons (own repositories, optional submodules, skill `bun-add-ons`): plugins uv, vpn, ssh, docker, just, winmd (`plugins/<name>`, fetched on first use) and Bun Video (`packages/bun-video`, aphrody-labs/bun-video). `packages/`: bun-types, bun-agent-plugin, bun-web (+webview-core/page), bun-chromium, bun-google, bun-cloudflare, bun-next, bun-plugin-{tailwind,svelte,yaml,neon,supabase}, bun-oxc, bun-n2b, bun-dotnet, bun-python-*, buv, bun-runtime-sdk, bun-llama, bun-nginx, bun-supervisor, bun-tools, bun-timeline, bun-x, bun-qr, bun-fuzzy, bun-fluent, bun-icons, bun-m3, web. Apps: self-hosted `aphrody` server (`packages/web/server`).

## Generated surfaces

README.md: `scripts/aphrody/release-surfaces.ts`. llms.txt and llms-full.txt: `packages/web/site/build.ts` from `docs/` and `docs/docs.json`. Edit the sources, never the outputs.
