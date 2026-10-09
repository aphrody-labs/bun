# Plan Alpine + Bun — runtime, distribution, release

Cœur du fork Bun et distribution Aphrody Alpine : runtime, libc, root/noyau, release du binaire, perf, WebKit,
outillage (oxc, n2b), Windows. Propriétaire : main et ses agents.

Règles communes, cible et vérification : [PLAN.md](PLAN.md) (à lire en entier avant de commencer).

## 3. Chantiers

Statut : ✅ fait · 🔄 en cours · ⏳ à faire. Un chantier = un propriétaire ; hors de ton périmètre, coordonne
par `git pull --rebase` et ne réécris pas le travail d'un autre.
### N. Alpine d'abord, Ubuntu 26.04 garanti (🔄)

Décision utilisateur (2026-10-09) : le fork est **pensé d'abord pour la dernière Alpine** (3.24.x, musl) et doit
**aussi compiler sur Ubuntu 26.04** (glibc 2.43, = vps/dbfr). Commit `fd278401fca`.

- ✅ Image `aphrody/build-alpine:3.24` (`scripts/aphrody/alpine.Dockerfile`) : LLVM 23.1.3 depuis edge/main (le
  build n'accepte que `pins.llvm` 23.1.x ; apk 3.24 n'a que 22), nightly `rust-toolchain.toml` (rustup hôte musl),
  cmake 4.2, samurai, mold, go, nasm, perl, python3, nodejs (act), bun 1.4.2. Construite et vérifiée localement.
- ✅ `aphrody/build-linux:26.04` : + LLVM 23 apt.llvm.org (contournement SHA-1 sqv), nightly épinglée, go, nodejs.
- ✅ Runner `tmux.ts` : `--linux` = `--alpine`, `--ubuntu` ; `--sync`/`--sync-head` (volume `aphrody-src-<distro>`),
  `--cpus`/`--memory` (6/6g, plafond 10g), cache `aphrody-build-cache-<distro>` ; test `test/internal/aphrody-tmux.test.ts`.
- ✅ `scripts/build/config.ts` : ASAN forcé off sur musl (compiler-rt sans ASAN musl, pas de prébuilt WebKit
  `-musl-*-asan`) ; sans sysroot, `detectLinuxAbi()` (`/etc/alpine-release`) donne un build natif musl.
- ✅ `alpineRelease` → 3.24 (`ci-images/spec.ts`), conteneurs musl de `build-host.ts` sur `alpine:3.24`.
- ✅ CI `aphrody-linux-build.yml` : alpine-3.24 + ubuntu-26.04 × x64 + arm64 (`ubuntu-24.04-arm`), build natif,
  `scripts/aphrody/linux-smoke.sh` (version, `-e`, `node:path`/`node:fs`, `Bun.serve` port 0, `bun install`
  hors-ligne d'un `file:`), puis which/require/fetch en `bun bd test`. `.actrc` : `-P alpine-3.24`.
- ✅ Release : les assets `-musl` sont l'artefact Linux principal (`aphrody-release.yml` échoue si un `-musl`
  demandé manque) ; `@aphrody/bun-runtime` (`isMusl()`) et `install.sh` choisissent déjà musl sur Alpine, glibc sinon.
- ✅ Audit statique glibc dans `src/**` : `gnu_get_libc_version` (BunProcess.cpp, crash_handler), c-ares, sqlite
  `backtrace_symbols_fd` sont tous gardés `__GNU_LIBRARY__`/`target_env = "gnu"` ; `getauxval` existe dans musl.
- ⏳ Builds natifs debug/release Alpine puis Ubuntu 26.04, via le runner :
  `bun scripts/aphrody/tmux.ts run bd-alpine-N --alpine --sync-head --cpus 8 --memory 10g -- 'bun install && bun run build'`,
  puis `bash scripts/aphrody/linux-smoke.sh build/debug/bun-debug` et `bun bd test` which/require/fetch : suspendus
  par la directive « aucun build » du 2026-10-09, à lancer dans la passe unique de main.

### U. Aphrody Alpine — fork d'Alpine 3.24 + apk-tools (🔄 démarré le 2026-10-09)

- Forks `aphrody-labs/aports` (3.24-stable) et `aphrody-labs/apk-tools`, clonés dans C:aports et C:apk-tools ;
  image `ghcr.io/aphrody-labs/alpine` qui remplace `aphrody/build-alpine:3.24` (chantier N).
- **U1** : paquets, `bunsh` (bun comme shell natif, login shell de root ; /bin/sh reste busybox ash tant que bunsh ne
  passe pas les scripts apk), apk complété par bun, image.
