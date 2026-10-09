---
name: bun-graph-hotspots
description: "Upstream oven-sh/bun churn hotspots (files/dirs, last 30 days), commit cadence, who commits (robobun ~75%), commit-subject areas, and fork divergence as of 2026-10-08"
metadata:
 type: reference
---

Measured 2026-10-08 on local `upstream/main` (tip 620b50f6abe, 2026-10-08 00:29 -0700; not re-fetched). `aphrody git inspect` only reports branch/HEAD/remotes/dirty state (gix), no history, so churn came from `git log`.

**Cadence**: 452 commits in 30 days, 2 253 in 90 days (~25/day). Weekly (ISO): W33 200, W34 284, W35 196, W36 158, W37 119, W38 153, W39 124, W40 68 (slowing).
**Authors, 90 days**: robobun 1 718 (Bun's bot account; its squash commits carry structured "### Problem / ### Fix" bodies with file:line refs), Jarred Sumner 232, Dylan Conway 145, Alistair Smith 91, Ciro Spaciari 43, SUZUKI Sosuke 9; 30 days: robobun 340 / Dylan 48 / Jarred 44. Most upstream changes are narrow robobun fixes with tests; `git log --author=robobun --grep <symbol>` is a quick way to find the rationale behind a recent change.
**Subject prefixes, 30 days**: `node:` 59, `bundler:` 20, `tls:` 17, `fetch:` 14, `ci:` 14, `test:` 13, `build:` 12, `streams:` 10, `sql:` 10, `install:` 8; `bun check` work uses a backticked prefix (`` `bun check`: ``).

**Hot directories (file-touches, 30 days)**: src/jsc 656 (519 of them in `src/jsc/bindings` C++), scripts 343, src/sema 263, test/js/bun 261, test/js/node 229, src/runtime/webcore 177, src/js_parser 135, src/runtime/api 124, test/js/web 111, src/js/node 102, src/bundler 100, packages/bun-usockets 93, test/cli 92, src/js/internal 92, test/bundler 90, src/runtime/cli 86, src/runtime/shell 83, src/runtime/server 70, docs 67, src/runtime/node 62, src/runtime/socket 61, src/http 56, src/install 55, src/runtime/bake 54, packages/bun-uws 45, src/sql_jsc 44.

**Hot files (commits touching, 30 days)**: `src/jsc/VirtualMachine.rs` 20, `src/js/node/net.ts` 20, `scripts/build/deps/webkit.ts` 18 (WebKit bumps), `test/bundler/transpiler/react-compiler.test.ts` 17, `src/jsc/bindings/ZigGlobalObject.cpp` 17, `src/runtime/socket/socket_body.rs` 16, `src/js_parser/p.rs` 16, `src/runtime/jsc_hooks.rs` 15, `packages/bun-types/bun.d.ts` 15, `mordant-baseline.toml` 15, `src/runtime/server/RequestContext.rs` 14, `src/bundler/bundle_v2.rs` 14, `.github/workflows/rust-lints.yml` 13, `src/runtime/webcore/fetch/FetchTasklet.rs` 12, `src/runtime/webcore/Blob.rs` 12, `src/js_printer/lib.rs` 12, `scripts/build/CLAUDE.md` 12, `packages/bun-usockets/src/internal/internal.h` 12, `PostgresSQLConnection.rs` 11, `NodeHTTPResponse.rs` 11, `LinkerContext.rs` 11, `packages/bun-uws/src/HttpContext.h` 11, `packages/bun-usockets/src/crypto/openssl.c` 11.
- Merge-conflict risk for the fork concentrates on these files plus fork-touched ones (`src/runtime/cli/mod.rs`, `src/resolve_builtins/HardcodedModule.rs`, `src/js/bun/ffi.ts`, `scripts/build/*.ts`) — see `bun-fork-aphrody`.
- Networking is the busiest runtime area: net.ts + tls.ts + socket_body.rs + usockets/uWS C sources (`packages/bun-usockets`, `packages/bun-uws` are the in-repo C/C++ socket layer, not npm packages). See `bun-runtime-http-sql-valkey`, `bun-runtime-node-compat`.

**Fork divergence**: `git rev-list --left-right --count main...upstream/main` = 32 ahead / 0 behind; `main...origin/main` = 0/0 (pushed). Last upstream merge `faedc19e183` (2026-10-08 18:25). gix status at that moment showed uncommitted README edits (README.md and four packages/*/README.md), which `git status` also reported — another session's work in progress, not part of HEAD.

**External resources (aphrody awesome / docs)**: `aphrody awesome fetch bun` = oven-sh/awesome-bun, 90 items / 11 categories, all user-level (tutorials, boilerplates, plugins), nothing on internals; `awesome search` with internals/javascriptcore returns 0. `aphrody docs search "oven-sh/bun"` only returns the README. For internals the in-repo sources stay authoritative: `docs/`, `.claude/docs/landing-prs.md`, `REVIEW.md`, `scripts/build/CLAUDE.md` (see `bun-docs-map`, `bun-review-rules`).
