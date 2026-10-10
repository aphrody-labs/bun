# Plan — aphrody-labs/bun, noyau d'Aphrody

> Correction propriétaire du 2026-10-09 : Aphrody et Bun peuvent être développés et construits sur tout hôte qualifié. Sélectionner checkout, cible, outils, ressources et droits selon le contexte ; les chemins Windows ci-dessous sont des exemples du poste courant. Yoyo / aphrody-dev administre tout Aphrody Labs ; Omar administre DBFR. WSL est retiré du workflow du poste actuel.

Plan commun à tous les agents qui travaillent sur ce fork (C:\bun), sur le monorepo Aphrody (C:\aphrody) et sur
Shenron (C:\shenron). Lis-le en entier avant de commencer, puis mets à jour ta section (statut, commits) à la fin de
chaque lot. Contexte permanent : [APHRODY.md](APHRODY.md) (ce que le fork fournit à Aphrody),
[CLAUDE.md](CLAUDE.md) (build et tests Bun), [packages/bun-next/docs/PLAN.md](packages/bun-next/docs/PLAN.md)
(plan détaillé Next sur Bun).

## 1. Cible

- 2026-10-10: the isolated VPS Ubuntu owner factory built the changed debug
  runtime and passed 122 tests, with one POSIX host skip and zero failures
  across ten release, installer, plugin, vendor, benchmark and site suites.
  This is scoped debug qualification; production benchmarks, the complete
  runtime suite, other platform builds and registry uploads remain open.