- **U2** : libc Rust en complément de musl (c-ward forké dans aphrody-labs, choix motivé).
- **U3** : sudo-rs intégré nativement (groupe `aphrody` NOPASSWD), élévation dans le cœur Bun (`elevate.rs`), module
  `bun:linux` (API noyau complète, root sans sandbox), noyau `linux-aphrody` et sysctl.
- Builds et tests : passe finale unique (§2 règle 13), conteneurs Docker locaux uniquement.

### A. Publication (✅ base)

- ✅ crates.io : `aphrody-bun-macro` 0.1.0, `aphrody-bun-native-plugin` 0.2.0.
- ✅ npm : `@aphrody/bun-types`, `bun-inspector-protocol`, `bun-debug-adapter-protocol`, `bun-plugin-svelte`,
  `bun-plugin-yaml` (`scripts/aphrody/publish-npm.ts`, `aphrody-publish-npm.yml`).
- ✅ Release `aphrody-v1.4.3-aphrody.1` (4 cibles) + `@aphrody/bun-runtime` (`aphrody-release.yml`,
  `scripts/aphrody/publish-runtime.ts`).

### B. Release du binaire — limites (✅)

Fichiers : `.github/workflows/aphrody-release.yml`, `scripts/aphrody/{build-host,publish-runtime,npm-placeholder,publish-mdx-rs,publish-web-inspector}.ts`,
`scripts/build/**` (version), `test/internal/aphrody-{build-host,publish-mdx-rs,publish-runtime}.test.ts`.

- ✅ Build host d'upstream (debian:13 sur ubuntu-24.04-arm, cross-compilation) : linux-gnu contre le sysroot glibc 2.31
  (symbole max GLIBC_2.17 sur aarch64), musl contre Alpine, Windows via xwin CRT 14.44.17.14, macOS SDK ; LTO on. 6afd1932d3e
- ✅ 8 cibles : linux-x64/aarch64 (+musl), darwin-aarch64/x64, windows-x64/aarch64 ; alias `-baseline` x64 comme upstream. 6afd1932d3e
- ✅ `bun --version` = `1.4.3-aphrody.N` (`--version-tag`), `Bun.version` reste `1.4.3`. 04fd2e85af5
- ✅ `0.0.0-stage` = placeholder du staged publishing npm au 1er publish (unpublish E403) → déprécié par chaque script de
  publication après visibilité de la version, workflow `aphrody-npm-placeholder.yml` à la demande ; `latest` correct. 806a3c32885
- ✅ `@aphrody/bun-mdx-rs` 1.4.3-aphrody.1 + 8 paquets plateforme (CI native) et `@aphrody/web-inspector-bun` 1.4.3-aphrody.1
  (sources WebKit à WEBKIT_VERSION). 2cfc2ef28c6, 4e98faf1742, 7d1b86718c3
- ✅ Smoke par cible bloquant (marqueur par cible, `node:fs`, `node:path` + `execFileSync`, musl avec libstdc++/libgcc,
  glibc aussi sur ubuntu:26.04). 5360ad1c11a, f7a7086b602
- ✅ Release `aphrody-v1.4.3-aphrody.2` verte (run 37856453908) : 24 zips + SHA256SUMS.txt ; npm `@aphrody/bun-runtime`
  et ses 8 plateformes en 1.4.3-aphrody.2 (`latest`) ; `bunx @aphrody/bun-runtime@1.4.3-aphrody.2 --version` OK sous Windows ;
  installée dans ~/.bun/bin (secours `bun-upstream-1.4.2.exe`) ; Shenron passé en .2 (ea184935).

### E. Bugs Bun sous Windows (✅)

Fichiers : `src/**`, tests dans les fichiers existants.

- ✅ Segfault du debug build sur `-e` et `test` : STL MSVC 14.51 (VS 2026) incompatible ABI avec le WebKit
  prébuilt (14.44) — `std::partial_ordering` renvoyé par sret au lieu d'un registre, écriture via un pointeur
  invalide dans `JSRunLoopTimer::Manager::scheduleTimer`. `scripts/vs-shell.ps1` choisit le toolset épinglé,
  configure refuse un toolset plus récent, l'identité de toolchain inclut `VCToolsVersion` (`41a9c254070`).
  Même cause pour le crash de la release `aphrody-v1.4.3-aphrody.1` (build Windows natif sur `windows-2025`,
  MSVC 14.51.36231) ; la release croisée xwin (CRT 14.44) de `6afd1932d3e` l'évite.
- ✅ (rouvert puis refermé) Le build release local `1.4.3-aphrody.2+4e187a0e8` segfaultait encore sur
  `await import("node:fs")` : `build/release` datait d'avant `41a9c254070` (identité de toolchain sans ligne
  `msvc`, donc compilé en 14.51). Reconstruit avec `msvc 14.44.35207` (`toolchain-identity/cxx.txt`) :
  `-e 'await import("node:fs")'`, `bun x prettier --version` et `bun test` passent. Test de régression dans
  `builtin-esm-lazy-exports.test.ts`, smoke `bun test` ajouté à `aphrody-release.yml` (le `-e` y était déjà).
