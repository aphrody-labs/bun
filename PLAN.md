# Plan — aphrody-labs/bun, noyau d'Aphrody

> Correction propriétaire du 2026-10-09 : Aphrody et Bun peuvent être développés et construits sur tout hôte qualifié. Sélectionner checkout, cible, outils, ressources et droits selon le contexte ; les chemins Windows ci-dessous sont des exemples du poste courant. Yoyo / aphrody-dev administre tout Aphrody Labs ; Omar administre DBFR. WSL est retiré du workflow du poste actuel.

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
  `--cache-to/--cache-from type=local`). Jamais le VPS.

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