- 2026-10-10: native Windows version synchronization is provided by
  `scripts/aphrody/win/version-sync.ts` (`bun run bun:windows`), defaulting to
  stable source version 1.4.4. It audits tracked scripts/infrastructure and
  separates coupled source manifests from checksum-qualified release pins.
  See `docs/aphrody/windows-version-sync.md` for the plan/apply/check contract.

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
7. **Hôte selon le contexte** : builds natifs, fabrique SSH, Docker ou runners qualifiés.
   Respecter les jobs concurrents, allocations, verrous et caches de l'hôte choisi.
   Le poste courant utilise Windows natif, VPS via SSH ou Docker local Alpine/Ubuntu 26.04 ;
   DBFR est la destination de déploiement actuelle. Aucun hôte n'est imposé par le produit.
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
- **Linux = Alpine d'abord** : `--linux` = `--alpine` = image `ghcr.io/aphrody-labs/alpine:3.24`
  (`scripts/aphrody/aphrody-alpine.Dockerfile`, Aphrody Alpine : musl, LLVM 23 et nightly de `rust-toolchain.toml`
  depuis le dépôt apk d'aphrody-labs/aports, bun, bunsh, node) ; `--ubuntu` = `aphrody/build-linux:26.04` (`scripts/aphrody/linux.Dockerfile` : glibc 2.43
  comme vps/dbfr, LLVM 22 + 23). Le répertoire est monté sur `/work` ; avec `--sync` (HEAD + modifications non
  commitées) ou `--sync-head` (HEAD seul, sans le travail en cours des autres agents), `/work` est un volume nommé
  `aphrody-src-<distro>` (checkout git, symlinks et modes corrects, `build/` conservé entre jobs). Ressources :
  `--cpus` (défaut 6), `--memory` (défaut 6g, plafond 10g) ; cache WebKit/ccache dans `aphrody-build-cache-<distro>`.
  Les binaires de release Linux restent croisés depuis Debian (sysroots d'upstream) ; le build natif est vérifié
  par `aphrody-linux-build.yml`.
- **CI locale = nektos/act** (winget, 0.2.89) : tester un workflow avant de pousser, sans minutes GitHub.
  `.actrc` mappe `ubuntu-*` sur `aphrody/build-linux:26.04` (`alpine-3.24` sur `ghcr.io/aphrody-labs/alpine:3.24`) ; `bun scripts/aphrody/act.ts list | run <workflow>
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
  `--cache-to/--cache-from type=local`). Le VPS sert au build et au dev (nice, checkout et `CARGO_TARGET_DIR` uniques) ; dbfr = prod uniquement.

## 3. Chantiers

Les chantiers sont répartis en deux plans :

- [PLAN-ALPINE-BUN.md](PLAN-ALPINE-BUN.md) — cœur Bun et Aphrody Alpine : A, B, E, F, G, H, I, K, L, N, O, P, U.
- [PLAN-FRAMEWORK.md](PLAN-FRAMEWORK.md) — framework au-dessus du runtime (propriétaire agy) : C, D, J, M, Q, R, S, T.

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

## 6. Buv, PyJS et graphe natif — 2026-10-09

- Plan de compatibilité, performances et livraison : [packages/buv/PLAN.md](packages/buv/PLAN.md).
- Binaire du fork construit dans un checkout isolé : 118 tests natifs réussis ; pont CPython SDK v3 qualifié.
- Sélection du fork et hachage natif Bun : 11 tests réussis. Plugin TS7/Ruff : 11 tests, 119 assertions.
- Moteur de graphe Rust : 47 tests réussis. Exports docs/skills : 2 tests, 15 assertions.
- Indexation `src/<domaine>` et `packages/<paquet>` implémentée ; qualification du nouveau module et Clippy strict en cours.
- Publier les snapshots par domaine avec leurs SHA immuables, puis renouveler l'export SQLite/JSON après les dernières vérifications.

## 7. Qualification Windows native — 2026-10-10

- Durée de vie des appartements COM des notifications corrigée avec RAII ; les trois régressions couvrent les threads non initialisés et les appartements MTA/STA existants. Les cinq tests WinRT natifs passent.
- Registres des handles Job Object/NTFS et administration des catalogues consolidés sur les primitives Bun. La suite Windows/WinRT passe 31 tests, dont NTFS réel et les lectures D3D12.
- Aucun diagnostic strict dans les sept fichiers Rust corrigés sur Windows x64/ARM64 ; 184 diagnostics subsistent ailleurs dans `bun_runtime`. Publication de la release et activation des hôtes restent à qualifier.
- Preuves et limites : [qualification WinRT](docs/project/winrt-apartment-qualification.md).
- Résolveur DNS : 43 tests locaux réussis sur le binaire modifié ; aucun diagnostic strict dans le fichier corrigé sur Windows/Linux GNU x64/ARM64. Le runtime complet conserve 166 diagnostics Windows et 37 Linux GNU. [Preuves DNS](docs/project/dns-native-qualification.md).
- Interfaces Linux : initialisation des sorties système et pointeurs consolidés ; zéro diagnostic dans les sept fichiers sur GNU x64/ARM64, 27 diagnostics restent ailleurs. Test Windows de plateforme non prise en charge réussi ; exécution Linux et activation des hôtes restent à qualifier. [Preuves Linux](docs/project/linux-syscall-qualification.md).
- Graphe natif : registre des tâches sur verrou RAII Bun ; cinq tests natifs réussis (38 assertions), aucune erreur dans le fichier sur Windows/Linux GNU x64/ARM64. Le runtime complet conserve 163 diagnostics Windows et 24 Linux GNU. [Preuves du registre](docs/project/native-graph-lock-qualification.md).
- Pont Python CLI : contrats FFI locaux vérifiés sur le header ABI v1 et sortie native explicite ; 43 tests natifs passent avec PyCUDA/Buv/PyJS et compilation Cython/Nuitka. Aucun diagnostic dans le fichier sur les quatre cibles ; 158 diagnostics Windows et 19 Linux GNU restent ailleurs. [Preuves Python](docs/project/python-host-ffi-qualification.md).
- Lanceurs UV/.NET/MSVC/WinMD : enums de sélection Copy qualifiés sur les quatre cibles ; 17 tests natifs réussis (91 assertions). Le runtime complet conserve 154 diagnostics Windows et 15 Linux GNU. [Preuves des lanceurs](docs/project/native-launcher-dispatch-qualification.md).
- Shell : fin de texte avec quote simple/double ouverte rejetée ; régressions avant/après prouvées. Suites natives : session 34 tests, quotes/substitutions 45, environnement deux. Aucun diagnostic aux sites corrigés sur quatre cibles ; trois diagnostics restent ailleurs dans ces fichiers sur Windows. Runtime complet à 151 diagnostics Windows et 12 Linux GNU. [Preuves shell](docs/project/test-shell-native-qualification.md).
- Host .NET : conversion UTF-8 vérifiée et traduction des erreurs par emprunt ; cinq tests natifs SDK/CLR/TypeScript réussis. Aucun diagnostic dans les deux fichiers sur quatre cibles ; runtime complet à 149 diagnostics Windows et 10 Linux GNU. [Preuves .NET](docs/project/dotnet-host-qualification.md).
- Arguments Windows natifs : WTF-8 conservé dans spawn, stockage argv et lanceur .NET ; régression native avant/après prouvée. 58 tests natifs passent, dont Python/PyCUDA/Buv/PyJS ; bun_core strict passe sur six cibles. Runtime complet : 148 diagnostics Windows et neuf Linux GNU. Projections JavaScript/.NET avec surrogate isolé restent limitées. [Preuves des arguments](docs/project/dotnet-cli-argument-qualification.md).
- Lanceur du plugin : extraction atomique via bun_sys et lancement natif avec environnement possede ; 31 tests Windows passent (810 assertions), extraction a froid qualifiee. Runtime complet strict GNU x64/ARM64 passe ; 139 diagnostics Windows restent ailleurs. [Preuves du plugin](docs/project/agent-plugin-launcher-qualification.md).
- Copie Windows : pointeurs FFI explicites et erreurs empruntees ; suites natives serialisees normale/repli passent 98/97 tests (1492/1487 assertions), huit skips chacune. Zero diagnostic dans le fichier sur quatre cibles ; runtime GNU strict passe, 126 diagnostics Windows restent ailleurs. [Preuves des copies](docs/project/windows-copy-file-qualification.md).
- Plugin installe : les 313 fichiers correspondent par SHA-256 a l'archive embarquee ; bun@aphrody-bun est active dans les configurations Codex et Claude. Le diagnostic current=false provient de 1.4.4-debug versus 1.4.4 ; alignement release et activation en session restent distincts. [Preuves du plugin installe](docs/project/installed-fork-plugin-qualification.md).
- Callbacks Node Windows : snapshots des watchers et sorties FFI cluster qualifies ; 32 tests natifs passent (121 assertions), dix skips existants. Aucun diagnostic dans les deux fichiers sur quatre cibles ; GNU strict passe et 117 diagnostics Windows restent ailleurs. [Preuves Node](docs/project/windows-node-callbacks-qualification.md).
- I/O Blob Windows : frontiere du pool POSIX, sorties FFI et tailles stat consolidees ; suites natives normale/repli passent 109/108 tests (1550/1545 assertions), onze skips chacune. Aucun diagnostic dans les trois fichiers sur quatre cibles ; GNU strict passe, 98 erreurs Windows restent ailleurs. [Preuves Blob](docs/project/windows-blob-io-qualification.md).
- Qualification Linux publiee : checkout VPS isole au commit 4e3ddd04da1, metadonnees Cargo verrouillees et dependances Bun gelees passes. Release/test en tmux sous verrou lourd, quatre jobs ; reprise avec cache propre apres EACCES du cache WebKit global. Processus verifie vivant ; build, tests Linux et activation restent ouverts. [Preflight Linux](docs/project/linux-owner-release-preflight.md).
- Listener Windows : erreurs preservees et binding local transfere aux sockets TCP/TLS sans clone redondant ; 116 tests locaux passent (1513 assertions, dix skips), plus sept tests TLS pipes nommes (809 assertions). Aucun diagnostic dans le fichier sur quatre cibles ; GNU strict passe, 90 diagnostics Windows restent ailleurs. [Preuves listener](docs/project/windows-listener-binding-qualification.md).

- 2026-10-10: Windows IPC exclusive read-buffer borrow and libuv pointer contracts qualified with 40 native passes; strict GNU x64/ARM64 zero, Windows ipc.rs zero with 83 whole-runtime errors remaining. See [qualification](docs/project/windows-ipc-buffer-qualification.md).

- 2026-10-10: Windows shell cp EBUSY state ownership qualified: 30 native passes / 111 assertions; strict four-target cp diagnostics zero, Windows whole-runtime 77 remaining. See [qualification](docs/project/windows-shell-copy-qualification.md).

- 2026-10-10: VPS isolated release completed at 4e3ddd04da1; corrected two CommonJS child-script projections, then all six native suites passed (202 / 1517 assertions). Version/revision/SHA256 recorded in [Linux qualification](docs/project/linux-owner-release-preflight.md). Distribution and DBFR activation remain pending.

- 2026-10-10: Windows bunx native output pointers and portable mock-registry fixture: nine changed-engine passes, strict owned file zero on four targets; Windows runtime 72 remaining. Shared dummy.registry Bun.jest type error reproduced on unchanged baseline. See [qualification](docs/project/windows-bunx-pointer-qualification.md).

- 2026-10-10: private Bun.jest test-helper type restored only in internal test declarations; scoped bunx / shell cp / Linux TypeScript gate now zero. Runtime file-bound contract verified in Jest::call; public Bun types unchanged.

- 2026-10-10: Qualified Linux plain-release candidate delivered by native Infra SFTP into DBFR's isolated runtime-candidates directory; SHA256 agrees source/local/target, native DBFR Linux/Zstd/memfd smoke passes. Production PATH remains 1.4.3-aphrody.3; stripped distribution, full release gates and activation pending. See [proof](docs/project/linux-owner-release-preflight.md).

- 2026-10-10: IPC host cleanup/warning and logical-drive raw output contracts qualified with 36 changed-engine passes / 94 assertions; owned strict diagnostics zero on four targets, Windows whole runtime 65 remaining. See [proof](docs/project/windows-ipc-storage-qualification.md).

- 2026-10-10: COM delegate lifetime and event-log/known-folder pointers qualified with seven native passes / 27 assertions, including real WinRT asynchronous storage operations. Strict owned diagnostics zero on four targets; shared Windows runtime 58 remaining. See [proof](docs/project/windows-com-query-qualification.md).

- 2026-10-10: Stripped Linux artifact at 4e3ddd04da1 independently passed all six suites (202 / 1517 assertions), then native Infra SFTP delivery and DBFR checksum/Linux/Zstd/memfd smoke passed. Compact candidate 138871072 bytes; production activation and full release publication remain pending. See [proof](docs/project/linux-owner-release-preflight.md).

- 2026-10-10: owned Node host consolidation: 137 native tests pass, 4 skips; Windows/Linux x64/ARM64 owned Clippy diagnostics zero. Whole Windows 58 diagnostics and reserved Darwin dependency remain; see docs/project/node-host-consolidation-qualification.md.

- 2026-10-10: Buv/PyJS GPU consolidation refreshed on physical RTX 4070: D3D12 WGSL and CUDA exact 37-element outputs pass; provider checksum unchanged. Published shared-host PyCUDA test retained; native Linux hardware, Alpine ABI and activation still open. See docs/aphrody/buv-pyjs-gpu-consolidation.md.

- 2026-10-10: common native internal gate: 883 pass / 33 skip / 3 fail. Two 5-second failures (src/js lint child, parallel JUnit child) reproduce in isolation (9 pass / 2 fail). Missing published Wintrust Admins Send inventory corrected as native-only catalog handles behind Guarded, without VM state; focused VM-thread gate 48 pass / 0 fail. Generated JSON retains the generator's two-space JSON.stringify style; formatter rewrites unrelated baseline entries and was not applied. Full internal gate remains red.

- 2026-10-10: native src/js lint exposed eight duplicate-property errors in PE parsing; property locals and default-export type corrected. Full src/js native lint now zero warnings/errors (230 files, 5.5 seconds). Its single full-tree test ceiling is 15 seconds, retaining exit/result checks; formatted native gate 8 pass / 1 skip / 36 assertions. Scoped formatter/linter pass. TypeScript's builtin dependency closure remains red outside pe.ts; no pe.ts diagnostics after correction. Parallel JUnit is a real shutdown hang: workers report all cases, but no report/exit within a 15-second diagnostic deadline; investigated separately.

- 2026-10-10: Windows parallel worker shutdown fixed: CDB proves final IPC drain reached JSC finalization outside API lock. Existing JUnit regression now 5 pass, parallel/startup suites 40 pass / 8 skips. Complete native internal suite 886 pass / 33 unchanged skips / 0 fail. Strict GNU x64/ARM64 runtime zero; Windows x64/ARM64 retain 58 unrelated diagnostics, runner file zero on all four. Plugin doctor confirms Codex/Claude assets 1.4.4+2fb86b44ed79; native debug reports 1.4.4-debug, explaining stable-version mismatch without content reinstall. See docs/project/parallel-worker-api-lock-qualification.md.

- 2026-10-10: ConPTY output/timer raw pointer contracts: 140 native passes / 14 skips / 10 inherited todos / 389 assertions, plus final formatted source 16 passes / 5 skips / 50 assertions. Strict GNU x64/ARM64 zero; Windows x64/ARM64 58 -> 55 diagnostics, owned files zero. See docs/project/windows-terminal-timer-qualification.md. Full release and remaining platform/hardware gates remain open.

- 2026-10-10: Windows filesystem watcher now borrows the VM facade shared for task submission, preserving the short event-loop mutation owner. Native watcher/abort/close/race/deadlock suites 49 pass / 11 platform skips / 149 assertions; format pass. Strict GNU x64/ARM64 zero, Windows x64/ARM64 55 -> 53 diagnostics; watcher file zero on all four. See docs/project/windows-fs-watcher-vm-qualification.md.

- 2026-10-10: clean published Windows x64 release at 54619ce189c built with default profile; 995 selected release tests pass / 60 skips / zero failures using supported --expose-internals. Native D3D12/CUDA exact vectors and shared Buv/PyJS PyCUDA pass; plugin Codex/Claude update reports up to date. Source clean, SHA256 and cache/wrapper qualification recorded in docs/project/windows-owner-release-qualification.md. Global release/publication/activation and remaining platform gates stay open.

- 2026-10-10: clean release scope zero and exact Next adapter gate 82 pass / 319 assertions / zero failures. Broad fuzzy test selection stopped before declaring application-gate completion; registry isolation remains required. Infra VPS reclaim plan/apply completed; measured available disk 3.45 -> 6.33 GB. DBFR PATH and isolated Linux checksum unchanged.

- 2026-10-10: real Next applications qualify with an explicitly preseeded offline/frozen cache: 12 native release tests / 251 assertions / zero failures. Pages parity passes 16.1.6, 16.4.0, 16.5.0-canary.4; App Router passes Turbopack/webpack/next-bun without Node/Bun.build, including server actions and client chunks. Owned helper TS/format/lint pass; global config and assertions preserved.

- 2026-10-10: VPS clean owner checkout advanced to 988d73b430a; native release rebuild active under canonical heavy lock, four jobs, explicit measured incremental capacity plan. Windows 40-run strict historical-base comparison passes startup/RSS/throughput thresholds but fails binary size (152247296 vs 96548352 bytes); source versions differ, same-source isolation and size investigation stay open.

Owner internal-fixture lot (2026-10-10): Linux 1122 pass/19 skip/0 fail and Windows 893 pass/33 skip/0 fail at engine 988d73; scoped TS/format/lint zero. See docs/project/windows-owner-release-qualification.md. Full release/deployment remains open.

Owner delivery lot (2026-10-10): common-pin RTX 4070 Dx12/WGSL/CUDA and PyCUDA pass; installed Codex/Claude plugin doctor current=true. Refreshed stripped Linux candidate delivered to DBFR and SHA/Zstd/memfd verified. Production activation and complete publication remain open; see owner qualification documents.

Owner native linker/FileSink lot (2026-10-10): raw pipe pointer contract removes two Windows Clippy diagnostics (51 unrelated runtime errors remain). Windows debug factory passes 70 tests with DEBUG:FULL; Windows x64/ARM64 linker option coverage passes 14 tests. Native GNU x64 strict runtime gate exits zero on VPS. Source flags and static gates recorded in docs/project/windows-filesink-pointer-qualification.md; GNU ARM64 and full release closure remain open.

Owner final gate (2026-10-10): all internal Windows debug tests pass (895 pass/33 skip/0 fail, 146192 assertions); changed-engine scope check zero.

Owner Buv/PyJS pipeline (2026-10-10): executable PyCUDA -> WGSL/D3D12 -> NVRTC CUDA chain verifies 37 exact results on RTX 4070. Shared Python constructor/PID, native resource cleanup and explicit CPU transfers documented. Existing GPU suite 3 pass/0 fail; SDK TypeScript and strict scoped style gates pass. See docs/aphrody/buv-pyjs-gpu-pipeline.md. Direct GPU buffer sharing and full platform release stay open.

Owner cross-target/plugin lot (2026-10-10): native VPS strict GNU ARM64 runtime exits zero with verified official Ubuntu cross headers and LLVM23; no system packages installed. Codex/Claude provider CLIs prove Bun plugin installed/enabled; actual PATH stdio MCP lists 35 tools and successfully calls docs_search/skill_read. PATH still reports 1.4.3; release promotion and live session reload stay open. See docs/project/gnu-arm64-owner-qualification.md and docs/project/plugin-live-server-qualification.md.

Owner Windows memory-pressure lot (2026-10-10): notification worker borrows the closure-owned VmHandle, preserving posting and teardown. Changed debug engine: 28 pass/9 inherited skips/0 fail, 10 snapshots/64 assertions. GNU x64/ARM64 strict zero; owned Windows MSVC x64/ARM64 diagnostics zero, 50 unrelated runtime errors remain. Source formatting passes. See docs/project/windows-memory-pressure-vm-qualification.md; release linkage/performance remains open.