- ✅ `require()` d'un chemin absolu mêlant `\` et `/` sans extension → `__dirname` faux et module en double :
  `load_extension` construit le chemin depuis l'entrée (`dbe3387ccf9`), test dans `require.test.ts`.
- ✅ `which.test.ts` : cas `.com` du cwd indépendant de `NoDefaultCurrentDirectoryInExePath` (`e97556dd6c7`).
- ✅ Diagnostic Windows (`.claude/docs/windows-deep.md`) : cdb/WinDbg/procdump/lldb opérationnels, `_NT_SYMBOL_PATH`,
  procédure crash → dump → pile symbolisée testée (`scripts/aphrody/win-crash.ts`). WER LocalDumps ne marche pas pour
  bun (libuv `SEM_NOGPFAULTERRORBOX`, `vendor/libuv/src/win/core.c:181`) : procdump `-e 1`. La stratégie
  `Policies\...\Windows Error Reporting\Disabled=1` désactivait WER sur toute la machine (remise à 0). Exclusions
  Defender étendues à `C:\bun`, `.rustup`, VS/LLVM/SDK.
- ✅ Patch WER (libuv `patches/libuv/win-allow-wer.patch` + `src/crash_handler/lib.rs`) : `SEM_NOGPFAULTERRORBOX` n'est plus
  posé quand `BUN_WER=1` ou qu'une clé `LocalDumps/<exe>` existe ; le crash handler termine alors par
  `RaiseFailFastException` avec l'exception d'origine (WER dumpe la vraie faute). Défaut inchangé (`ExitProcess(3)`).
  Test : `test/cli/run/run-crash-handler.test.ts`.

### F. Fork = noyau d'Aphrody (✅)

Côté Aphrody : `patches/bun`, `vendor.toml`/lock, `tools/config/vendor.json`, `packages/infra/update`,
`docs/operations/infra/update/BUN.md`, `crates/compat/bun-bridge`, `crates/compat/bun-docs`.

- ✅ `APHRODY.md` décrit ce que le fork fournit (fork `4e187a0e8a4`).
- ✅ Patches `patches/bun/0001-0009` : tous déjà présents dans le fork → supprimés, avec
  `scripts/tools/vendor/{bun_upstream_sync,bun_upstream_tracker,packages_upstream_sync}.ts` (suppression partie dans
  Aphrody `e3aa1d730`).
- ✅ Pins et vendoring : entrée `bun` retirée de `tools/config/vendor.json` ; `pins.json` suit les releases
  `aphrody-labs/bun` (`stripTag`) ; fork inscrit dans `tools/config/update/forks.json` ; `UPSTREAMS.md` régénéré ;
  références `vendor/bun` → fork / `APHRODY_BUN_CHECKOUT`. Aphrody `99eda6f67`.
- ✅ `crates/compat/bun-bridge` (réimplémentation Rust de Bun) supprimé, consommateurs migrés (`aphrody shell bun` →
  `bun exec`) ; `aphrody-bun-docs` lit d'abord le checkout du fork puis le miroir `docs/reference/upstream-bun` ;
  `BUN.md` ne cite plus `patches/bun`. Aphrody `71cf2bb22`. Gates : `cargo test` bun-docs et n2b-core, clippy
  `-D warnings` sur ces deux crates, `cargo check` discord/ffi/command.
- ✅ Installateurs du fork `scripts/aphrody/install.{sh,ps1}` (version, tag exact ou latest, SHA256SUMS, musl,
  contrôle d'exécution) : fork `2ecdff0d2a9`, `7c89f8712cc`. Aphrody installe le binaire du fork partout (update
  `tools.install`, `system-packages`, bootstrap/toolchain-sync/bun-hygiene sh+ps1, Dockerfiles, CI) ; pin `1.4.3`
  tenu par `pins.json` : Aphrody `3c70e77d3`, `ecaa5605e`, `866e22453`. Vérifié : Windows (install.ps1 local et
  raw), Docker ubuntu:24.04, `aphrody/build-linux:26.04`, image `tools/config/container` (bun 1.4.3+37edd09a6).
- ✅ `packages/infra/update` 0 échec Windows et Linux (`aa0163461`) ; catalogues générés et mentions bun-bridge
  (`0c4fd6368`) ; `docs:gen`, `docs:check`, `docs:check-links` verts (`866e22453`).
- ✅ yolo : `cli_app` (sources vendor absentes, `doctor --json`) et `workspace_profiles` lent (glob sans
  node_modules/target) : `a7998d168`. kernel-client lancé via `aphrody kernel serve` : `f7c490072`.
