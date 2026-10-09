---
name: bun-fork-aphrody
description: "<bun> is the aphrody-labs/bun fork of oven-sh/bun — remotes, fork-only patches, sync workflow"
metadata:
 type: project
---

`<bun>` = fork `aphrody-labs/bun` (origin) of `oven-sh/bun` (upstream). Branch `main`, synced via merge commits "Merge remote-tracking branch 'upstream/main'". As of 2026-10-08: 31 commits ahead, ~53 files, +1607/-250 vs upstream/main.

Fork-only patches (keep them when merging upstream):
- **Built-in replacements of npm packages** in `src/js/thirdparty/`: `dotenv.ts` (+ `dotenv/config.ts`, logic in `src/js/internal/dotenv.ts`), `picocolors.ts`, `tiny-invariant.ts`, `uuid.ts`; registered in `src/resolve_builtins/HardcodedModule.rs`. Tests: `test/js/first_party/{dotenv,picocolors,tiny-invariant,uuid}/`.
- **bun:ffi `dlopen(path, symbols, { global })`** → RTLD_NOW|RTLD_GLOBAL: `src/js/bun/ffi.ts`, `src/runtime/ffi/{FFIObject.rs,ffi_body.rs}`, `src/sys/lib.rs`, `packages/bun-types/ffi.d.ts`; test `test/js/first_party/runtime/dlopen-global.test.ts`.
- **argv0 aliasing**: a compiled executable (`--compile`) linked/renamed as `bun`, `bunx` or `node` acts as the engine itself — `src/runtime/cli/mod.rs`; test `test/js/first_party/runtime/argv0-bun-alias.test.ts`.
- **Rust native link propagation** (Linux linker gets Rust native deps): `scripts/build/rust/native-link.ts`, `scripts/build/{rust,bun,ninja,timings}.ts`; test `test/internal/build-rust-native-link.test.ts`.
- **Windows build**: `scripts/vs-shell.ps1` finds a Build Tools-only Visual Studio install.
- **Types**: `packages/bun-types/tauri.d.ts` (Tauri-aware), npm packages renamed to `@aphrody/*` scope (@aphrody/bun-types, inspector-protocol, plugins, mdx-rs…); `src/js/tsconfig.json` and `test/tsconfig.json` pin in-repo @aphrody/bun-types/@types/node when nested in another checkout.
- Lint: oxlint errors cleared in `src/js`.

## Release / distribution of the runtime binary (verified 2026-10-08)
- Workflow `.github/workflows/aphrody-release.yml` (fork-only; `workflow_dispatch` inputs `version`, `targets`, `lto` off|on, `publish-npm`, `publish-only`; or tag push `aphrody-v*`). Jobs: prepare (version + dynamic matrix) → build per target → release → npm.
- Targets on GitHub-hosted runners, `bun scripts/build.ts --profile=release --lto=off --canary=off` (mac `-j2`), no sysroot, no `--ci`: linux-x64 `ubuntu-24.04`, linux-aarch64 `ubuntu-24.04-arm` (apt.llvm.org `llvm.sh 23 all` + cmake ccache nasm), darwin-aarch64 `macos-15` (`brew install llvm@23`), windows-x64 `windows-2025` (VS 2026 found by vs-shell.ps1; LLVM from `clang+llvm-23.1.1-x86_64-pc-windows-msvc.tar.xz` + `BUN_TOOLCHAIN_LLVM` — there is NO `LLVM-x-win64.exe` asset, only `.msi`/tarballs; choco nasm; `<Strawberry>\c\bin` dropped from PATH). ccache cached via actions/cache under `$RUNNER_TEMP/bun-build-cache` (BUN_BUILD_CACHE_DIR). Each build took ~10-20 min (first run 37844015042, all 4 green).
- Assets = upstream names: `bun-<os>-<arch>.zip` (`<triplet>/bun[.exe]`) + `-profile.zip` + `SHA256SUMS.txt`, release `aphrody-v<version>`; re-runs upload with `--clobber` and regenerate sums.
- Version `<package.json version>-aphrody.<n>` (first: 1.4.3-aphrody.1); the binary itself reports `bun --version` = 1.4.3, `--revision` = 1.4.3+<fork sha>.
- Limits: linux binaries need glibc >= 2.38 (built on ubuntu 24.04 host, not upstream's glibc 2.31 sysroot); no LTO; no musl/darwin-x64/windows-arm64/baseline aliases; npm CDN may lag a few minutes after publish (bunx then skips the optional dep → "no binary for <platform>"); on Windows without node, running `node_modules/.bin/bun.exe` shim directly recurses (shim's node→bun fallback finds the `.bin/bun.exe` shim) — `bunx`/`npm i -g` fine. Local Windows fallback: `bun scripts/build.ts --profile=release --lto=off --canary=off` (needs perl on PATH, e.g. Git usr/bin appended) then `gh release upload`.

