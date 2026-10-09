# Plan Bun framework — Next, Tailwind, Base UI, m3, Shenron

Tout ce qui tourne au-dessus du runtime : Next.js/Turbopack, Tailwind, Base UI + M3, framework m3 App Router,
m3 full Bun, Shenron. Propriétaire depuis le 2026-10-09 : **agy** (Antigravity CLI, branches `bun` des forks).
Une limite du runtime trouvée ici devient un patch du cœur, consigné dans [PLAN-ALPINE-BUN.md](PLAN-ALPINE-BUN.md).

Règles communes, cible et vérification : [PLAN.md](PLAN.md) (à lire en entier avant de commencer).

## 3. Chantiers

Statut : ✅ fait · 🔄 en cours · ⏳ à faire. Un chantier = un propriétaire ; hors de ton périmètre, coordonne
par `git pull --rebase` et ne réécris pas le travail d'un autre.
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

### M. Fork Next.js + Turbopack — `aphrody-labs/next.js` (🔄 démarré le 2026-10-09, branche canary)

Reproduire pour Next.js le workflow appliqué à Bun, plus la bunisation agressive par n2b (`packages/bun-n2b`) de Next et
de Turbopack. Détail et limites : `APHRODY.md` et `PLAN.md` du fork.

- ✅ Fork `aphrody-labs/next.js`, clone `C:
ext.js` (`--filter=blob:none`, `origin` + `upstream`), branche `canary`
  synchronisée sur vercel/next.js (fusion uniquement).
- ✅ pnpm → Bun (`8a2c9f6785`) : `scripts/aphrody/bunify.ts` (réécriture idempotente : `workspaces`, `overrides`,
  `patchedDependencies`, scripts `pnpm`/`node`/`tsx` → `bun`, hook pre-commit), `bun.lock` migré du
  `pnpm-lock.yaml` upstream, `bunfig.toml` (linker isolé + `publicHoistPattern` de pnpm, `minimumReleaseAge` 48 h).
- ✅ Scope `@aphrody` à la publication seulement (`scripts/aphrody/scope.ts`) : `@aphrody/next`, `@aphrody/next-<x>`,
  `@aphrody/next-swc-<plateforme>` ; dépendances internes en alias npm (`"@next/env": "npm:@aphrody/next-env@V"`), le
  consommateur installe `"next": "npm:@aphrody/next@V"`. `download-swc.ts` et le postinstall
  (`scripts/aphrody/install-native.ts`) ne téléchargent que `@aphrody/next-swc-*`, plus de repli sur Vercel.
- ✅ Sync upstream toutes les 6 h (`aphrody-upstream-sync.yml`, `scripts/aphrody/sync-upstream.ts` : fusion à trois
  voies après bunify, fichiers pnpm gardés supprimés, `bun.lock` re-migré).
- ✅ Release (`8feee3dcfa`) : `aphrody-release.yml` (tag `aphrody-v*` ou manuel) : next-swc sur les 8 plateformes,
  build JS sous Bun, `scripts/aphrody/publish-npm.ts` (version `<base>-aphrody.N` commune, natifs puis JS puis
  `next`), release GitHub. ⏳ Premier run (secret `NPM_TOKEN`, `APHRODY_SYNC_TOKEN`). ⏳ crates.io non fait (crates
  liées par chemins au workspace).
- ✅ Bun natif dans Next (`e4b162850f`) : `packages/next/src/build/bun-build` (port de `lib/build.js`, Bun.build pour
  `next build` Pages Router sous `NEXT_BUN`), `lib/bundler.ts` `isBunBundler()` ; Turbopack
  `turbopack-core::environment::node_executable()` (`TURBOPACK_NODE_BINARY`, sinon le `node`/`bun` hôte, sinon
  `node` du PATH) pour le pool de workers (PostCSS, loaders) et `process.version` : plus de shim `node` sous Bun.
- ✅ `@aphrody/next-bun` : `withBun` utilise le Bun.build intégré de `@aphrody/next` (`NEXT_BUN=1`,
  `configureBunBuild`) ; `patch`, `lib/build.js` et le shim `node` restent pour le `next` de Vercel, à retirer après la
  première publication.
- ⏳ Bunisation n2b des scripts/outillage et jest → bun test par lots (agent n2b en cours dans `C:
ext.js`, branche
  `bun`) ; `packages/next/src` garde `process.env` et les imports `node:` (DefinePlugin, bundles edge/client).