- ✅ `packages/engine/core` : 35 → 0 échec Windows (racine hôte = checkout source, wrapper Cargo pwsh/sh, beacon
  `dirname`, état git en un spawn, commandes Cargo légères hors verrou) : `9b40294ed7`. Linux (Ubuntu 26.04) : 4 échecs
  restants avant build de `libaphrody_ffi.so`/oxfmt global, à rejouer dans la passe de tests finale.
- ✅ Hypothèse WSL Ubuntu-24.04 remplacée par `aphrody/build-linux:26.04` (infra cli, inventaire, docs) : `2d3f713f9`.
- Bloquant hors F : le binaire release Windows du fork (`aphrody.1` et build local `aphrody.2`) segfault sur
  `bun -e 'await import("node:fs")'` (debug OK) ; hôte Windows laissé sur l'upstream 1.4.2 en attendant. Linux glibc
  2.36 et Alpine attendent la release glibc 2.31 + musl (chantier B) ; l'image `aphrody-os` en dépend.

### G. Déduplication de la couche JS Bun d'Aphrody (✅)

Côté Aphrody : `m3/packages/m3-bun`, `crates/ui/bun`, `crates/interop/ffi/bun`, `scripts/build/ui/packages/bun`,
paquets `packages/**` qui refont une API Bun (`http`, `fuzzy`, `sql`, `paths`…).

- ✅ Supprimés : wrappers `bun-shell.ts` (doublons de `Bun.$`, `Bun.hash`, `Bun.semver`, `Bun.Glob`) et leurs 10
  symboles FFI, `spawn-sync.ts`, `benchmark.ts`, `crates/interop/ffi/bun` (agent client déplacé dans
  `@aphrody/bun/agent`), `scripts/build/ui/packages/bun`, `@aphrody/bun-forge` (npm déprécié). Aphrody `33a4b79a3`.
- ✅ API Bun natives : `Bun.semver.order` (update), `Bun.Glob` (tauri apps), `Bun.hash.crc32` (canonical-tar,
  mcu-image-fixture). Aphrody `9ad186926`.
- ✅ Types : catalogue `@types/bun` → `npm:@aphrody/bun-types@1.4.3-aphrody.1`. Aphrody `aa4980040`.
- ✅ Migré ici : `@aphrody/webview-page` → `packages/bun-webview-page` (`@aphrody/bun-webview-page`, publié
  `0.1.1-aphrody.2`, ancien nom déprécié). Fork `5a11460837d`, `729caaf440f` ; Aphrody `69ba8ec2b`, `3250f76f6`.
  Cause de l'e2e Windows « Chrome process closed the pipe » : un Chrome lancé en session élevée se relance
  dé-élevé et perd le pipe CDP ; le paquet passe `--do-not-de-elevate` sous Windows (e2e Chrome 154 vert).
  Corrigé aussi dans `Bun.WebView` (`ChromeProcess.rs` ; test `webview-chrome-pipe.test.ts` ; `05743df31f9`) :
  `webview-chrome.test.ts` passe 58/58 avec Chrome réel sous `bun bd` (0/58 avant).
- ✅ Maintenus (spécifiques Aphrody, pas une API Bun) : `@aphrody/bun` (FFI aphrody-ffi, ≠ `@aphrody/bun-runtime`),
  `crates/ui/bun`, `m3-bun`, `@aphrody/http`, `@aphrody/sql` (fabriques sur `Bun.SQL`), `fuzzy`, `qr`.

### H. Docs Bun d'Aphrody (✅)

- ✅ Purge des copies et plans Bun périmés ; page canonique `docs/reference/upstream-bun/APHRODY-FORK.md` ; seule copie de
  la doc : `docs/reference/upstream-bun` (`bun run docs:bun:update|check`). `CLAUDE.md`, `AGENTS.md` à jour ; `TOOLS.md`
  généré, rien de périmé. `yolo docs` lit le miroir (`docs/cli/HELP.md` régénéré) ; `just qualify-bun` qualifie le
  checkout local du fork (`APHRODY_BUN_CHECKOUT`, défaut `../bun` : `scope.ts --check`, retard sur upstream/main, puis
  `yolo forge`). Aphrody `8c13ad714`, `1a87c0fad`, `9d5aaad7c`. `docs:gen`/`docs:check`/`docs:bun:check` verts,
  `docs:check-links` : 0 lien cassé, 0 chemin mort.

### I. Tests Windows d'Aphrody (🔄)

