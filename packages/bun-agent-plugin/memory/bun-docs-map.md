---
name: bun-docs-map
description: "Map of <bun>\\docs (Mintlify site bun.com/docs) - docs.json nav tabs/groups, page locations, guides categories, install/quickstart facts, MDX conventions"
metadata:
 type: reference
---

# Bun docs map (`<bun>\docs`, published at http<bun>.com/docs)

Site = Mintlify (`docs.json`, theme `aspen`, primary color `#ff73a8`, lucide icons, code themes github-light/dracula
contextual menu `copy|view|claude|mcp|vscode`). `docs/README.md` points contributors to the Voice rules (`bun-docs-voice-contributing`).
`normalize-internal-links.js` strips `target`/`rel=noreferrer` from links to bun.com installation/reference/blog. `style.css`, `logo/`, `icons/`, `images/`.
`snippets/cli/*.mdx` = reusable `<ParamField>` flag tables (add, build, bunx, init, install, link, outdated, patch, publish, remove, run, test, update)
imported by pages (e.g. `runtime/index.mdx` does `import Run from "/snippets/cli/run.mdx"`). `snippets/guides.jsx` = `GuidesList` component (guides index hero + featured).
Only page not in nav: `runtime/typescript.mdx` (orphan). Nav has no dead links (checked 2026-10-08).
`packages/bun-types/scripts/build.ts` copies every `docs/**/*.{md,mdx}` into the published types package (replacing `$BUN_LATEST_VERSION`) - see `bun-packages`.

## Nav (docs.json `navigation.tabs`)
- **Runtime** tab
 - Get Started: index, installation, quickstart, typescript, typescript-6, runtime/templating/init, runtime/templating/create
 - Core Runtime: runtime/index (bun run), watch-mode, check, debugger, repl, bunfig, code-generation-from-strings
 - File & Module System: file-types, module-resolution, jsx, auto-install, plugins, file-system-router
 - HTTP server: runtime/http/{server,routing,cookies,tls,error-handling,metrics}
 - Networking: runtime/networking/fetch, runtime/http/websockets, networking/{tcp,udp,dns}
 - Data & Storage: cookies, file-io, streams, binary-data, archive, sql, sqlite, s3, redis
 - Concurrency: workers, module-graph
 - Process & System: environment-variables, shell, child-process, webview, cron
 - Interop & Tooling: node-api, ffi, c-compiler, transpiler
 - Utilities: csrf, secrets, console, toml, yaml, markdown, json5, xml, jsonl, html-rewriter, image, hashing, glob, semver, color, utils
 - Standards & Compatibility: globals, bun-apis, web-apis, nodejs-compat
 - Contributing: project/{roadmap,benchmarking,contributing,building-windows,bindgen,license}
- **Package Manager** tab: Core (pm/cli install/add/remove/update/dedupe/prune, pm/bunx); Publishing & Analysis (publish/outdated/why/audit/info);
 Workspace Mgmt (pm/workspaces, catalogs, cli/link, cli/pm); Advanced (cli/patch, filter, global-cache, global-store, isolated-installs, lockfile
 lifecycle, scopes-registries, overrides, security-scanner-api, npmrc)
- **Bundler** tab: bundler/index; Dev Server (fullstack, hot-reloading); Assets (html-static, standalone-html, css, loaders); executables;
 Extensions (plugins, macros); Optimization (bytecode, minifier); Migration (esbuild)
- **Test Runner** tab: test/index, writing-tests, configuration; runtime-behavior, discovery, parallel; lifecycle, mocks, snapshots, dates-times; dom; code-coverage, reporters
- **Guides** tab (~190 pages under `docs/guides/<cat>/`)
- External tabs: Reference -> http<bun>.com/reference, Blog -> http<bun>.com/blog; Feedback tab -> /feedback

Topic memories: `bun-docs-runtime-apis-a-m`, `bun-docs-runtime-apis-n-z`, `bun-docs-http-networking`, `bun-docs-bundler`
`bun-docs-pm`, `bun-docs-test`, `bun-docs-bunfig-env`.

