# Plan — aphrody-labs/bun, noyau d'Aphrody

Plan commun à tous les agents qui travaillent sur ce fork (C:\bun), sur le monorepo Aphrody (C:\aphrody) et sur
Shenron (C:\shenron). Lis-le en entier avant de commencer, puis mets à jour ta section (statut, commits) à la fin de
chaque lot. Contexte permanent : [APHRODY.md](APHRODY.md) (ce que le fork fournit à Aphrody),
[CLAUDE.md](CLAUDE.md) (build et tests Bun), [packages/bun-next/docs/PLAN.md](packages/bun-next/docs/PLAN.md)
(plan détaillé Next sur Bun).

## 1. Cible

- **Objectif du fork : étendre Bun (modules, plugins, intégrations) sans rien perdre en vitesse.** Le temps de
  démarrage, la mémoire au repos et le débit du binaire final restent au niveau d'upstream ou meilleurs : toute
  extension est paresseuse (zéro coût tant qu'elle n'est pas importée), pas de travail ajouté au chemin de
  démarrage, pas de goulot d'étranglement. Une régression mesurée bloque le merge (chantier O).
- JavaScriptCore/WebKit peuvent être patchés quand c'est utile (perf, musl, fonctionnalités) via le fork
  `aphrody-labs/WebKit` (fork d'`oven-sh/WebKit`, chantier P).
- Ce fork est l'unique Bun d'Aphrody : runtime, types, paquets JS, crates, docs. Aphrody ne garde ni file de
  patches Bun, ni copie de Bun, ni paquet qui duplique une API native Bun.
- Upstream `oven-sh/bun` n'arrive que par fusion (`scripts/aphrody/sync-upstream.ts`, toutes les 6 h en CI). Le
  scope `@aphrody` est réappliqué par `scripts/aphrody/scope.ts` ; `--check` doit toujours sortir 0.
- Next.js tourne sur ce Bun avec la dernière version publiée de Next et `@aphrody/next-bun`.
- Tailwind CSS est fourni par `@aphrody/bun-plugin-tailwind` (Bun.build, serveur HTML, PostCSS pour Turbopack,
  préréglage M3).
- Shenron (dragonballfr.com) tourne entièrement sur ce fork, le dernier Next et `@aphrody/next-bun`.

## 2. Règles pour tous les agents

1. Exécution autonome de bout en bout, sans demander de confirmation.
2. Commits en anglais, Conventional Commits, **sans aucune mention d'IA/Claude/assistant ni co-auteur**
   (ni trailer, ni « Generated with »). Idem pour PR et descriptions.
3. Commit et push direct sur `main` à la fin de chaque lot. `git pull --rebase` avant chaque commit ; petits
   commits ; ne stage que tes fichiers (`git add <chemins>`).
4. Dans C:\aphrody et C:\shenron, d'autres agents ont des modifications non commitées : **jamais** `git stash`,
   `git reset`, `git checkout --`, `git clean`.
5. Toute erreur, tout blocage, toute limite rencontrés sont **corrigés**, pas listés. Ne rapporter comme restant
   que ce qui est réellement impossible ici, avec la preuve et ce qui a été tenté.
6. `bun bd` ne se lance **jamais** avec un timeout (arrière-plan si long). Tant que le debug build segfault sous
   Windows (chantier E), les tests JS purs passent par le `bun test` système.
7. **Pas de VPS** pour les essais : un build Shenron y tourne. Linux = Docker Desktop local (12 CPU / 12 Go),
   conteneurs `--cpus 6 --memory 6g`, volumes de cache nommés. La stack Shenron locale
   (`C:\shenron\deploy\docker`) doit rester saine. Builds lourds de release : runners GitHub.
8. Outils : `aphrody` > `yolo` > `bun` > CLI Rust ; `git` et `gh` autorisés. Node absent : `bun`, `bun x`.
9. Formatage : prettier dans le fork, oxfmt dans Aphrody/Shenron. Tests ajoutés au fichier existant le plus
   proche ; tests du fork propres à Aphrody dans `test/internal/`, `test/integration/next-*`,
   `test/integration/bun-plugin-tailwind/`, `test/js/first_party/`.
10. Rapport final en français, concis : fait (commits, versions, tests chiffrés), puis seulement l'impossible prouvé.
11. **Limite ou manque de Bun = patch dans le cœur du fork.** Tout bug, toute API manquante ou incompatible, toute
    lenteur de Bun (runtime, Bun.build, Bake, install, test, Node/Web compat) vue par un agent se corrige directement
    dans `C:\bun` (`src/**` Rust/C++/JS, WebKit via chantier P), avec un test qui échoue sur `USE_SYSTEM_BUN=1` et
    passe sur `bun bd test`, sans régression de démarrage (chantier O). Jamais de shim, polyfill ou contournement dans
    m3, Shenron, Aphrody ou les plugins ; les contournements existants sont supprimés une fois le patch livré.
12. **Bun est le seul shell.** Toute la logique passe par Bun Shell (``$`…` ``), `bun -e` ou des scripts `.ts` lancés
    par bun ; pas de nu, pwsh ni bash.
13. **Aucun build ni test pendant le travail** (ni `bun bd`, ni `bun test`, ni cargo build/check, ni build release,
    ni `next build`, ni conteneur Docker de build). On code le plus vite possible et on écrit les tests sans les
    lancer. Main fait **une seule** passe de build et de tests à la fin et les échecs sont corrigés en un lot. Le
    rapport final liste les fichiers modifiés et les tests à lancer. Le verrou `<buildDir>/.build.lock`
    (`scripts/build/lock.ts`) sérialise les builds de cette passe finale.

## 2 bis. Méthode de travail — gagner du temps

Ne jamais attendre une commande longue en premier plan ; paralléliser ; lire peu, chercher précisément.

- **Tâches longues → tmux natif partagé** (psmux 3.3.8 = `tmux` Windows natif, session `aphrody` ; **plus de
  WSL**) via `scripts/aphrody/tmux.ts` (`tmux.sh` y renvoie) :
  ```sh
  bun scripts/aphrody/tmux.ts run bd-E -- 'bun bd'                          # Windows natif (pwsh, MSVC 14.44)
  bun scripts/aphrody/tmux.ts run cargo-L --cwd C:/aphrody -- 'cargo test -p x'
  bun scripts/aphrody/tmux.ts run test-J --linux --cwd C:/shenron -- 'bun test'   # conteneur Alpine 3.24 (musl)
  bun scripts/aphrody/tmux.ts run test-J --ubuntu --cwd C:/shenron -- 'bun test'  # conteneur Ubuntu 26.04 (glibc)
  bun scripts/aphrody/tmux.ts run bd-N --alpine --sync-head --cpus 8 --memory 10g -- 'bun run build'
  bun scripts/aphrody/tmux.ts ls | logs <nom> [n] | wait <nom> | kill <nom> | attach
  ```
  Nom de job = `<action>-<chantier>` ; journal dans `tmp/tmux/<nom>.log` (lisible avec Read), code de sortie
  dans `tmp/tmux/<nom>.exit`. Avant un `bun bd`/`cargo build` lourd, `tmux.ts ls` : ne pas lancer deux builds
  natifs du fork en même temps (un seul `bun bd` à la fois, nom `bd-*`).
- **Linux = Alpine d'abord** : `--linux` = `--alpine` = image `aphrody/build-alpine:3.24`
  (`scripts/aphrody/alpine.Dockerfile` : musl, LLVM 23 d'edge, cmake 4, mold, nightly de `rust-toolchain.toml`
  hôte musl, bun, node) ; `--ubuntu` = `aphrody/build-linux:26.04` (`scripts/aphrody/linux.Dockerfile` : glibc 2.43
  comme vps/dbfr, LLVM 22 + 23). Le répertoire est monté sur `/work` ; avec `--sync` (HEAD + modifications non
  commitées) ou `--sync-head` (HEAD seul, sans le travail en cours des autres agents), `/work` est un volume nommé
  `aphrody-src-<distro>` (checkout git, symlinks et modes corrects, `build/` conservé entre jobs). Ressources :
  `--cpus` (défaut 6), `--memory` (défaut 6g, plafond 10g) ; cache WebKit/ccache dans `aphrody-build-cache-<distro>`.
  Les binaires de release Linux restent croisés depuis Debian (sysroots d'upstream) ; le build natif est vérifié
  par `aphrody-linux-build.yml`.
- **CI locale = nektos/act** (winget, 0.2.89) : tester un workflow avant de pousser, sans minutes GitHub.
  `.actrc` mappe `ubuntu-*` sur `aphrody/build-linux:26.04` (`alpine-3.24` sur `aphrody/build-alpine:3.24`) ; `bun scripts/aphrody/act.ts list | run <workflow>
[-j job] [-n] | tmux <nom> <workflow>`. Secrets lus depuis l'env (`-s NAME`). L'image doit contenir `node`
  (actions JS).
- **Sinon, tâches de fond de l'outil Bash** (`run_in_background: true`) : notification à la fin, pas de
  `sleep`/polling. `gh run watch` et `cargo test` longs aussi en fond.
- **Sous-agents** : déléguer les recherches larges (agent `Explore`/`yolo:explore`) et les sous-tâches
  indépendantes à fichiers disjoints (agents `yolo:*` : `rust-engineer`, `test-runner`, `build`, `lint-workflow`,
  `node2bun`, `devops-engineer`, `docs-researcher`…), plusieurs en parallèle dans un même message. Pour une
  orchestration multi-étapes (revue + vérification, migrations en éventail), utiliser l'outil **Workflow**
  (autorisé par l'utilisateur), taille moyenne (< 10 agents).
- **Skills** : charger celle qui couvre la tâche avant de commencer (`yolo:bun-doctrine`, `yolo:docs`,
  `yolo:yolo`, `aphrody:*`, skills du dépôt `.claude/`). Liste et usage : mémoire `bun-skills-catalog`.
- **MCP aphrody d'abord** : docs (`bun_docs_search`/`read`, `docs_auto_search`, `context7_query_docs`), sources
  amont (`upstream_search`/`read`/`tree`), web (`aphrody_search`, `universal_web_fetch`), GitHub
  (`github_tree`, `github_docs_search`), `n2b`, `nu_eval`. Mémoire `bun-mcp-tools`.
- **Graphe et mémoire** : `aphrody graph --source graph:bun query …` pour trouver appelants/structure avant de
  lire des fichiers ; `aphrody memory search --agent-id bun …`.
- **Shell** : `rg`/`fd`/`sd`, `bun -e`, Bun Shell, `nu` ; lectures ciblées (`rg -n`, `sed -n a,bp`) plutôt que
  des fichiers entiers ; commandes indépendantes dans un même appel.
- **Visual Studio** : VS 2026 (18) et 2022 installés ; le build du fork impose le toolset MSVC **14.44**
  (`scripts/vs-shell.ps1`, vérifié par `checkNativeMsvcToolset`) — 14.51 casse l'ABI avec WebKit. cdb/WinDbg
  pour les crashs natifs. `sccache` actif pour Rust.
- **Docker local** (Docker Desktop, 12 CPU / 12 Go ; pas de bind-mount massif de `C:\` en boucle chaude :
  copier dans un volume pour les gros builds) : conteneurs `--cpus 6 --memory 6g`, volumes de cache nommés
  (`bun-cache:/root/.bun/install/cache`, `cargo-registry`, `cargo-target-<chantier>`), BuildKit (`docker buildx`,
  `--cache-to/--cache-from type=local`). Jamais le VPS.

## 3. Chantiers

Statut : ✅ fait · 🔄 en cours · ⏳ à faire. Un chantier = un propriétaire ; hors de ton périmètre, coordonne
par `git pull --rebase` et ne réécris pas le travail d'un autre.

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

### C. Next sur Bun — `@aphrody/next-bun` (🔄)

Fichiers : `packages/bun-next/**`, `test/integration/next-bun*/`, `test/integration/next-app/`.

- ✅ J0 fixture App Router ; J1 build Pages Router via Bun.build (`withBun`).
- ✅ Couche Next d'Aphrody absorbée : runner `next-bun dev|build|start`, codemods, helpers instant-navigation.
- ✅ Patch accepté pour tout Next 16.x ≥ 16.1.6 ; build Pages Router vérifié sur 16.1.6, 16.4.0 (`latest`) et
  16.5.0-canary.4 (`1172f762478`).
- ✅ `@aphrody/next-bun` 0.2.0-aphrody.1 publié sur npm (`e8cf6388174`) ; Aphrody (m3-next, m3-next-migrate,
  web-test) en dépend depuis npm (aphrody `dc2eea357`).
- ✅ Shim `node` du runner : nécessaire sous Linux (Docker) et Windows (Turbopack lance `node` pour PostCSS et
  les loaders), conservé ; test next-app « no node on PATH » (`1172f762478`).
- ⏳ Suite du plan détaillé (`packages/bun-next/docs/PLAN.md`) : App Router via Bun.build, dev/HMR.

### D. Plugin Tailwind CSS — `@aphrody/bun-plugin-tailwind` (✅)

Fichiers : `packages/bun-plugin-tailwind/**`, `test/integration/bun-plugin-tailwind/`, entrée dans
`scripts/aphrody/publish-npm.ts`.

- ✅ Tailwind v4 (`@tailwindcss/node` + oxide) sans Node : Bun.build, serveur HTML (`[serve.static] plugins`),
  HMR, minify, optimize Lightning CSS, sourcemaps, toutes les directives, candidats du graphe de modules,
  `tailwindcss` résolu sans install ; parité avec `bun-plugin-tailwind` d'oven-sh et au-delà (a9910769013).
- ✅ Patch cœur : sourcemaps CSS dans `Bun.build` (external/linked/inline), mapping par règle dans le printer
  `src/css`, `sourcesContent` CSS, commentaires `/*# … */`, composition avec la map d'entrée du fichier
  (`sourceMappingURL` data: ou fichier) ; tests `test/bundler/esbuild/css.test.ts` « css source maps »
  (71f91419311). Le plugin suit l'option `sourcemap` du build, map exacte avec les `@import` à schéma
  (`m3:theme.css`) (43607890888). À faire après la passe unique : publier
  `@aphrody/bun-plugin-tailwind@0.1.0-aphrody.2` et monter la dépendance dans aphrody (m3, shenron).
- ✅ Export `/postcss` (ESM + CJS, build `dist/` pour Node) ; `withBun({ tailwind, plugins })`, CSS globaux et CSS
  modules dans le chemin Bun.build de next-bun (6c44336f2aa, publié dans `@aphrody/next-bun@0.2.0-aphrody.2`).
- ✅ Préréglage M3 (`theme: "m3"`, `/m3`) sur `@aphrody/m3-tokens` et `m3-tailwind` ; `m3/src/tailwind.ts`
  d'Aphrody consomme le plugin (aphrody 3c70e77d3 ; fonts-sync sous Windows acd731475).
- ✅ 17 tests (`test/integration/bun-plugin-tailwind/`), README, `docs/bundler/html-static.mdx` (486cea3937e),
  npm `@aphrody/bun-plugin-tailwind@0.1.0-aphrody.1` (7fca787d46c).

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

### J. Shenron sur le fork (✅)

Côté Shenron : `apps/site` (next.config.ts, scripts), `deploy/docker/**`, bun.lock ; côté fork : ajouts génériques
dans `packages/bun-next`.

- ✅ Contournements génériques déplacés dans `@aphrody/next-bun` (`withBun` : racine du workspace pour Turbopack et
  le tracing, `alias`/`dedupe` pour Turbopack et webpack, `transpilePackages` détecté par les conditions de bundler,
  préfixe d'assets et deploymentId gelés au build pour `next start` ; `flattenStandalone` + `next-bun standalone`)
  : fork `ea3bb1fea65`, `e503596a35e`, publié `@aphrody/next-bun@0.2.0-aphrody.1`. `DIST_ALIASED` : pas de défaut
  dans m3 (sources publiées sans extension), contournement supprimé ; `typescript.ignoreBuildErrors` supprimé (Next
  16.5 vérifie les types sans erreur de chemin).
- ✅ Runtime = fork : `packageManager bun@1.4.3-aphrody.1`, `@aphrody/bun-runtime`, action CI `.github/actions/setup-bun`
  (release du fork), Dockerfiles sur `ubuntu:26.04` + release du fork, `cloud-setup.sh` et image `aphrody-build`
  (Aphrody `fa0964cb5`) via `scripts/aphrody/install.sh`. Next 16.5.0-canary.4 ; scripts `next-bun dev|build|start` ;
  Shenron `7b1784ee`, `e2856cf0`, `d1c40600`.
- ✅ Build local (`next-bun build`, mode compile) vert ; tests du site 1592 pass. Artefacts Linux construits sur le
  binaire Linux du fork dans Docker local (`aphrody/build-linux:26.04`, `--cpus 6 --memory 6g`, site 135 s et 2,6 Gio
  RSS), image `localhost/shenron:fork-bun` (`ubuntu:26.04`) servie à côté de la stack (337 Mio RSS, 200 sur
  `/`, `/wiki`, `/news`, `/games`, chunks). Tailwind via `@aphrody/bun-plugin-tailwind/postcss` (0.1.0-aphrody.2,
  correctif `dir-dependency` fork `ab63e3b47a3`) : CSS identique octet pour octet à `@tailwindcss/postcss`.
- ⚠️ Binaire Windows `1.4.3-aphrody.1` inutilisable (MSVC 14.51, chantier E/B) : en local Windows, le `bun` système
  sert jusqu'à la release `.2`.

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

### M. Fork Next.js + Turbopack — `aphrody-labs/next.js` (🔄 démarré le 2026-10-09 sur demande, branche canary)

Reproduire pour Next.js le workflow appliqué à Bun, plus la bunisation agressive par le nouveau n2b
(`packages/bun-n2b`) de Next et de Turbopack (pnpm → bun, jest → bun test là où c'est possible, APIs Node → Bun) :

- ⏳ Fork `vercel/next.js` → `aphrody-labs/next.js` (clone local `C:\next.js`, remotes `origin` + `upstream`), branche
  `main` (canary upstream).
- ⏳ Scope `@aphrody` : script `scripts/aphrody/scope.ts` (renommage idempotent des paquets publiés, `--check`/`--write`)
  et `scripts/aphrody/sync-upstream.ts` (fusion à trois voies tenant compte du renommage) + workflow
  `aphrody-upstream-sync.yml` toutes les 6 h + tests `test/internal/aphrody-*`.
- ⏳ Publication : npm (`@aphrody/next`, `@aphrody/next-swc-*`, paquets `@next/*` renommés), crates.io pour les crates
  Rust publiables, release GitHub ; workflows `aphrody-publish-*` / `aphrody-release`.
- ⏳ Le patch et l'intégration Bun de `@aphrody/next-bun` deviennent des commits du fork Next (support Bun natif :
  runtime, PostCSS sans Node, Bun.build) ; `@aphrody/next-bun` se réduit à ce qui reste côté Bun.
- ⏳ Absorber la couche Next restante d'Aphrody/Shenron qui relève de Next ; Aphrody et Shenron consomment
  `@aphrody/next`.
- ⏳ `APHRODY.md` et `PLAN.md` propres au fork Next ; graphe `aphrody graph --source graph:next` et mémoire.

### Q. Fork Tailwind CSS — `aphrody-labs/tailwindcss` (🔄)

Clone `C:\tailwindcss` (`origin` fork, `upstream` tailwindlabs), même workflow que Bun et M : scope `@aphrody`
(`@aphrody/tailwindcss`, `@aphrody/tailwindcss-oxide-*`), sync upstream 6 h, publication npm + crates, `PLAN.md` propre.
Le fork porte déjà 1 commit Aphrody (à auditer) ; récupérer les anciens patches de `forks/tailwindcss` dans
l'historique d'Aphrody (`m3/docs/guides/FORKS.md`, avant `2dc8354a01`). Bunisation n2b : pnpm → bun, vitest → bun test,
APIs Node → Bun là où c'est plus rapide, oxide construit par le toolchain du fork. `@aphrody/bun-plugin-tailwind`
consomme ensuite `@aphrody/tailwindcss`.

### R. Fork Base UI + M3 — `aphrody-labs/base-ui` (🔄)

Clone `C:\base-ui` (`origin` fork, `upstream` mui/base-ui), même workflow. Anciens patches de `forks/base-ui` et travail
M3 d'Aphrody (`m3/*`, `@aphrody/material-web`, thème/tokens M3) appliqués à Base UI : composants Base UI stylés M3 via
Tailwind (`@aphrody/base-ui`, `@aphrody/m3-base-ui`). Bunisation n2b (bun install/test, happy-dom).

- ✅ Fork resynchronisé (fast-forward sur `mui/base-ui` 7e4b2f921, poussé). Archéologie : l'ancien `m3/forks/base-ui`
  (base upstream 19511bb17) ne portait aucun patch de source, seulement un remplacement textuel pnpm→bun en partie cassé ;
  rien à réappliquer.
- ✅ Outillage du fork (base-ui `99d727aa6`, `17b332ff3`) : `scripts/aphrody/bunify.ts` (scripts pnpm/npx/node/tsx → bun,
  Vitest jsdom → `bun test`, `packageManager bun@1.4.3-aphrody.2`), `sync-upstream.ts` (6 h, fusion à trois voies via
  `bunify.rewrite`, `bun.lock` régénéré), `publish-npm.ts` (`@aphrody/base-ui`, `@aphrody/base-ui-utils`, versions
  `<upstream>-aphrody.N`, dépendance interne en alias `npm:` : aucun import réécrit), workflows, action `setup-bun`
  (release du fork), secrets `NPM_TOKEN`/`APHRODY_SYNC_TOKEN`, `bunfig.toml` + `test/setupBunTest.ts` (happy-dom,
  réutilise `test/setupVitest.ts`), `APHRODY.md`, `PLAN.md`, `bun.lock` (migration pnpm).
- ✅ Cœur Bun (§2.11, non exécuté, directive du 2026-10-09) : un workspace sans `"name"` prend le nom de son dossier comme
  npm (install et `bun pm migrate` pnpm, au lieu de « Missing name » / « missing workspace name » / panique) ;
  `allowBuilds`/`onlyBuiltDependencies` de `pnpm-workspace.yaml` → `trustedDependencies`. Tests :
  `test/cli/install/bad-workspace.test.ts -t "without a name"`, `test/cli/install/migration/pnpm-lock-v9.test.ts -t
  "pnpm-workspace.yaml"`.
- ⏳ Les `name` ajoutés à `test/{bundle-size,performance,public-types}/package.json` de base-ui sont à retirer quand
  `FORK_BUN` pointe sur une release contenant ce correctif.
- ⏳ Cœur Bun : la migration pnpm perd les overrides à clé versionnée/parent (`brace-expansion@1`, `js-yaml@4`,
  `nanoid@3`, `a>b: '-'`) ; `vi` de bun:test incomplet pour Base UI (fake timers, `advanceTimersToNextFrame`,
  `importActual`, `hoisted`, `stubGlobal`…).
- ⏳ Première publication npm (build `code-infra` sous Bun), puis `@aphrody/m3-baseui` (Aphrody `m3/packages/m3-baseui`,
  gardé dans m3 et consommé par S) via l'alias `"@base-ui/react": "npm:@aphrody/base-ui@…"` + preset m3-tailwind,
  `m3:theme.css` (D), Material Symbols ; audit md-spec-checker.

### S. Framework full Bun (🔄)

Framework complet sans Node : Bun.serve + Bake (`src/runtime/bake`) pour dev server/HMR/RSC, Bun.build pour la prod,
routage `app/` compatible Next (`page`/`layout`/`route`, Server Components, Server Actions), Tailwind via
`@aphrody/bun-plugin-tailwind`, UI Base UI + M3 (R). Réutilise ce qui est bunisé dans M/Q/R (Turbopack/next-swc si plus
rapide). Aucun coût au démarrage de `bun` (chantier O). Shenron sert d'application de validation.

### T. m3 full Bun — `C:aphrodym3` hors framework (🔄)

Racine : `C:aphrodym3`. Périmètre : m3-tokens, -theme, -front, -react, -tailwind, -icons, -fonts, -motion, -primitives,
-forms, -ai, -explorer, -design, -codemods, -reader, -mcp, -os-themes, eslint-plugin-m3, material-design-icons, assets,
canvas, identity, app-ui, rg-ui, web-to-tauri et `scripts/`. Le framework (m3, m3-bun, m3-config, m3-next,
m3-next-migrate, scaffold, templates, apps) = S ; m3-baseui = R. Dépendances TanStack gardées (décision S).

- ✅ État initial : aucun vite/vitest/jest/pnpm/tsx/ts-node/esbuild/webpack dans l'outillage (seules des chaînes de
  détection de frameworks restent dans web-to-tauri). Tests = `bun test` + happy-dom, builds = `Bun.build`.
- ✅ `eslint-plugin-m3` est déjà un plugin oxlint JS (`jsPlugins`, compatible ESLint), testé par oxlint réel : rien à convertir.
- ✅ `scripts/yolo.ts` lance le CLI Bun de yolo (`bun run $YOLO_ROOT/packages/engine/yolo/src/index.ts`) partout, plus le
  lanceur bash ; le banc `scripts/bench` en bénéficie (ancien échec de syntaxe corrigé). Les tests du dépôt sont limités à
  `./packages/*` (avant : `--filter "*"` lançait tout le monorepo Aphrody).
- ✅ rg-ui intégré au workspace (deps Rosegriffon en peers optionnels typés), typecheck, tests (96 pass, 1 skip sans le site) ;
  m3-design (typeRoots du typecheck généré + délai du hook), app-ui (`allowImportingTsExtensions`).
- ✅ `node:*` → API Bun, commits `refactor(<pkg>): node:* to Bun APIs` : app-ui, web-to-tauri, canvas, m3-front, m3-mcp,
  m3-primitives, m3-fonts, m3-tokens, m3-tailwind, m3-icons, m3-react, m3-os-themes, material-design-icons, assets,
  m3-codemods, scripts/. Non exécutés après la directive du 2026-10-09 (pas de test avant la passe finale de main) :
  voir la liste de tests à lancer dans le rapport. Restent en `node:*` par nécessité : `node:path`/`node:os`, `mkdtemp`,
  `rm` récursif, `mkdir` vide, `symlink`/`lstat`/`chmod`, `readdir withFileTypes`, `isIP`, API publiques synchrones
  (`readFileSync`/`existsSync`), `node:zlib` (format zlib des PNG).
- ⏳ Manques Bun à corriger dans le cœur (§2.11, avec test `USE_SYSTEM_BUN=1` en échec / `bun bd test` en succès) :
  `Bun.write` sans option `mode` (chmod à l'écriture) ; `Bun.Glob.scan` lève ENOENT si `cwd` n'existe pas ; pas d'équivalent
  Bun de `Bun.deflateSync` au format zlib (`node:zlib.deflateSync` produit l'en-tête 78 9c).
- ⏳ `packages/assets` : les `index.ts` générés (images, videos, svgs) sont périmés (en-tête `pnpm assets gen`) ; régénérer par `bun run gen`.
- Note : les tests de m3-next-migrate laissent des `m3/apps/m3-migrate-contract-*` qui cassent `bun install` (nom de workspace
  dupliqué) : à corriger côté S.

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
- 🔄 n2b pour les chantiers M/Q/R (bunnisation de gros monorepos) : catalogs/overrides pnpm, vitest/jest → bun test,
  `--since <ref>`, `--migrate --dry-run`, manifeste borné au dépôt ; version 0.7.1.

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

## 4. Vérification commune avant chaque push

```sh
bun scripts/aphrody/scope.ts --check
bun test test/internal/                       # scripts aphrody du fork
bun test test/integration/next-bun/ test/integration/next-bun-pages/
bun test test/integration/next-app/test/next-app.test.ts
bun bd test <fichier>                         # tout changement natif (src/**)
```

## 5. Mémoire

Fiches dans `C:\Users\aphro\.claude\projects\C--bun\memory\` (index `MEMORY.md`), synchronisées par
`aphrody memory write --agent-id bun --id <name> --tag … --content - < fichier`. Mettre à jour la fiche du
chantier touché (`bun-fork-aphrody`, `next-on-bun-plan`, …) à la fin du lot.