- ✅ `packages/infra/workspace` : 105 échecs → 0 sous Windows (349 pass, 90 skip Linux-only : procfs/flock/sudo, `supervise`, install.sh). Linux (Docker) : aucune régression vs HEAD. Commits aphrody `3c70e77d3` (lot intégré), `1a9b89a40`.
- ✅ `aphrody_ffi.dll` construite (`target/runtime`, profil `runtime`) ; web-test 37/37 dont `sites` + `next-instant`. Commit `df6e5502d`.
- ✅ m3 : scripts 51/0, m3-icons 13/0 (DLL `target/runtime` reconstruite avec polices embarquées), m3-theme 13/0, m3 61/0, m3-config/front/mcp/tailwind/material-design-icons 0 échec (aphrody 099a4fe180). `m3:theme.css` : `@import` à schéma tenu hors du compile Tailwind (fork 4265629bb50) ; m3-bun passe de 21 à 10 échecs avec la source du fork, effectif dans aphrody après publication npm `0.1.0-aphrody.2` (chantier D prévenu).
- ✅ m3-bun Windows : 119 pass / 9 skip / 0 échec avec le plugin Tailwind du fork (aphrody `a7a9f745fa`) — defaultOutfile
  `.exe`, bit exécutable et ldd/`--rootfs` réservés à Linux (erreur explicite), `M3_ICONS_ROOT` résolu, archives écrites
  par Bun (tar.gz et zip, sans `tar`/`zip` externes), smoke via `bun build --compile`, un seul pwsh pour les 3 .ps1.
  Linux (Docker `aphrody/build-linux:26.04`) : 119 pass / 8 skip, aucune régression (HEAD avait 1 échec zip sans `zip`) ;
  `init.c static-linkable` passe à 30 s de délai (link statique ~5 s sous 6 CPU).
- 🔄 Patch cœur §2.11 `Bun.Archive` (fork `5ffed5d5e53`, non construit ni testé — directive « un seul build final ») :
  `format: "zip"` (writer + reader libarchive, `archive_read_support_format_zip` + `ppmd8`, noms UTF-8 flaggés via
  `patches/libarchive/zip-utf8-names.patch`), entrées `{ data, mode, mtime }`, option `mtime` (archives
  reproductibles), `extract` des zip par le lecteur Bun.Archive (le chemin rapide de `bun install` reste tar seul).
  Tests : `bun bd test test/js/bun/archive.test.ts -t "entry modes, mtime and zip"` (doit échouer avec
  `USE_SYSTEM_BUN=1`). Après la release du fork : remplacer l'encodeur tar/zip de `m3/packages/m3-bun/src/package.ts`
  (`archiveEntries`/`tarHeader`/`tarGz`/`zip`) par `Bun.Archive.write(..., { format, mtime: 0 })` et le supprimer.
- ⚠️ `tmux.ts run --ubuntu --sync` : l'image `aphrody/build-linux:26.04` n'a pas `rsync` (Dockerfile modifié par un autre
  agent, image non reconstruite) ; vérification Linux faite par `docker run` direct.

### K. CLI Aphrody (✅)

Côté Aphrody : `crates/ai/code-graph`, `crates/engine/yolo-core`, `crates/infra/{yolo,git,aphrody-command}`,
`crates/os/kernel/core` (cloud), `crates/ai/mcp` ; réinstallation du binaire.

- ✅ graph (points 1-8) : résolution inter-crates, chemin orienté, `explain` `file::symbol`, pas de liaison
  d'homonymes, rapport enrichi, graphe Markdown, causes d'erreur d'extraction, `delete`/`drop` — `8d3109124`.