## Guides categories (dir: count) and notable pages
- deployment (6): vercel, railway, render, aws-lambda, digital-ocean, google-cloud-run
- ecosystem (27): astro, discordjs, docker, drizzle, gel, elysia, express, hono, mongoose, neon-*, nextjs, nuxt, pm2, prisma(+postgres), qwik, react, remix, tanstack-start, sentry, solidstart, ssr-react, sveltekit, systemd, vite, upstash
- http (13): server, simple, fetch, hot, cluster (reusePort), tls, proxy, stream-file, file-uploads, fetch-unix, stream-iterator, sse, stream-node-streams-in-bun
- websocket (4): simple, pubsub, context, compression
- process (9): spawn, spawn-stdout/stderr, argv, stdin, ipc, ctrl-c, os-signals, nanoseconds
- runtime (21): typescript, tsconfig-paths, vscode-debugger, web-debugger, heap-snapshot, build-time-constants, define-constant, cicd, codesign-macos-executable, shell, timezone, set-env, read-env, import-{json,toml,yaml,json5,xml,html}, delete-file/directory
- install (17): add(-dev/-optional/-peer/-git/-tarball), npm-alias, workspaces, custom-registry, registry-scope, azure-artifacts, jfrog-artifactory, trusted, yarnlock, from-npm-install-to-bun-install, git-diff-bun-lockfile, cicd
- test (19): run-tests, watch-mode, migrate-from-jest, mock-functions, spy-on, mock-clock, snapshot, update-snapshots, coverage(-threshold), concurrent-test-glob, skip/todo, timeout, bail, rerun-each, testing-library, happy-dom, svelte-test
- util (19): upgrade, detect-bun, version, hash-a-password, javascript-uuid, base64, gzip, deflate, escape-html, deep-equals, sleep, file-url-to-path, path-to-file-url, which-path-to-executable-bin, import-meta-dir/file/path, entrypoint, main
- read-file (9), write-file (10), binary (22 conversion recipes), streams (12 to-X recipes), html-rewriter (2: extract-links, extract-social-meta)
Guide frontmatter: `title`, `sidebarTitle`, `mode: center`.

## MDX conventions
Components by frequency: `<ParamField path= type=>` (flag tables), `<Note>`, `<Tabs>/<Tab>`, `<CodeGroup>`, `<Frame>`, `<Accordion>`, `<Warning>`
`<Steps>/<Step>`, `<Info>`, `<Tip>`, `<Columns>`, `<CardGroup>/<Card>`, `<Callout>`. Code fences carry `title`/`icon` meta:
```` ```ts index.ts icon="/icons/typescript.svg" ````, ```` ```bash terminal icon="terminal" ````, ```` ```toml title="bunfig.toml" icon="settings" ````. Diff markers `// [!code ++]`.

## Installation facts (installation.mdx)
- Script: `curl -fsSL http<bun>.com/install | bash`; Windows `powershell -c "irm bun.sh/install.ps1|iex"`; `npm install -g bun`; `brew install oven-sh/bun/bun`; Scoop.
- Docker `oven/bun` (x64+arm64), tags `:debian :slim :distroless :alpine`; run with `--init --ulimit memlock=-1:-1`.
- Linux needs `unzip`; recommended kernel >= 5.6, runs down to 3.10 (RHEL 7) with degradation (README.md still says "minimum 5.1" - inconsistent).
- Windows >= 10 1809. macOS >= 13.0. glibc >= 2.17, else musl builds (`bun-linux-{x64,aarch64}-musl.zip`).
- x64 CPU: single binary targeting Nehalem (SSE4.2), runtime AVX2/AVX-512 dispatch; `-baseline` assets / `@oven/bun-*-x64-baseline` are kept only as aliases.
- `BUN_INSTALL` default `~/.bun`, binaries in `$BUN_INSTALL/bin`. `bun upgrade [--canary|--stable]` (canary = every main commit, auto-uploads crash reports). Homebrew/Scoop users upgrade via their manager.
- Specific version: `curl ... | bash -s "bun-v1.3.3"`; Windows `iex "& {$(irm http<bun>.com/install.ps1)} -Version 1.3.3"`. Verify: `bun --version`, `bun --revision`.
- Uninstall: `rm -rf ~/.bun`.

## Quickstart flow
`bun init my-app` -> template prompt Blank/React/Library; Blank creates `.gitignore`, `CLAUDE.md`, `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc -> CLAUDE.md`
`index.ts`, `tsconfig.json`, `README.md`. Then `Bun.serve({ port: 3000, routes: { "/": => new Response("Bun!") } })`, `server.url`; `bun add figlet`, `bun add -d @types/figlet`; then HTML import.
Recommended tsconfig for Bun: `lib ["ESNext"]`, `target ESNext`, `module Preserve`, `moduleDetection force`, `moduleResolution bundler`
`allowImportingTsExtensions`, `verbatimModuleSyntax`, `noEmit`. Missing `Bun` global types -> `bun add -d @aphrody/bun-types`.

## index.mdx pitch
Four pillars: Runtime (`bun run`, drop-in Node replacement), Package Manager (`bun install`, "up to 30x faster than npm"), Test Runner (`bun test`, Jest-compatible)
Bundler (`bun build`). Runtime page claim: JavaScriptCore + Rust; `bun hello.js` 5.2ms vs node 25.1ms on Linux; `npm run` ~170ms vs bun 6ms.
