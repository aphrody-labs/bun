# Upstream extraction matrix

Snapshot: 2026-10-28. This matrix is a migration worklist, not a publication or compatibility receipt. The canonical distribution owner is `aphrody-labs/bun-os`; this checkout owns the historical fork and its source evidence. `moved` below is the existing inventory state and means only that a destination was recorded.

The recorded upstream baseline commit `38afee6c84fcf48c0edb2466aa4b27d287a59c30` exists locally and is an ancestor of fork HEAD `02a19cdde9f7e13aa9961e440c4770933fb28141`; their committed diff contains 34,084 paths, including upstream updates and generated or vendored content. Git skipped exhaustive rename detection, so this count is not an ownership classification. The upstream clone is newer; the worktree also contains uncommitted edits. The matrix is therefore a catalog-based starting point, not an exhaustive attribution of all changed paths.

## Recorded components

| Component | Source paths in inventory | Mount | Recorded destination | State |
| --- | --- | --- | --- | --- |
| uv | src/plugins/uv, vendor/uv | plugins/uv | https://github.com/aphrody-labs/bun-uv | moved |
| vpn | src/plugins/vpn, src/bun_vpn, vendor/mullvad | plugins/vpn | https://github.com/aphrody-labs/bun-vpn | moved |
| ssh | src/plugins/ssh, src/ssh, vendor/russh-sftp | plugins/ssh | https://github.com/aphrody-labs/bun-ssh | moved |
| docker | src/plugins/docker, src/docker | plugins/docker | https://github.com/aphrody-labs/bun-docker | moved |
| just | src/plugins/just, src/just | plugins/just | https://github.com/aphrody-labs/bun-just | moved |
| winmd | src/plugins/winmd | plugins/winmd | https://github.com/aphrody-labs/bun-winmd | moved |
| bun-video | packages/bun-video | packages/bun-video | https://github.com/aphrody-labs/bun-video | moved |
| filmcraft | src/media/filmcraft |  | https://github.com/aphrody-labs/filmcraft | moved |
| pyjs | packages/buv, packages/bun-python-native, packages/bun-python-toolchain, packages/bun-python-conformance | packages/bun-python | https://github.com/aphrody-labs/bun-python | moved |
| ui-web | packages/bun-m3, packages/bun-plugin-tailwind, packages/bun-next, packages/web, packages/bun-web, packages/bun-webview-page, packages/bun-fluent, packages/bun-icons | packages/bun-ui | https://github.com/aphrody-labs/bun-ui | moved |
| bun-llama | packages/bun-llama |  | https://github.com/aphrody-labs/bun-llama | moved |
| bun-qr | packages/bun-qr |  | https://github.com/aphrody-labs/bun-qr | moved |
| bun-timeline | packages/bun-timeline |  | https://github.com/aphrody-labs/bun-timeline | moved |
| packages-misc | packages/bun-google, packages/bun-x, packages/bun-fuzzy, packages/bun-cloudflare, packages/bun-chromium, packages/bun-nginx, packages/bun-supervisor, packages/bun-tools, packages/bun-winsvc, packages/bun-cosmic, packages/bun-oxc, packages/bun-n2b, packages/bun-dotnet, packages/bun-webview-core, packages/aphrody-pkg-system |  |  | pending |
| distribution | factory, patches/chromium, docs/chromium, scripts/aphrody/alpine |  |  | stays |
| bun_quality | src/quality |  |  | stays |
| bun_lint | src/lint |  |  | stays |
| bun_sema | src/sema |  |  | stays |
| bun_react_compiler | src/react_compiler |  |  | stays |
| bun_migrate | src/migrate |  |  | stays |
| rio (runtime graph) | src/rio |  |  | stays |
| browser (runtime graph) | src/browser |  |  | stays |
| bun:winui / bun:windows | src/runtime/windows |  |  | stays |
| curl-upstream | vendor/curl |  |  | moved |

## Package manifests found

A name and version are declarations, not proof of npm publication or upstream compatibility. Nested submodule manifests are not enumerated here.