- ✅ yolo (9-15) : ressources sans `APHRODY_YOLO_ROOT`, tiers verify ignorés proprement, gates réels du source
  Bun, workspaces Cargo/package.json, état dans `~/.aphrody/yolo`, `require()` et enums — `e3aa1d730` ;
  index fs en SQLite (`fsindex.sqlite`, FTS5 trigram, requêtes multi-mots insensibles à la casse, `LIKE` pour
  les mots < 3 caractères, migration automatique de l'ancien `fsindex.tsv`) — `8a35b2e06`. C:\bun : 20 153
  entrées, recherche en ~0,08 s.
- ✅ git (16) : `git inspect` log, hotspots, ahead/behind par remote — `922f9835c`.
- ✅ MCP (17-20) : `github_branches` paginé/filtré (50 par défaut) — `d027032d8` ; `bun` au catalogue upstream
  (`checkout: ../bun`) et `upstream_search` sans jeton → recherche dans le checkout local ; `docs_auto_search`
  WebKit → `/websites/webkit` et sections bornées ; `coding_style_guide` `c++`/`cpp`/`ts`/`bash` — inclus
  dans `3c70e77d3` (commit groupé d'un autre agent).
- ✅ `aphrody scan` (21) : chemin absolu du rapport en fin de sortie, sans `-o` résumé seul, `-o -` JSON seul —
  `3c70e77d3` + `8648e2d0a`.
- ✅ Binaire release réinstallé (`aphrody self install-path`, `aphrody 1.0.0-canary`, aphrody-mcp relié) ;
  `graph:bun` reconstruit (19 783 fichiers, 116 085 nœuds) et `claude-memory-bun` (573 nœuds).

### L. oxc et n2b dans le fork (✅ ; n2b 0.7.1 monorepo en cours)

Fichiers : `packages/bun-n2b/**`, `packages/bun-oxc/**`, `test/integration/bun-plugin-n2b/`,
`test/integration/bun-plugin-oxc/`, `scripts/aphrody/{build-napi,publish-crates,publish-native}.ts`,
`.github/workflows/aphrody-publish-{native,crates}.yml`. Côté Aphrody : `crates/compat/{n2b,n2b-core,n2b-registry,n2b-types,oxc-bridge}`
et `packages/engine/n2b-client` supprimés (2db2b5a973, 132 fichiers, −31 522 lignes).

- ✅ Code déplacé (move from aphrody@09f1288c) : `packages/bun-n2b/` (workspace Cargo séparé, toolchain stable) et
  `packages/bun-oxc/` (Oxc 0.153.0). Addons napi : `bun scripts/aphrody/build-napi.ts packages/bun-{n2b,oxc}`.
- ✅ crates.io : `aphrody-n2b-types`, `-registry`, `-core`, `aphrody-n2b` 0.7.0 ; `aphrody-oxc-bridge` 0.2.0.
- ✅ npm : `@aphrody/bun-plugin-n2b@0.7.0` (plugin, API `scan`/`transform`, CLI `bunx @aphrody/bun-plugin-n2b scan|fix|report|rules…`,
  shims ; absorbe `n2b-client`) et `@aphrody/bun-plugin-oxc@0.2.0`, chacun avec 8 paquets plateforme
  (win32 x64/arm64, darwin x64/arm64, linux x64/arm64 gnu/musl) — workflow `aphrody-publish-native.yml`.
- ✅ Aphrody consomme les crates en version exacte (`aphrody n2b`, MCP `n2b`, ffi `tooling`, bun-docs) ; `oxc_codegen`,
  `oxc_minifier`, `oxc_semantic` retirés, oxc restant aligné sur 0.153 ; docs n2b dans `packages/bun-n2b/docs`, renvoi
  `docs/reference/compat/N2B.md`.
- ✅ Tests : cargo n2b (~97) et oxc (13) ; `bun test test/integration/bun-plugin-{n2b,oxc}` 17 + 16 pass (Windows),
  29 pass / 4 skip oxfmt-oxlint absents (conteneur Linux 26.04) ; Aphrody cargo test --lib des consommateurs 396 pass.
- 🔄 n2b 0.7.1 pour M/Q/R, code poussé (96aa81a7598), ni compilé ni testé (directive : passe unique de main) :
  `--migrate` reporte `pnpm-workspace.yaml`/champ `pnpm` (workspaces, catalog(s), overrides, patchedDependencies,
  onlyBuiltDependencies → trustedDependencies) ; `--migrate --dry-run` → `migration_plan` ; 9 règles `cli/*` (vitest/jest →
  `bun test` en aggressive, tsx/ts-node/`node --loader` → `bun`, `pnpm -r|--filter` → `bun run --filter`) ;
  `test/unsupported-api`, `test/mock-hoisting` ; `--since <ref>` ; `find_manifest` borné à `.git` ; schéma v2.
  À faire après la passe verte : `cd packages/bun-n2b && cargo test --workspace && cargo clippy --workspace --all-targets`,
  `bun packages/bun-n2b/scripts/generate-schema-types.ts --check`, `bun scripts/aphrody/build-napi.ts packages/bun-n2b`,
  `bun test test/integration/bun-plugin-n2b`, puis publier 0.7.1 (crates + native) et passer Aphrody en `=0.7.1`.
  Limites Bun signalées : `bun:test` sans `vi.stubEnv/stubGlobal/importActual/hoisted/doMock/resetModules/waitFor`,
  `vi.mock` non hissé ; overrides pnpm imbriqués (`a>b>c`) sans équivalent.

### O. Garde de performance (🔄)

Le fork ajoute des modules et plugins sans coût au démarrage ni goulot. Fichiers : `bench/aphrody/**`,
`scripts/aphrody/perf-gate.ts`, `.github/workflows/aphrody-perf.yml`, `test/internal/aphrody-perf-gate.test.ts`.

- ✅ Banc `bun scripts/aphrody/perf-gate.ts [--fork <bun>] [--upstream <bun> | --upstream-version X]` (e95716e8b75) :
  `bun --version`, `-e ''`, `run` vide, `test` vide, `build` petit projet, `install` hors-ligne (tarballs `file:` + cache
  chaud), RSS au démarrage et après 11 `node:*`, `require`/`import()` de 31 `node:*` et 4 `bun:*`, `Bun.serve` hello,
  `fetch` local (p50/p99/req/s), taille du binaire. Upstream téléchargé par `gh release download` (repli sur la dernière
  release), hyperfine si présent sinon boucle `Bun.spawnSync` entrelacée ; médiane et p95 ; JSON + Markdown
  (`$GITHUB_STEP_SUMMARY`) ; exit 1 si seuil dépassé, 2 si binaire cassé. Seuils : `bench/aphrody/thresholds.json`
  (ratio ET écart absolu minimal, pour ignorer le bruit de lancement de processus). Taille et RSS ne bloquent pas quand
  les versions de base diffèrent (`--strict` les impose). Reste non couvert : `next-bun build` de la fixture.
- ✅ CI `.github/workflows/aphrody-perf.yml` : pull_request/push main (chemins src, scripts/build, vendor, bench),
  `workflow_run` après « Aphrody release » (artefact de build neuf), dispatch avec `run-id`. Linux x64 bloquant, Windows
  x64 informatif (la release .1 plante, chantier E). Sans `run-id`, PR et push mesurent la dernière release `aphrody-v*`,
  pas le code de la PR : le binaire de la PR n'est mesuré qu'après son build de release.
- ✅ Audit des ajouts du fork sur `merge-base..main` (21 fichiers `src/`, aucun changement de flags de compilation) :
  rien d'eager au démarrage. `display_version`/`VERSION_TAG` sont des `const` ; `picocolors`, `tiny-invariant`, `dotenv`,
  `uuid` sont 5 entrées de table de modules internes évaluées à la demande (`require` des 4 : 4 à 7 ms, fork seul) ;
  `is_plain_bun` évite même `Graph::from_executable` ; `dlopen` global, WebView/Chrome, résolveur (join mis en cache par
  entrée) hors chemin de démarrage. Aucun correctif nécessaire.
- ✅ Mesures (Windows x64, i7-13700F 24 threads, 32 Go, release LTO, MSVC 14.44, 40 runs/5 échauffements, hyperfine,
  médianes). Fork (working tree à 2d27bf316) contre le **même commit de base sans les patchs du fork** (620b50f6a, même
  toolchain, `tmp/perf/r2`) : `--version` 9.70 vs 9.39 ms, `-e ''` 9.70 vs 9.91, `run` vide 25.7 vs 24.1, `test` 27.2 vs
  27.9, `install` 59.5 vs 58.7, RSS démarrage 19.03 vs 19.00 MiB, RSS après builtins 26.55 vs 26.62 MiB, `require` 31
  `node:*` 125 vs 118 ms (bruit : p95 255-278 ms, builds en cours), `import()` 64.8 vs 63.2, `Bun.serve` 8.06 vs 7.93,
  `fetch` p50 0.11 vs 0.11 ms, taille 92.11 vs 92.08 MiB (+32 KiB). `build` petit projet 104 vs 88 ms : médiane bruitée
  (p95 > 780 ms des deux côtés) à refaire sur machine au repos. Fork contre upstream **1.4.2** officiel (`tmp/perf/r1`) :
  démarrage identique à ±0.4 ms, mais taille 92.11 vs 82.11 MiB et RSS 19.6 vs 16.5 MiB : ces écarts sont déjà dans le
  commit de base (le même écart apparaît entre 1.4.2 et 620b50f6a), pas dans les patchs du fork. Aucune régression du
  fork mesurée.
- ✅ Régression d'outillage trouvée : `build/release/bun.exe` (23:57) plantait au hasard (0xC0000409,
  `WTF::operator<=>` dans `TimeWithDynamicClockType.cpp`, thread AutomaticThread) dès qu'un script chargeait `node:fs` :
  même ABI `std::partial_ordering` que le chantier E, binaire compilé avec le STL MSVC 14.51. Reconstruit avec le toolset
  épinglé 14.44 (`build/release-perf`) : 0 crash sur 7 essais. Rien à porter au chantier P (ce n'est pas JSC).
  Piège de mesure : le même binaire pèse 47 MiB de RSS lancé depuis `~/.bun/bin` contre 16 MiB copié ailleurs ; le banc
  doit toujours mesurer des copies hors de `~/.bun/bin`.
- ⏳ À faire : première exécution de la CI (vérifier le téléchargement `gh run download`/zip côté Windows), seuils resserrés
  sur des runs de CI au repos, test d'intégration `next-bun build`, comparaison Linux (musl/glibc) dans le conteneur.
  Les tests `test/internal/aphrody-perf-gate.test.ts` (12 passés avant ajout de `--strict`) sont à rejouer.

### P. Fork WebKit / JavaScriptCore — `aphrody-labs/WebKit` (🔄)

Fichiers : côté fork Bun `scripts/build/deps/webkit.ts` (source des prébuilts, `WEBKIT_VERSION`,
`APHRODY_WEBKIT_PREBUILTS`), `scripts/aphrody/webkit-prebuilt.ts` (flux), `test/internal/webkit-prebuilt-source.test.ts` ;
côté WebKit `.github/workflows/aphrody-prebuilts.yml`, `aphrody-upstream-sync.yml`, `APHRODY.md`.

- ✅ `aphrody-labs/WebKit` resynchronisé sur `oven-sh/WebKit` (2026-10-09, fast-forward des 1999 commits via
  `merge-upstream`, `main` = `0c06faadf65b…` et au-delà). Sync programmé : `aphrody-upstream-sync.yml` (toutes les
  6 h ; fast-forward, ou `git merge` blobless quand `main` porte des patchs ; secret `APHRODY_SYNC_TOKEN` pour les
  fichiers `.github/workflows`).
- ✅ CI de prébuilts : `ci.yml` d'oven-sh (désactivé dans le fork : runners privés `linux-x64-gh`/`linux-arm64-gh`)
  est remplacé par `aphrody-prebuilts.yml`, qui réutilise **tels quels** `.github/scripts/lanes.mjs` et les
  `Dockerfile*` d'upstream (donc mêmes lanes, mêmes noms `bun-webkit-<os>-<arch>[-musl][-debug|-lto][-asan].tar.gz`,
  même contenu, tag `autobuild-<sha>`). Tous les lanes se construisent dans un conteneur linux/amd64 (macOS, Windows,
  FreeBSD, Android et arm64 en cross-compilation) : un seul type de runner. Images de toolchain dans
  `ghcr.io/aphrody-labs/bun-webkit-build-env`. Lanes au choix (`lanes` = regex sur les labels, `all` = les 42).
- ✅ **Mesure** (2026-10-09, runner standard `ubuntu-latest` 4 vCPU/16 Go, dépôt public = gratuit) : image
  `linux-musl` 4 min 18 s ; lane `bun-webkit-linux-amd64-musl-lto` **45 min** (limite d'un job : 6 h). Archive
  223 265 820 o (oven-sh : 223 270 963 o), mêmes 2800 entrées. Pas besoin de runners larges : le disque est
  contourné (data-root Docker sur `/mnt`, ~70 Go), l'unique limite réelle est la concurrence (20 jobs) ; toute la
  matrice tient en quelques heures.
- ✅ `scripts/build/deps/webkit.ts` : source par archive. Défaut `oven-sh/WebKit` tant que
  `APHRODY_WEBKIT_PREBUILTS[sha]` ne liste pas l'archive ; `BUN_WEBKIT_REPO=aphrody|oven|<owner>/<repo>` force la
  source ; le dépôt entre dans l'identité et le répertoire de cache (pas de collision à sha égal). Build Windows
  MSVC 14.44 inchangé (clés de cache identiques par défaut). Test : `bun test test/internal/webkit-prebuilt-source.test.ts`.
- 🔄 Alpine (chantier N) : `Dockerfile.musl` part de `alpine:3.23` + LLVM 23 (edge) ; les `-musl*` sont l'artefact
  Linux principal. Passage de la base à Alpine 3.24 = commit sur le fork WebKit, puis relance du lane musl.

**Flux d'un patch JSC/WebKit** (tout est dans `scripts/aphrody/webkit-prebuilt.ts`) :

1. Patch JSC → commit sur `main` de `aphrody-labs/WebKit` (clone partiel :
   `git clone --filter=blob:none --sparse`, ou PR sur le fork). Le sync upstream fusionne ensuite oven-sh au-dessus.
2. CI prébuilt : `bun scripts/aphrody/webkit-prebuilt.ts build --ref <sha> [--lanes 'regex,…'|all]`
   (= `gh workflow run aphrody-prebuilts.yml -R aphrody-labs/WebKit`) → release `autobuild-<sha>` publiée si tous les lanes passent.
3. Bump dans le fork Bun : `webkit-prebuilt.ts bump --sha <sha>` (met `WEBKIT_VERSION`), puis
   `webkit-prebuilt.ts record` (écrit dans `APHRODY_WEBKIT_PREBUILTS` les archives réellement publiées pour ce sha, ce qui bascule le
   build dessus), prettier, `bun test test/internal/webkit-prebuilt-source.test.ts`, build, commit.
4. `webkit-prebuilt.ts status` : écart au upstream et archives publiées.

Itération avant la CI : `BUN_WEBKIT_PATH` (clone de `aphrody-labs/WebKit`, mode `webkit: local` de `webkit.ts`).

- ⏳ Tout patch JSC/WebKit utile (perf démarrage, musl, fonctionnalités des plugins) suit le flux ci-dessus.
