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

## 2 bis. Méthode de travail — gagner du temps

Ne jamais attendre une commande longue en premier plan ; paralléliser ; lire peu, chercher précisément.

- **Tâches longues → tmux natif partagé** (psmux 3.3.8 = `tmux` Windows natif, session `aphrody` ; **plus de
  WSL**) via `scripts/aphrody/tmux.ts` (`tmux.sh` y renvoie) :
  ```sh
  bun scripts/aphrody/tmux.ts run bd-E -- 'bun bd'                          # Windows natif (pwsh, MSVC 14.44)
  bun scripts/aphrody/tmux.ts run cargo-L --cwd C:/aphrody -- 'cargo test -p x'
  bun scripts/aphrody/tmux.ts run test-J --linux --cwd C:/shenron -- 'bun test'   # conteneur Ubuntu 26.04
  bun scripts/aphrody/tmux.ts ls | logs <nom> [n] | wait <nom> | kill <nom> | attach
  ```
  Nom de job = `<action>-<chantier>` ; journal dans `tmp/tmux/<nom>.log` (lisible avec Read), code de sortie
  dans `tmp/tmux/<nom>.exit`. Avant un `bun bd`/`cargo build` lourd, `tmux.ts ls` : ne pas lancer deux builds
  natifs du fork en même temps (un seul `bun bd` à la fois, nom `bd-*`).
- **Linux = Ubuntu 26.04 LTS** (glibc 2.43, LLVM 22, mold, cmake 4), même OS/glibc que les hôtes vps et dbfr :
  image `aphrody/build-linux:26.04` (`scripts/aphrody/linux.Dockerfile`), utilisée par `--linux`. Les binaires de
  release Linux gardent le sysroot glibc ancien d'upstream (portabilité) ; les binaires destinés à vps/dbfr se
  construisent et se testent dans ce conteneur.
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

### B. Release du binaire — limites (🔄)

Fichiers : `.github/workflows/aphrody-release.yml`, `scripts/aphrody/publish-runtime.ts`, `scripts/build/**`
(version), `test/internal/aphrody-publish-runtime.test.ts`.