| Path | Package | Version | Private |
| --- | --- | --- | --- |
| packages/bun-agent-plugin | bun-agent-plugin | 1.4.7 | False |
| packages/bun-build-mdx-rs | @aphrody/bun-mdx-rs | 1.4.7 | False |
| packages/bun-chromium | @aphrody/bun-chromium | 1.4.7 | False |
| packages/bun-cloudflare | @aphrody/bun-cloudflare | 1.4.7 | False |
| packages/bun-debug-adapter-protocol | @aphrody/bun-debug-adapter-protocol | 1.4.7 | False |
| packages/bun-dotnet | @aphrody/bun-dotnet | 1.4.7 | False |
| packages/bun-error | bun-error | 1.4.7 | True |
| packages/bun-fuzzy | @aphrody/fuzzy | 1.4.7 | False |
| packages/bun-google | @aphrody/bun-google | 1.4.7 | False |
| packages/bun-inspector-frontend | @aphrody/web-inspector-bun | 1.4.7 | False |
| packages/bun-inspector-protocol | @aphrody/bun-inspector-protocol | 1.4.7 | False |
| packages/bun-lambda | bun-lambda | 1.4.7 | True |
| packages/bun-n2b | bun-plugin-n2b | 1.4.7 | False |
| packages/bun-nginx | @aphrody/bun-nginx | 1.4.7 | False |
| packages/bun-oxc | bun-plugin-oxc | 1.4.7 | False |
| packages/bun-plugin-svelte | @aphrody/bun-plugin-svelte | 1.4.7 | False |
| packages/bun-plugin-yaml | @aphrody/bun-plugin-yaml | 1.4.7 | False |
| packages/bun-release | bun-release-action | 1.4.7 | True |
| packages/bun-runtime-sdk | @aphrody/bun-runtime-sdk | 1.4.11 | False |
| packages/bun-sql | @aphrody/bun-sql | 1.4.7 | False |
| packages/bun-supervisor | @aphrody/supervisor | 1.4.7 | False |
| packages/bun-tools | @aphrody/bun-tools | 1.4.7 | False |
| packages/bun-types | @aphrody/bun-types | 1.4.7 | False |
| packages/bun-video | @aphrody/bun-video | 1.4.4-video.6 | False |
| packages/bun-vscode | bun-vscode | 1.4.7 | False |
| packages/bun-x | @aphrody/x | 1.4.7 | False |

## Fork surface inventory

The following rows are reproduced from `docs/runtime/fork-features.mdx`; the owners there are source evidence, not proof that the latest upstream canary lacks the same feature. Reconcile each against current upstream and the changed working tree before extraction.

## CLI commands

Upstream commands (`run`, `test`, `build`, `install`, `add`, `remove`, `update`, `audit`, `outdated`, `link`, `publish`, `patch`, `pm`, `init`, `create`, `x`/`bunx`, `repl`, `upgrade`, `why`, `info`) keep their behavior. The fork adds or replaces the following.