- ⏳ Mesures avant/après (build natif, build d'app exemple, dev cold start) : à faire dans la passe unique de build.
- ⏳ Shenron et Aphrody consomment `@aphrody/next` après la première release.
- Limites Bun relevées (à corriger dans `src/install`, §2.11) : clés `patchedDependencies` sans version ignorées en
  silence (bunify les versionne depuis `bun.lock`) ; les paquets de workspace non déclarés ne sont pas liés à la racine
  comme pnpm (`@next/eslint-plugin-internal` déclaré par bunify). Autres : sccache échoue sur next-napi-bindings sous
  Windows (ligne de commande trop longue), `taskr` « Taskfile not found! » pour `next#build` sous `turbo` (Windows).
- Tests à lancer : `bun test scripts/aphrody/test` (C:
ext.js), jest `packages/next/src/lib/bundler.test.ts`
  et `packages/next/src/build/bun-build/index.test.ts`, `cargo test -p turbopack-core node_executable`,
  `bun bd test test/integration/next-bun/with-bun.test.ts` (C:un).

### Q. Fork Tailwind CSS — `aphrody-labs/tailwindcss` (🔄)

Clone `C:\tailwindcss` (`origin` fork, `upstream` tailwindlabs), même workflow que Bun et M : scope `@aphrody`
(`@aphrody/tailwindcss`, `@aphrody/tailwindcss-oxide-*`), sync upstream 6 h, publication npm + crates, `PLAN.md` propre.
Le fork porte déjà 1 commit Aphrody (à auditer) ; récupérer les anciens patches de `forks/tailwindcss` dans
l'historique d'Aphrody (`m3/docs/guides/FORKS.md`, avant `2dc8354a01`). Bunisation n2b : pnpm → bun, vitest → bun test,
APIs Node → Bun là où c'est plus rapide, oxide construit par le toolchain du fork. `@aphrody/bun-plugin-tailwind`
consomme ensuite `@aphrody/tailwindcss`.

- ✅ Fork à jour sur `tailwindlabs/tailwindcss` (base `fa81d697`, 4.3.3), workflows upstream désactivés, secrets posés.
  Archéologie : seul l'ancien commit `d5f915c3` (remplacement textuel pnpm→bun) existait, remplacé par `bunify.ts`. Trailer
  d'IA retiré de l'historique (force-with-lease, `main` = `9137bbd1`).
- ✅ pnpm → Bun (tailwindcss `937b5902`, `9137bbd1`) : workspaces/catalog/patchedDependencies/trustedDependencies dans
  `package.json`, `bun.lock`, `bunfig.toml` (linker isolé, `bun test`), `pnpm-*.yaml` supprimés, scripts réécrits par
  `scripts/aphrody/bunify.ts`, `pnpm -r`/`pnpm pack` → `scripts/aphrody/workspaces.ts` + `bun pm pack`. L'oxide (napi) se
  charge sous Bun.
- ✅ Outillage : `scope.ts` (`tailwindcss` → `@aphrody/tailwindcss`, `@tailwindcss/x` → `@aphrody/tailwindcss-x`, crates
  `aphrody-tailwindcss-{classification-macros,ignore,oxide}`), `publish-npm.ts` (manifests en staging, dépendances
  internes en alias `npm:`, sources non renommées, version `X.Y.Z-aphrody.N`), `publish-crates.ts`, `place-bindings.ts`,
  `sync-upstream.ts` (6 h, fusion à trois voies après `bunify.rewrite`, `pnpm-workspace.yaml` upstream replié dans
  `package.json`), workflows `aphrody-{upstream-sync,ci,release}.yml`, `APHRODY.md`, `PLAN.md`. Non exécutés (directive
  du 2026-10-09) ; test : `bun test scripts/aphrody/aphrody.test.ts` dans `C:\tailwindcss`.
- Mesure (avant les patchs du cœur) : vitest sous Bun 37,5 s, 5463 réussis ; `bun test packages` 58 s, 5238/5494.
- ✅ Cœur Bun (§2.11, `984c0a12081`, non compilé ni exécuté) : module `bun:vitest` (import `vitest` sous `bun test`,
  contexte de test `{expect, task, skip, signal, onTestFinished, onTestFailed}`, séparateur ` > `), `expect.getState/setState`,
  `resolves/rejects` sur fonction, `expect.addSnapshotSerializer` (valeur de premier niveau seulement), erreurs `[Name: msg]`,
  `test.for/it.for/describe.for`. Test : `test/js/bun/test/bun_test.test.ts` (7 cas en fin de fichier). Serializer oklab de
  Tailwind chargé par preload (tailwindcss `f2760d63`). Reste : clé bunfig `snapshotSerializers`, types `bun-types`.
- ⏳ Première publication `4.3.3-aphrody.1` (workflow release), mesures avant/après (build CSS, démarrage à froid),
  suite d'intégration sous `bun test`, `bench` encore sur `vitest bench`, bascule de `@aphrody/bun-plugin-tailwind`.

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

### S. Framework full Bun — m3 App Router (🔄)

**État au 2026-10-09 (passage à agy)** : lot 1 (App Router, `42a83e3540`) et lot 3 partiel (`DataTable`/`VirtualList`
dans `@aphrody/m3-react/data`, `apps/example`, `b70bfdf444` ; `yolo.ts` vers `apps/example`, `2bfba1d057`) poussés,
non compilés ni testés. À reprendre :
- Lot 2, Bake `"use server"` dans le cœur : `src/js_parser/p.rs` ~8750 (`registerServerReference`, id stable au lieu
  du `todo_panic`), import dans `parse_entry.rs` ; proxy de références serveur client/SSR dans `bundle_v2.rs`
  (~4029, ~7839) et `ServerComponentParseTask.rs` ; POST d'action + `callServer` ; SSR dynamique dans
  `production.rs` ; React 19 stable au lieu de `react-server-dom-bun` ; tests `test/bake/dev/bundle.test.ts`.
- ✅ Lot 3 (F3, 2026-10-09) : `m3/apps/example` recréée (`b5d6c23d31`, test bout en bout build + prerender + serve,
  7 pass ; workspace racine `m3/apps/example`, `4e97e2deff`) ; template `spa` TanStack Router dans scaffold
  (`5168569653`, tsgo et `Bun.build` OK sur le projet généré avec `@tanstack/react-router` 1.170.41, scaffold 25 pass) ;
  `DataTable`/`VirtualList` : `m3-react` `test/data.test.tsx` 6 pass. Écart Bun relevé, non corrigé :
  `FormData.prototype.toJSON` (extension Bun) fait refuser un FormData à `encodeReply` de React (le test construit la
  réponse Flight à la main).
- ⏳ Lot 4 : `m3 compile` et `m3 docker` pour l'App Router (image Aphrody Alpine, chantier U) ; `scripts/yolo.ts compile`
  échoue explicitement tant que `apps/example` n'a pas de script `compile`.
- ⏳ Lot 5 : tranche Shenron, banc de perf contre Next.
- Passe finale : `cd C:\aphrody\m3\packages\m3 && APHRODY_FFI_DEV=1 bun test test/app`, `cd C:\aphrody\m3\apps\example
  && bun run test`, `cd C:\aphrody\m3\packages\scaffold && bun test`, `cd C:\aphrody\m3\packages\m3-react && bun test
  test/data.test.tsx`, `cd C:\aphrody\m3 && bun test ./scripts/yolo.test.ts`.

Le framework est **m3** (`C:\aphrody\m3`, `@aphrody/m3/app`). Périmètre S : m3, m3-bun, m3-config, m3-next,
m3-next-migrate, scaffold, templates, apps ; T possède le reste de m3, R possède m3-baseui.

- ✅ Décision moteur : **Bun.build + Bun.serve publics** avec `react-server-dom-parcel` 19.3 (catalog aphrody), trois
  couches `rsc` (`conditions: ["react-server"]`, `server.node` pour l'ALS), `ssr` (`client.edge`), `client`
  (`client.browser`), registre `parcelRequire` partagé sur `globalThis`, chargeurs paresseux. Bake n'est pas retenu
  pour l'instant (manques du cœur ci-dessous).
- ✅ Routage `app/` compatible Next : page, layout, template, loading, error, not-found, groupes, `[x]`/`[...x]`/`[[...x]]`,
  `route.ts` (HEAD, OPTIONS, 405), `proxy.ts`/`middleware.ts` (`matcher`, rewrite, redirect, en-têtes de requête),
  RSC, `"use client"`, Server Actions (fetch + `<form>` sans JS, `useActionState`), `redirect`/`notFound` avec statut
  HTTP correct avant le streaming, metadata/generateMetadata/viewport, robots/sitemap/manifest, `generateStaticParams` +
  SSG au build avec détection dynamique (`headers()`, `cookies()`, `searchParams`), alias `next/{link,navigation,headers,
  server,cache,image}`, SSR en streaming avec payload RSC inline, CSS des composants serveur, images importées.
- ✅ CLI : `m3 dev` (rebuild + rafraîchissement RSC par WebSocket `/_m3/hmr`), `m3 build [--no-prerender]`, `m3 start` ;
  `m3.config.ts` accepte `app`. `m3 create` passe par scaffold (inchangé).
- ✅ Tests `packages/m3/test/app/{scan,plugin,router}.test.ts` (fixture `packages/m3/test/fixtures/app-router`) : 40 pass
  le 2026-10-09 (F3). Commande : `cd C:\aphrody\m3\packages\m3 && APHRODY_FFI_DEV=1 bun test test/app`.
- ✅ Nettoyage : dossiers `m3/apps/m3-migrate-contract-*` laissés par des runs interrompus de m3-next-migrate supprimés
  (ils cassaient `bun install`) ; `apps/showcase` déjà supprimé, docs alignées (m3 PLAN.md, GOAL.md, FRAMEWORK.md).
- TanStack (règle de choix documentée dans `m3/docs/guides/FRAMEWORK.md`) : App Router m3 pour le web rendu serveur ;
  **TanStack Router** pour SPA/Tauri ; **Query** gardé ; Table/Virtual → M3 `DataTable`/`VirtualList` ; **Start** évalué,
  non retenu (build Vite obligatoire) ; m3-forms vs TanStack Form tranché par mesure.
- ⏳ Manques Bun à corriger dans le cœur (§2.11, aucun contournement dans m3) avant de passer le dev sur Bake :
  `"use server"` inline → `todo_panic` (`src/js_parser/p.rs` ~8753/8760, `src/bundler/bundle_v2.rs` ~4029/7839) ;
  production Bake = SSG uniquement (pas de SSR/actions en prod) ; `react-server-dom-bun` épinglé sur une React
  expérimentale de 2024.
- ⏳ Lots suivants : adaptateurs compile + Docker Alpine via m3-bun, tranche Shenron, comparaison perf avec
  `next build`/`next start`. `scripts/yolo.ts` pointe sur `apps/example` (`b5d6c23d31`).
- ✅ Cœur Bun (F3) : `Bun.Transpiler.scanImports` sautait mal un hashbang initial (`809b733f681`, test dans
  `test/bundler/transpiler/transpiler.test.js`, échoue avec le Bun système ; Rust non compilé : `bun bd test
  test/bundler/transpiler/transpiler.test.js -t "hashbang"`).
- ✅ WebOS `C:\aphrody\apps\web` (F3, `bc81496767`) : apps WASM (`WASM_APPS`) et pages outils (Bun APIs, benchmarks,
  FFI, templates, docs, bridge, composants M3) dans `AppId`/`DOCK_ITEMS`/`DesktopOS` ; `KernelMonitorApp`, `TopBar` et
  À propos sur `GET /api/webos/system` (node:os, process, /proc, /sys, liste `unavailable` explicite) ;
  `/api/ffi/sources` et `/api/ffi/abi` (appel réel de `yolo_abi_version` : 1.5 sur `target/runtime/aphrody_ffi.dll`) ;
  orphelins sans backend supprimés ; `bun test test` 24 pass, tsgo propre hors `server.ts`. ⏳ Montage dans
  `apps/web/server.ts` (modifié sans commit par codex) : lignes à ajouter en tête de
  `apps/web/src/os/server-extensions.ts` ; erreurs tsgo restantes de `server.ts` (données WebSocket non typées, l. 30,
  230, 236, 245) à corriger par codex.

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
  (`readFileSync`/`existsSync`). PNG de m3-os-themes : `Bun.deflateSync(raw, { windowBits: 15 })` (requiert le binaire du fork).
- ✅ Manques Bun corrigés dans le cœur (§2.11), non exécutés (passe finale) : `Bun.write`/`BunFile.write` option `mode`
  (tous les chemins, fichier créé ou écrasé) ; `Bun.Glob.scan`/`scanSync` sur un `cwd` absent rend une liste vide (comme
  `fs.globSync` et fast-glob ; un `cwd` fichier lève toujours ENOTDIR) ; `windowBits` de `Bun.deflateSync`/`gzipSync` était
  ignoré, il suit désormais zlib (15 → en-tête 78 9c, -15 → deflate brut par défaut, 31 → gzip). Tests :
  `bun bd test test/js/bun/io/bun-write.test.js -t "options.mode"`, `bun bd test test/js/bun/glob/scan.test.ts -t "missing cwd"`,
  `bun bd test test/js/bun/util/zstd.test.ts -t "windowBits"`.
- ✅ `packages/assets` : régénérés par agy (`840abc8881`) ; `bun run gen` relancé par F3, aucun écart.
- ✅ Locales m3 : « Zero-Overhead » / « à coût nul » retirés, `generate-i18n.ts --apply` relancé (`baa610959a`).
- ✅ `m3/apps/m3-migrate-contract-*` (runs interrompus de m3-next-migrate) : le workspace racine ne liste plus que
  `m3/apps/example` (`4e97e2deff`), ces restes ne cassent plus `bun install`.