- ⏳ glibc ancienne comme upstream (aujourd'hui ≥ 2.38) ; LTO en release.
- ⏳ Cibles linux-x64-musl, linux-aarch64-musl, darwin-x64, windows-arm64 (+ baseline si upstream).
- ⏳ `bun --version` affiche `1.4.3-aphrody.N`.
- ⏳ Origine et retrait de la version npm `0.0.0-stage` ; `latest` correct.
- ⏳ Publier `@aphrody/bun-mdx-rs` (+ plateformes) et `@aphrody/web-inspector-bun`.
- ⏳ Release `aphrody-v1.4.3-aphrody.2` verte, vérifiée sur GitHub et npm.

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
  HMR, minify, optimize Lightning CSS, sourcemaps (PostCSS et API `TailwindRoot` ; le printer CSS de Bun n'émet
  pas de map), toutes les directives, candidats du graphe de modules, `tailwindcss` résolu sans install ; parité
  avec `bun-plugin-tailwind` d'oven-sh et au-delà (a9910769013).
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
- ✅ `require()` d'un chemin absolu mêlant `\` et `/` sans extension → `__dirname` faux et module en double :
  `load_extension` construit le chemin depuis l'entrée (`dbe3387ccf9`), test dans `require.test.ts`.
- ✅ `which.test.ts` : cas `.com` du cwd indépendant de `NoDefaultCurrentDirectoryInExePath` (`e97556dd6c7`).

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
- Reste : `docs/ecosystem/{MCP-TOOLS.md,ecosystem.json}` et `docs/reference/workspace/TOOLS.md` (générés) gardent
  l'ancienne description « vendored » de `bun_docs_*` jusqu'à leur prochaine régénération.

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

- ⏳ ~105 échecs de `packages/infra/workspace` (dont 5 `cli-help.test.ts`) corrigés dans le code.
- ⏳ `aphrody_ffi.dll` construite ; `sites.test.ts` et `next-instant.test.ts` de web-test passent.

### J. Shenron sur le fork (🔄)

Côté Shenron : `apps/site` (next.config.ts, scripts), `deploy/docker/**`, bun.lock ; côté fork : ajouts génériques
dans `packages/bun-next`.

- ⏳ Contournements génériques de `apps/site/next.config.ts` (alias next-intl, `DIST_ALIASED`, workarounds
  Turbopack-sous-Bun) déplacés dans `@aphrody/next-bun` ; cause `DIST_ALIASED` corrigée dans m3 (exports
  `import` → sources `.ts` non résolvables).
- ⏳ Runtime = binaire du fork (local, Docker, CI) ; Next = dernier ; scripts `next-bun` + `withBun`.
- ⏳ Build complet local + image Docker sur Docker local ; Tailwind via `@aphrody/bun-plugin-tailwind` une fois
  publié.

### K. CLI Aphrody (✅)

Côté Aphrody : `crates/ai/code-graph`, `crates/engine/yolo-core`, `crates/infra/{yolo,git,aphrody-command}`,
`crates/os/kernel/core` (cloud), `crates/ai/mcp` ; réinstallation du binaire.

- ✅ graph (points 1-8) : résolution inter-crates, chemin orienté, `explain` `file::symbol`, pas de liaison
  d'homonymes, rapport enrichi, graphe Markdown, causes d'erreur d'extraction, `delete`/`drop` — `8d3109124`.
- ✅ yolo (9-15) : ressources sans `APHRODY_YOLO_ROOT`, tiers verify ignorés proprement, gates réels du source
  Bun, workspaces Cargo/package.json, état dans `~/.aphrody/yolo`, index fs TSV (.gitignore, .git exclu,
  requêtes multi-mots), `require()` et enums — `e3aa1d730`.
- ✅ git (16) : `git inspect` log, hotspots, ahead/behind par remote — `922f9835c`.
- ✅ MCP (17-20) : `github_branches` paginé/filtré (50 par défaut) — `d027032d8` ; `bun` au catalogue upstream
  (`checkout: ../bun`) et `upstream_search` sans jeton → recherche dans le checkout local ; `docs_auto_search`
  WebKit → `/websites/webkit` et sections bornées ; `coding_style_guide` `c++`/`cpp`/`ts`/`bash` — inclus
  dans `3c70e77d3` (commit groupé d'un autre agent).
- ✅ `aphrody scan` (21) : chemin absolu du rapport en fin de sortie, sans `-o` résumé seul, `-o -` JSON seul —
  `3c70e77d3` + `8648e2d0a`.
- ✅ Binaire release réinstallé (`aphrody self install-path`, `aphrody 1.0.0-canary`, aphrody-mcp relié) ;
  `graph:bun` reconstruit (19 783 fichiers, 116 085 nœuds) et `claude-memory-bun` (573 nœuds).

### M. Fork Next.js — `aphrody-labs/next.js` (⏳ après la fin de tous les autres chantiers ; le dépôt existe déjà, branche canary)

Démarre seulement quand B à L sont terminés. Reproduire pour Next.js le workflow appliqué à Bun :

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

### L. oxc et n2b dans le fork (🔄)

Fichiers : `packages/bun-n2b/**`, `packages/bun-oxc/**`, `test/integration/bun-plugin-n2b/`,
`test/integration/bun-plugin-oxc/`, `scripts/aphrody/publish-crates.ts`, `scripts/aphrody/publish-native.ts`,
`.github/workflows/aphrody-publish-native.yml`. Côté Aphrody : `crates/compat/{n2b,n2b-core,n2b-registry,n2b-types,oxc-bridge}`
(supprimés), `packages/engine/n2b-client` (absorbé), deps `aphrody-n2b*`/`aphrody-oxc-bridge`/`oxc_*` du workspace,
consommateurs `aphrody-command`, `mcp`, `ffi`, `bun-docs` (Cargo.toml seulement), docs `docs/*/compat/n2b/`.

- ⏳ Code déplacé : `packages/bun-n2b/` (workspace Cargo séparé : `aphrody-n2b`, `-core`, `-registry`, `-types` + addon
  napi) et `packages/bun-oxc/` (`aphrody-oxc-bridge` + addon napi) ; Oxc à la dernière version publiée.
- ⏳ `@aphrody/bun-plugin-oxc` (transform/minify/lint/format, plugin natif `onBeforeParse` + API JS) et
  `@aphrody/bun-plugin-n2b` (codemods au chargement/build, CLI `bunx @aphrody/bun-plugin-n2b` = `aphrody n2b`,
  absorbe `n2b-client`) ; binaires napi par plateforme sur npm ; crates sur crates.io.
- ⏳ Aphrody consomme les crates publiées (version exacte) ; sources, deps Oxc inutiles et docs n2b retirées (renvoi).
- ⏳ Tests : cargo test des workspaces du paquet, `test/integration/bun-plugin-{n2b,oxc}/`, cargo check/test des
  consommateurs Aphrody, gates docs.

### N. Alpine d'abord, Ubuntu 26.04 garanti (🔄)

Décision utilisateur (2026-10-09) : le fork est **pensé d'abord pour la dernière Alpine** (3.24.x, musl, LLVM 22,
cmake 4.2, mold, rust 1.96 dans apk) et doit **aussi compiler sur Ubuntu 26.04** (glibc 2.43, = vps/dbfr).
Fichiers : `scripts/build/**` (détection toolchain, deps vendorisées, flags musl), `scripts/build/ci-images/spec.ts`
(`alpineRelease`), `scripts/aphrody/{alpine,linux}.Dockerfile`, `scripts/aphrody/tmux.ts` (`--alpine`),
`.github/workflows/aphrody-*.yml`, tests `test/internal/`.

- ⏳ Image `aphrody/build-alpine:3.24` (`scripts/aphrody/alpine.Dockerfile`) : toolchain native Alpine (clang/lld/llvm
  22 apk, cmake, ninja, mold, rust, bun musl) ; mode `--alpine` du runner (défaut Linux = Alpine, `--linux` = Ubuntu).
- ⏳ `bun run build` (debug puis release) **natif sur Alpine** (pas de cross-compile depuis Debian), toutes deps
  vendorisées (WebKit musl prébuilt, boringssl, libuv…) ; écarts corrigés à la source dans `scripts/build/**`.
- ⏳ Même build natif sur Ubuntu 26.04 (`aphrody/build-linux:26.04`) ; les deux en CI (`aphrody-linux-build.yml` :
  matrice alpine-3.24 + ubuntu-26.04, x64 + arm64), tests de fumée + un échantillon de `bun bd test`.
- ⏳ `alpineRelease` → 3.24 ; les assets `-musl` deviennent l'artefact Linux principal de la release (installeurs,
  `@aphrody/bun-runtime` : musl par défaut sur Alpine, glibc sinon) ; images Aphrody (`aphrody-os`) basées sur Alpine.
