---
name: bun-mcp-tools
description: "Which aphrody MCP tools (mcp__plugin_aphrody_aphrody__*) help on <bun>, verified 2026-10-08 — docs snapshot staleness, n2b compat drift, Context7 ids, upstream/github tool limits"
metadata:
 type: reference
---

All tools are deferred: load with `ToolSearch select:mcp__plugin_aphrody_aphrody__<name>...` first. Verified by real calls on 2026-10-08 (<bun> main = fe43d1d, 32 ahead / 0 behind local `upstream/main` 620b50f).

## Verdict table

| Tool | Use for Bun | Verified result / limits |
|---|---|---|
| `bun_docs_search` / `bun_docs_read` / `bun_docs_list` | Quick ranked lookup, `read` with `section` (heading substring) returns one section + full heading list; slug or bun.com/docs URL accepted | Serves a **stale snapshot** at `<aphrody>\docs\reference\upstream-bun` (aphrody commit e71772058, 2026-10-05), NOT `<bun>\docs`. Missing: all of `guides/` (`bun_docs_list guides/` → 0 pages, despite the description), `runtime/check`, `runtime/{node-api,web-apis,bun-apis,auto-install,code-generation-from-strings}`, `pm/cli/{install,audit}`, `pm/{isolated-installs,security-scanner-api}`, `test/reporters`, `project/{contributing,roadmap,benchmarking}`, `installation`. 27 pages differ (e.g. `bundler/index` and `test/index` lack `--check`/`check: true`). Identical: `runtime/bunfig`, `runtime/nodejs-compat`, `test/configuration`, `test/parallel`. Index is polluted by ~1900 `test/**` fixture .md files (e.g. `test/js/node/test/fixtures/doc_inc_1`, sinonjs MIGRATION_NOTES) that rank in results. Prefer reading `<bun>\docs\*.mdx` directly. |
| `bun_node_equivalent` | Node module / npm pkg / API regex → Bun equivalent + docs slugs (n2b registry) | **Compat data drifted from `docs/runtime/nodejs-compat.mdx`**: `vm` says missing `measureMemory` (docs: implemented); `child_process` says missing `ipc-handle` (docs: IPC can send net.Socket/Server/dgram handles); `worker_threads` lists `stdin/stdout/stderr`, `markAsUntransferable` (docs don't). `bun` field often empty for modules. Package mappings fine (`jest` → `bun:test`). Hints in French. Never cite it as compat truth for Bun PRs; use nodejs-compat.mdx + src/js/node. |
| `context7_resolve_library_id` / `context7_query_docs` | Best remote Bun docs | `/oven-sh/bun` (updated 2026-10-07, versions `bun-v1.4.0`, `bun-v1.4.2`) indexes repo docs incl. `runtime/check`, `guides/**`, CLAUDE.md, test/README — fresher than `bun_docs_*`. Others: `/websites/bun` (2026-09-11), `/llmstxt/bun_sh_llms-full_txt`, `/websites/bun_reference` (API ref, 2026-05). JSC: `/websites/webkit` returns webkit.org blog GC posts (WriteBarrier, Riptide, cellState) — conceptual only, no `DECLARE_VISIT_CHILDREN`/Bun bindings; use the `javascriptcore-garbage-collector` skill + `vendor/WebKit` for real API. Resolve output is huge (~30 libs). |
| `docs_auto_search` | Fused Context7 + MS Learn + GitHub | Bun query OK (resolves `/websites/bun`, not the fresher `/oven-sh/bun`). WebKit query mis-resolved to `/visit-dav/visit` + Playwright/wkhtmltopdf READMEs → useless for JSC. Output 50-55 KB always spills to a file. Call Context7 directly instead. |
| `github_status` | Branch, ahead/behind origin, dirty files, recent commits | Works on `repo_path: <bun>`; reports vs `origin/main` only (not upstream). |
| `github_branches` | — | **Unusable here**: dumps all 25 119 refs (12 657 `upstream/*`, 12 461 `origin/*`, 1 local) = 3.7 MB, no filter. Use `git rev-list --left-right --count upstream/main...main`. |
| `github_tree` | `git ls-tree` at any ref (e.g. `upstream/main`) without checkout | Directory path needs a **trailing slash** (`src/sema/`), else it returns the tree entry itself. Gives blob sizes/hashes. |
| `github_docs_search` | README/llms.txt of `oven-sh/bun` | Works (README excerpt, stars 96k) — little value over local repo. |
| `golang_scan` | Not relevant to `src/sema` (Rust port of typescript-go; `src/sema/lib.rs` names the source) | On tsgo.exe (`~\.bun\install\global\node_modules\@typescript\native-preview-win32-x64\lib\tsgo.exe`): `isGolang: true`, pclntab magic 0xFFFFFFF1, **0 symbols** — no help mapping Go functions. Read typescript-go source instead. |
| `n2b` (mode `scan`) | Read-only lint of TS scripts | Works (n2b 0.6.2, schema v2 = `aphrody_schema domain=n2b`). On `packages/bun-inspector-protocol`: suggests `ws`→`WebSocket`, `process.env`→`Bun.env`, tsconfig tweaks — false positives for packages that must also run on Node. Never run `fix`/`migrate` on <bun>. |
| `runtime_resolve` | Which system bun bootstraps the build | 2026-10-08: bun 1.4.2 at the WinGet link (purged since; now `~/.bun/bin/bun.exe` = fork release), `pin: null` (<bun> has no `.bun-version`), ffi available; uv 0.12.23, nu 0.116.0. |
| `compat_runtimes_status` | — | dotnet 10.0.401, pwsh 7.6.6; "wine_proton" reports cmd.exe. Irrelevant to Bun. |
| `coding_style_guide` | — | Topics: android_build, chromium_build_win, cpp, general, html, java, javascript, python, shell, typescript (`C++` rejected: `Unknown style-guide topic "C++"`). `cpp` returns the full Google C++ guide (214 KB, spills). Bun C++ follows WebKit style — not applicable. |
| `aphrody_capabilities` | — | Lists only aphrody-web tools (browser, search, crawl, X, Gemini, Google). Nothing Bun-specific. |
| `aphrody_schema` | `n2b` → N2bReport JSON Schema v2 | Works; `aphrody`/`all` would dump every tool schema. |
| `search_files` / `read_file` | — | Work (`\\?\` long paths, relative paths resolve against Desktop). No advantage over native Glob/Grep/Read. |

## New facts
- The snapshot's `APHRODY-FORK.md` describes a `bun:aphrody` module (`src/js/bun/aphrody.ts`, FFI to aphrody-ffi/n2b-native/oxc-bridge) and `origin = aphrody-code/bun`; neither the module nor the file exists in <bun> (origin is `aphrody-labs/bun`). Treat as stale/planned, see `bun-fork-aphrody`.
- Docs freshness ranking: `<bun>\docs` (last docs commit bd599f5af91, 2026-10-06) ≥ Context7 `/oven-sh/bun` (2026-10-07 index) > `bun_docs_*` snapshot (2026-10-05, partial) > `/websites/bun` (2026-09-11). Docs map: `bun-docs-map`.