**Why:** the fork carries Aphrody runtime patches on top of upstream.
**2026-10-09 : drift upstream assumé** : la synchro ci-dessous est opportuniste, les fichiers amont se modifient librement et un conflit se résout en gardant notre version.
**How to apply:** sync upstream with `bun scripts/aphrody/sync-upstream.ts [--push] [--dry-run] [--keep-conflicts]` (rename-aware 3-way merge: conflicts that differ only by the @aphrody rename auto-resolve; real conflicts abort, exit 2). The package map + idempotent rewrite live in `scripts/aphrody/scope.ts` (`--check`/`--write`; packages/** only — runtime `bun init`/`bun check`, docs/ and test fixtures keep real npm names; registry deps and lockfiles untouched; prose lines mentioning "upstream" kept). Test: `bun test test/internal/aphrody-upstream-sync.test.ts`. Workflow `.github/workflows/aphrody-upstream-sync.yml` runs it every 6 h (needs secret APHRODY_SYNC_TOKEN with `workflow` scope when upstream touches workflows). Then re-check the files above; commit as aphrody-dev, no AI attribution, push to origin main directly (user rule). Fork-specific tests live under `test/js/first_party/`. See `bun-review-rules`, `bun-build-commands`.

**Manual sync equivalent** (ex bun-skills-fork-workflow; merge only, never rebase/force-push): `git fetch upstream && git merge upstream/main` on `main` → resolve keeping fork patches (lockfiles: upstream then `bun install`) → qualify `bun bd`, `bun bd test test/js/first_party/` + `test/internal/build-rust-native-link.test.ts`, platform-gated Rust `bun run rust:check-all` → commit as aphrody-dev without AI attribution, `git push origin main`. Upstream-maintainer flows `/upgrade-webkit` (pushes oven-sh/WebKit) and `/upgrade-boringssl` (pushes oven-sh/boringssl) do not apply: from the fork only bump pins to already-published artifacts (`WEBKIT_VERSION`, `BORINGSSL_COMMIT`, `bun-build-deps-vendor`) or use aphrody-labs/WebKit .

## crates.io (2026-10-08)


**Aphrody docs about Bun (2026-10-09, aphrody 8c13ad714):** canonical page `<aphrody>\docs/reference/upstream-bun/APHRODY-FORK.md` (BUN_FORK.md merged into it; kept by `bun-upstream-docs.ts` KEEP). Only Bun docs copy = `docs/reference/upstream-bun` (`bun run docs:bun:update|check`); `n2b/bun` copies, `packages/infra/workspace/docs/bun` + `bun-docs.ts`, fusion/drive plans, crates deep-dives deleted. Root CLAUDE.md/AGENTS.md carry a "Bun is our fork" paragraph. Doc gates: `bun run docs:gen`, `docs:check`, `docs:check-links` (inline `` `path` (not in repo)`` marks external paths).

## Noyau d'aphrody (2026-10-09)
The fork is the only Bun of the Aphrody monorepo (<aphrody>); fork-side summary in `APHRODY.md` (commit 4e187a0e8a4), shared multi-agent plan in `PLAN.md` (chantier F = this integration).
- `<aphrody>\patches\bun\0001..0009` (tauri.d.ts, @aphrody rename, native-link, thirdparty dotenv/picocolors/tiny-invariant/uuid, bun.lock.claude unrestricted, dlopen global + argv0, cloud-ssh x2) were all already commits of fork `main` → deleted (swept into aphrody commit e3aa1d730 by another agent; follow-up 99eda6f67). No patch queue remains in aphrody.
- Deleted from aphrody (99eda6f67, 71cf2bb22): `scripts/tools/vendor/{bun_upstream_sync,bun_upstream_tracker,packages_upstream_sync}.ts` (sync = fork's `scripts/aphrody/sync-upstream.ts` + 6-h workflow only), the `bun` entry of `tools/config/vendor.json` (no `vendor/bun`; only deno remains), `crates/compat/bun-bridge` (aphrody-bun-bridge: Rust re-implementations of Bun.$/wyhash/semver/glob/dotenv/base64/valkey; consumers n2b-core, discord, aphrody-ffi, aphrody-command switched off it; `aphrody shell bun` / `shell eval --bun` now spawn `bun exec`).
- Pins: `tools/config/update/pins.json` bun `latest` = GitHub releases of aphrody-labs/bun, stripTag `^aphrody-v|-aphrody[.][0-9]+$` (tools.ts applies it with flag g) → pin = upstream base version, installed by the fork's `scripts/aphrody/install.{sh,ps1}`. Fork registered in `tools/config/update/forks.json` (drift vs parent via GitHub API; `docs/reference/infra/UPSTREAMS.md` regenerated).
- Checkout convention: `APHRODY_BUN_CHECKOUT`, else `<bun>` on Windows (`~/bun` default in bootstrap_remote.sh / engine-equivalence.ts on Linux).
- MCP `bun_docs_*` (crate aphrody-bun-docs): corpus order `APHRODY_BUN_DOCS` > fork checkout `docs/` (needs docs.json) > installed bundles > mirror `docs/reference/upstream-bun` (`bun run docs:bun:update`). No `third_party/bun/docs` anymore.
- Pitfall: in this harness, backslashes in Bash-tool heredocs/`bun -e` get mangled (`\b` → backspace); write Windows paths as `<bun>` or edit with the Edit tool.
- Another agent's commit can sweep your staged `git rm` into theirs: commit with `git commit -- <paths>` right after staging.

## n2b + Oxc in the fork (chantier L, 2026-10-09)
- Moved from aphrody@09f1288c: `packages/bun-n2b/` (own Cargo workspace, stable toolchain via its `rust-toolchain.toml`, own `clippy.toml`/`rustfmt.toml` because the repo root carries Bun's nightly + Bun clippy rules) = crates `aphrody-n2b-types`, `-registry`, `-core`, `aphrody-n2b` (lib + bin `n2b`) 0.7.0 + napi crate `bun-plugin-n2b-napi`; `packages/bun-oxc/` = `aphrody-oxc-bridge` 0.2.0 (Oxc 0.153.0) + `bun-plugin-oxc-napi`. Root `.gitignore` hides `github` and `**/package-lock.json` → `packages/bun-n2b/.gitignore` re-includes `crates/n2b-core/src/github/` and fixture lockfiles (cargo package uses git ignore rules).
- Local addon: `bun scripts/aphrody/build-napi.ts packages/bun-n2b [--target triple] [--debug]`. Publish: `scripts/aphrody/publish-native.ts matrix|stage|publish` + `.github/workflows/aphrody-publish-native.yml` (input `only=n2b,oxc`, dry-run); crates: `publish-crates.ts --only sdk,packages/bun-n2b,packages/bun-oxc` + aphrody-publish-crates.yml input `only`. Versions come from each package.json / Cargo workspace (bump both).
- Tests: `bun test test/integration/bun-plugin-n2b test/integration/bun-plugin-oxc` (system bun; n2b test builds the addon if missing), `cargo test --workspace` in each package; schema types `bun packages/bun-n2b/scripts/generate-schema-types.ts --check` (needs `cargo install cargo-typify` + json2ts). Docs: `packages/bun-n2b/docs`, `packages/bun-oxc/docs`; Aphrody keeps only `docs/reference/compat/N2B.md` (pointer).
- Aphrody consumes the crates from crates.io with exact versions (`aphrody n2b`, MCP `n2b`, aphrody-ffi `tooling`, bun-docs).

## Installateurs et runtime (2026-10-09)
- `scripts/aphrody/install.{sh,ps1}` : `[latest|X.Y.Z|aphrody-v…]`, SHA256SUMS, `-musl` sur Alpine, refuse si le binaire ne tourne pas. Aphrody les appelle partout (pin bun 1.4.3 dans tools/config/update/pins.json, `pins apply bun X`).
- Release .1 Linux exigeait glibc 2.38 ; depuis .2 : glibc 2.31 + musl.
- Release Windows aphrody.1 (MSVC 14.51) segfault, corrigé en .2 (14.44) sur `bun -e 'await import("node:fs")'` et `bun x` ; debug OK. Hôte Windows sur la release .2 du fork (`~/.bun/bin/bun.exe` 1.4.3-aphrody.2) ; avant de réinstaller une release, vérifier `bun -e 1` + `bun x prettier --version`.
- <aphrody> : origin doit être aphrody-labs/aphrody.git (un agent l'a basculé vers codex deux fois) — vérifier `git remote get-url origin` avant pull/push.

## Release pipeline (chantier B, 2026-10-09)
- aphrody-v1.4.3-aphrody.2 = first good release (Windows OK: node:fs, bun x, bun test). Installed in ~/.bun/bin.
- npm `0.0.0-stage` = staged-publishing placeholder on first publish; unpublish E403 → deprecated; new packages take minutes to appear, so scripts wait for the published version; `aphrody-npm-placeholder.yml` retires on demand.
- `@aphrody/bun-mdx-rs` (aphrody-publish-mdx-rs.yml, serde pinned 1.0.219 in its Cargo.lock) and `@aphrody/web-inspector-bun` (aphrody-publish-web-inspector.yml; InspectorBackendCommands.js only in the *windows* prebuilt WebKit tarball; NativeFunctionParameters.js generated from overrides) published 1.4.3-aphrody.1.

- n2b 0.7.1 (96aa81a7598, non compilé/testé, non publié) : migration pnpm complète (catalogs, overrides, patchedDependencies, champ pnpm), `--migrate --dry-run` → migration_plan, règles cli/* vitest/jest/tsx/ts-node/pnpm -r|--filter, `--since <ref>`, find_manifest borné à .git, schéma v2. Publier 0.7.1 + bump Aphrody =0.7.1 seulement après la passe de tests de main.
- bun système = fork partout, `bun upgrade` → aphrody-labs (2234e0699db : releases aphrody-v*, SHA256SUMS, APHRODY_BUN_REPO, canary = release `canary` sinon erreur, `bun upgrade --local [chemin]` installe build/release/bun ; Windows : exe → .old, supprimé au lancement suivant). CI : `.github/actions/setup-bun` du fork (edd2ce9f91e), shenron l'appelle via `aphrody-labs/bun/.github/actions/setup-bun@main`.