| Command                                | What it does                                                                                                                                                           | Owner and docs                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bun check`                            | Native TypeScript type checker (port of typescript-go, `bun_sema`); `--check` on `bun run` type checks before running                                                  | `src/sema`, [TypeScript](/typescript)                                                                                    |
| `bun lint`                             | Native lint engine with lint-rule plugins and rule docs                                                                                                                | `src/quality`, `src/lint`, [Lint](/lint/index), [plugins](/lint/plugins)                                                 |
| `bun fmt`                              | Native formatter                                                                                                                                                       | `src/quality`, [Format](/format/index)                                                                                   |
| `bun n2b` / `bun migrate`              | Scan, rewrite and migrate Node.js projects to Bun; `n2b` plugin for load and build time                                                                                | `src/migrate`, `packages/bun-n2b`, [n2b](/runtime/n2b)                                                                   |
| `bun wasm build <crate>`               | Build a Rust crate into a WebAssembly ES module; `bun build --target=wasm`                                                                                             | `src/runtime/cli/toolchain_command.rs`, `src/wasm`                                                                       |
| `bun rename --from a --to b`           | Rename identifiers and paths across a git repository                                                                                                                   | `src/runtime/cli/devtools_command.rs`                                                                                    |
| `bun docs [query]`                     | Search the embedded Bun documentation                                                                                                                                  | `devtools_command.rs`                                                                                                    |
| `bun parse <file...>`                  | Lines, bytes, hash, imports and exports of JS/TS files from the transpiler scan                                                                                        | `devtools_command.rs`                                                                                                    |
| `bun bench`                            | Benchmark helper of the devtools set                                                                                                                                   | `devtools_command.rs`                                                                                                    |
| `bun video metadata \| frame`          | Native video metadata, frames, audio, GIF and MP4 remux                                                                                                                | `video_command.rs`, [Video](/runtime/video)                                                                              |
| `bun just [recipe]`                    | Run justfile recipes (`just`, the `just` plugin)                                                                                                                       | `plugins/just` (aphrody-labs/bun-just), [just](/runtime/just)                                                            |
| `bun mcp [install]`                    | Model Context Protocol server for coding agents (stdio and HTTP)                                                                                                       | `src/mcp`, [mcp](/runtime/mcp), [agent tools](/project/agent-tools)                                                      |
| `bun agent-plugin [install]`           | Install the plugin into Claude Code, Codex, Antigravity, Gemini CLI and OpenCode                                                                                       | `packages/bun-agent-plugin`, [agent plugin](/project/agent-plugin)                                                       |
| `bun lsp [query]`                      | One language server for TypeScript, JavaScript, Python, Rust, C, C++ and C#                                                                                            | `src/lsp`, [lsp](/runtime/lsp)                                                                                           |
| `bun ssh <host> [command]`             | SSH client, copy, forwards, server and connection pool, via system OpenSSH or the built-in client                                                                      | `plugins/ssh` (aphrody-labs/bun-ssh), [ssh](/runtime/ssh)                                                                |
| `bun git`, `bun rclone`, `bun rsync`   | Pinned installed tools; `bun rsync --native` uses the built-in delta copy                                                                                              | `tools_command.rs`, `packages/bun-tools`                                                                                 |
| `bun docker`                           | Native Docker Engine client (`version`, `info`, `ps`, `images`, `start`, `stop`; plan unless `--apply`)                                                                | `plugins/docker` (aphrody-labs/bun-docker)                                                                               |
| `bun vpn`                              | Mullvad VPN (the `vpn` plugin): `daemon`, `status`, `connect`, `disconnect`, `login --stdin` and `login --from-env NAME`                                               | `plugins/vpn` (aphrody-labs/bun-vpn), [vpn](/vpn/index)                                                                  |
| `bun host`                             | Resource inventory of a machine and a signed registry shared between machines: `collect`, `schema`, `push`, `sync`, `list`, `find`                                     | `src/host`, [host](/runtime/host)                                                                                        |
| `bun msvc`                             | Resolve and cache Visual Studio, MSVC and the Windows SDK; cross-compile for Windows                                                                                   | `msvc_command.rs`, [msvc](/runtime/msvc)                                                                                 |
| `bun winmd`                            | Generate Rust or `bun:ffi` bindings from Windows metadata (the `winmd` plugin)                                                                                         | `winmd_command.rs`, `plugins/winmd` (aphrody-labs/bun-winmd), [msvc](/runtime/msvc)                                      |
| `bun dotnet`                           | Run the .NET SDK inside Bun, run C# files, call assemblies from `bun:dotnet`                                                                                           | `dotnet_command.rs`, [dotnet](/runtime/dotnet)                                                                           |
| `bun python`, `bun uv`                 | CPython host, `bun compile` for Python, UV package manager (the `uv` plugin)                                                                                           | `python_command.rs`, `uv_command.rs`, `plugins/uv` (aphrody-labs/bun-uv), [python](/runtime/python), [buv](/runtime/buv) |
| `bun plugin list \| install \| remove` | Plugins: cold subsystems built as separate `bun-<name>` executables, fetched on first use from the release of the running bun and checked against its `SHA256SUMS.txt` | `plugin_command.rs`, `scripts/build/plugins.ts`, [plugins](/runtime/bun-plugin)                                          |
| `bun search`                           | Google search owner (SERP, discovery, cache, browser fallback)                                                                                                         | `search_command.rs`, `src/google`, `packages/bun-google`                                                                 |
| `bun env`, `bun cookie`                | `.env` files (`list`, `get`, `set`, `unset`, `check`, `files`; secrets hidden) and cookie jars (`import`, `jars`, `list`, `get`, `header`, `rm`, `check`)              | `env_command.rs`, `cookie_command.rs`, `src/env_cookie`, [bun env](/runtime/bun-env), [bun cookie](/runtime/bun-cookie)  |
| `bunsh` (argv0)                        | Bun Shell as a system shell: `-c`, script, interactive, `--root`                                                                                                       | `src/runtime/cli/bunsh.rs`                                                                                               |
| Coreutils applets                      | uutils coreutils linked in; `bun` run under an applet name (`head`, `sort`, ...) runs that utility, Bun Shell uses them                                                | `src/coreutils`                                                                                                          |
| `bun bd`, `bun factory`                | Build the checkout (`bun bd [command]`), drive the VPS build factory (`sync`, `gen`, `build`, `all`, `slots`, `run -- <cmd>`)                                          | `scripts/build.ts`, `scripts/factory/factory.ts`, VPS factory                                                            |

## Bun APIs added to the `Bun` global

Upstream APIs are in [Bun APIs](/runtime/bun-apis). The fork adds:

| API                                  | Purpose                                                                                  | Docs                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| `Bun.Video`                          | Metadata, frames, audio, GIF, MP4 remux, with the [`Bun.Image`](/runtime/image) pipeline | [video](/runtime/video)               |
| `Bun.HTML`                           | Native HTML parser, CSS parser, readability and structured extraction                    | [readability](/runtime/readability)   |
| `Bun.BrowserRealm`                   | DOM realm over a parsed HTML document                                                    | `packages/bun-types/bun.d.ts`         |
| `Bun.Crawl`, `Bun.Curl`              | Native crawler and curl-style client                                                     | `packages/bun-types/bun.d.ts`         |
| `Bun.WebDetect`                      | Offline technology and anti-bot detection of a fetched response; SSRF deny-set           | [web-detect](/runtime/web-detect)     |
| `Bun.VectorIndex`                    | Persistent native vector search with filtered nearest neighbors                          | [vector-index](/runtime/vector-index) |
| `Bun.Terminal`, `Bun.TerminalScreen` | Interactive processes and a headless VT screen (cell grid, scrollback)                   | [terminal](/runtime/terminal)         |
| `Bun.Archive`                        | tar and zip input and output                                                             | `packages/bun-types/bun.d.ts`         |

## Built-in modules (`bun:*`)

Fork-only modules, from the module registry diffed against upstream.

| Module                                                           | Purpose                                                                                     | Docs                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bun:yolo`                                                       | Typed judgments: yes/no, choice and score with confidence and abstention                    | [yolo](/runtime/yolo), [decisions](/runtime/decisions)                        |
| `bun:graph`, `bun:graph-index`, `bun:graph-native`, `bun:graphx` | Code graphs of Rust, TypeScript, JavaScript and Markdown                                    | [graph](/runtime/graph)                                                       |
| `bun:python`                                                     | Embed CPython in the JavaScript process                                                     | [python](/runtime/python)                                                     |
| `bun:dotnet`                                                     | Call .NET assemblies                                                                        | [dotnet](/runtime/dotnet)                                                     |
| `bun:windows`, `bun:winrt`, `bun:winui`                          | Win32/COM/NT, WinRT projections, native WinUI 3 windows with Fluent 2 tokens                | [windows](/runtime/windows), [winrt](/runtime/winrt), [winui](/runtime/winui) |
| `bun:linux`                                                      | Namespaces, cgroups, seccomp, io_uring, eBPF, netlink, perf_event                           | [linux](/runtime/linux)                                                       |
| `bun:cosmic`                                                     | COSMIC desktop and text stack                                                               | [cosmic](/runtime/cosmic)                                                     |
| `bun:nginx`                                                      | Validate, start, reload and stop a pinned NGINX                                             | [nginx](/runtime/nginx)                                                       |
| `bun:chromium`                                                   | Chromium and Chrome CDP                                                                     | `packages/bun-chromium`                                                       |
| `bun:google`                                                     | Google search and project contract                                                          | `packages/bun-google`                                                         |
| `bun:adblock`                                                    | Brave adblock-rust engine, `attachWebView`                                                  | [adblock](/runtime/adblock)                                                   |
| `bun:privacy`                                                    | STAR, Privacy Pass, OPAQUE                                                                  | [privacy](/runtime/privacy)                                                   |
| `bun:rio`                                                        | Rio-backed virtual terminal screen (`Bun.RioTerminal`)                                      | `packages/bun-types/rio.d.ts`, `src/rio`                                      |
| `bun:obscura`                                                    | Chromium launcher sharing the `bun:chromium` owner                                          | `packages/bun-types/obscura.d.ts`                                             |
| `bun:wasm`                                                       | WebAssembly surface of the Rust crates                                                      | `src/wasm`                                                                    |
| `bun:vitest`                                                     | Vitest compatibility for `bun test`                                                         | `packages/bun-types`                                                          |
| `bun:fetch`                                                      | HTTP fetch with browser request headers; reports Cloudflare challenges without solving them | `src/js/bun/fetch.ts`                                                         |