- ⏳ Toute dépendance glibc implicite (`dlopen` de libs glibc, `execinfo`, `getauxval`, locales) traitée pour musl.

### O. Garde de performance (🔄)

Le fork ajoute des modules et plugins sans coût au démarrage ni goulot. Fichiers : `bench/aphrody/**`,
`scripts/aphrody/perf-gate.ts`, `.github/workflows/aphrody-perf.yml`, `test/internal/aphrody-perf-gate.test.ts`.

- ⏳ Banc comparatif fork vs upstream (même version, même machine) : démarrage (`bun -e ""`, `bun --version`,
  `bun run` script vide, `bun test` vide), RSS au repos, `require`/`import` des builtins, `Bun.serve` hello
  (req/s, p99), `bun install` hors-ligne, `Bun.build` d'un projet moyen, `next-bun build` de la fixture. Outils :
  `hyperfine`/`bun:jsc`/`Bun.nanoseconds`, résultats JSON.
- ⏳ Seuils (ex. démarrage +2 % max, RSS +1 Mo max) ; CI sur chaque push de `main` et chaque sync upstream ;
  régression = échec + rapport.
- ⏳ Audit des ajouts du fork (paquets `@aphrody/*`, modules internes, plugins Tailwind/oxc/n2b, next-bun) : chargés
  paresseusement, rien d'enregistré au démarrage ; corriger tout coût mesuré.
- ⏳ Optimisations trouvées en chemin (démarrage, résolution, transpileur) proposées comme commits du fork.

### P. Fork WebKit / JavaScriptCore — `aphrody-labs/WebKit` (🔄)

`aphrody-labs/WebKit` existe déjà (fork d'`oven-sh/WebKit`, 1999 commits de retard au 2026-10-09, aucune release).
Fichiers : côté fork Bun `scripts/build/deps/webkit.ts` (source des prébuilts, `WEBKIT_VERSION`) ; côté WebKit
`.github/workflows/**`, scripts de build.

- ⏳ Resynchroniser `aphrody-labs/WebKit` sur `oven-sh/WebKit` au commit `WEBKIT_VERSION` épinglé par le fork ;
  workflow de sync automatique (comme pour Bun).
- ⏳ CI de prébuilts identique à celle d'oven-sh (mêmes noms d'archives : linux x64/arm64 glibc **et musl Alpine**,
  macOS, Windows ; debug/release/LTO/ASAN) publiés en releases `aphrody-labs/WebKit`.
- ⏳ `scripts/build/deps/webkit.ts` : source configurable (`aphrody-labs` par défaut, repli `oven-sh`) ; test.
- ⏳ Tout patch JSC/WebKit utile (perf démarrage, musl, fonctionnalités des plugins) = commit sur
  `aphrody-labs/WebKit`, nouveau prébuilt, bump de `WEBKIT_VERSION`.

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