## Packages

Directory `packages/` (scope `@aphrody` unless noted).

| Package                                                                                            | Purpose                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bun-types`                                                                                        | Type definitions, including every fork module                                                                          |
| `bun-agent-plugin`                                                                                 | Plugin for Claude Code, Codex, Antigravity, Gemini CLI, OpenCode and local harnesses: MCP, hooks, skills, memory       |
| `bun-video` (submodule)                                                                            | Video protocols, native capture, Remotion and HyperFrames, WebGPU compute (`bun-video-webgpu`); aphrody-labs/bun-video |
| `bun-web`, `bun-webview-core`, `bun-webview-page`                                                  | Browser SDK over `Bun.WebView`, Playwright-shaped pages and locators, web service (fetch, scrape, crawl)               |
| `bun-chromium`, `bun-google`                                                                       | Chromium and Chrome CDP SDK; Google REST and Cloud Code SDK                                                            |
| `bun-cloudflare`                                                                                   | Workers with bindings, REST API, Wrangler                                                                              |
| `bun-next`                                                                                         | Next.js on Bun, App Router on `Bun.build` and `Bun.serve`                                                              |
| `bun-plugin-tailwind`, `bun-plugin-svelte`, `bun-plugin-yaml`, `bun-icons`, `bun-fluent`, `bun-m3` | Build plugins, Fluent 2 tokens, Material 3 preset                                                                      |
| `bun-sql`                                                                                          | Postgres clients and migrations on `Bun.SQL`                                                                           |
| `bun-oxc`                                                                                          | Oxc parser, transformer, minifier, resolver, oxlint and oxfmt                                                          |
| `bun-n2b`                                                                                          | Node.js to Bun migration plugin and CLI                                                                                |
| `bun-dotnet`, `bun-dotnet-native`, `bun-winsvc`                                                    | .NET payload, Windows service host                                                                                     |
| `bun-python-toolchain`, `bun-python-native`, `bun-python-conformance`, `buv`, `bun-runtime-sdk`    | Python, UV and PyJS runtime and C ABI                                                                                  |
| `bun-llama`                                                                                        | llama.cpp through `bun:ffi`                                                                                            |
| `bun-nginx`                                                                                        | Typed NGINX controller                                                                                                 |
| `bun-supervisor`, `bun-tools`, `bun-timeline`                                                      | Process supervision, native tool distribution and metadata, timeline projections                                       |
| `bun-x`, `bun-qr`, `bun-fuzzy`                                                                     | X client and tools, QR encoder, Bitap fuzzy search                                                                     |
| `web`                                                                                              | bun.aphrody.app site, Cloudflare Worker and the self-hosted server ([aphrody-server](/project/aphrody-server))         |
| `aphrody-migrated`, `aphrody-pkg-system`                                                           | Migrated Aphrody sources and package system                                                                            |

## Native crates

Fork crates under `src/`: `adblock`, `agent_tools`, `browser`, `bun-os`, `coreutils`, `cosmic`, `env_cookie`, `file_tools`, `google`, `graph`, `host`, `lint`, `lsp`, `mcp`, `migrate`, `no_window`, `privacy`, `quality`, `react_compiler`, `readability`, `rio`, `sema`, `text_diff`, `vfs`, `vt`, `wasm`, `workflow`, `workspace`, `x`. Plugin crates `aphrody-bun-native-plugin` and `aphrody-bun-macro`, and `crates/aphrody-jev`, are published separately.


## Extraction and publication gates

- Reconcile the entire source diff against the selected upstream commit and include uncommitted work before assigning ownership. The previous local tag is not currently resolvable; the separate upstream checkout is at 11c367163a4baa77d3627d14764c376c856a630a.
- Preserve each component history and existing concurrent edits. Move an owner only after its repository, license, dependencies and target matrix are known.
- Rust plugins still path-depend on shared checkout crates; docker also depends on ssh, and winmd depends on find-msvc-tools. Separate those dependencies and the fork CLI loader before claiming standalone operation.
- Native Bun global and `bun:*` integrations depend on JavaScriptCore bindings and runtime internals. Design public package or native bridge APIs, preserve behavior and qualify each supported platform; a renamed import is not sufficient.
- Publish packages and release assets only after source, license, version, checksums, install paths and reproducible qualification are verified. Then pin each public repository in Bun OS and validate installation from a clean checkout.
- Track MCP/LSP, factory, services, CI, documentation, agents and consumers with each owner. Do not remove the historical runtime path until replacements cover its required behavior.

Machine-readable source: `docs/project/fork-inventory.json`. A local snapshot of manifests is in `var/reports/upstream-extraction-20261028/inventory.json`.
