# Plan — aphrody-labs/bun, noyau d'Aphrody

Plan commun à tous les agents qui travaillent sur ce fork (C:\bun), sur le monorepo Aphrody (C:\aphrody) et sur
Shenron (C:\shenron). Lis-le en entier avant de commencer, puis mets à jour ta section (statut, commits) à la fin de
chaque lot. Contexte permanent : [APHRODY.md](APHRODY.md) (ce que le fork fournit à Aphrody),
[CLAUDE.md](CLAUDE.md) (build et tests Bun), [packages/bun-next/docs/PLAN.md](packages/bun-next/docs/PLAN.md)
(plan détaillé Next sur Bun).

## 1. Cible

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
- ⏳ Patch compatible avec la **dernière** version de Next publiée (pas seulement 16.1.6).
- ⏳ Publication npm de `@aphrody/next-bun` ; Aphrody (m3-next, m3-next-migrate, web-test) passe de `file:` à
  la version npm.
- ⏳ Shim `node` du runner : vérifié sous Linux (Docker local) ; supprimé s'il ne sert nulle part.
- ⏳ Suite du plan détaillé (`packages/bun-next/docs/PLAN.md`) : App Router via Bun.build, dev/HMR.

### D. Plugin Tailwind CSS — `@aphrody/bun-plugin-tailwind` (🔄)

Fichiers : `packages/bun-plugin-tailwind/**`, `test/integration/bun-plugin-tailwind/`, entrée dans
`scripts/aphrody/publish-npm.ts`.

- ⏳ Tailwind v4 (`@tailwindcss/node` + oxide) sans Node : Bun.build, serveur HTML (`[serve.static] plugins`),
  HMR, minify, sourcemaps ; directives `@import`, `@source`, `@plugin`, `@config`, `@theme`, `@utility`,
  `@variant`, `@custom-variant`. Au moins la parité avec `bun-plugin-tailwind` d'oven-sh.
- ⏳ Export `/postcss` (même cœur) pour Turbopack ; intégration `withBun`.
- ⏳ Préréglage M3 (`/m3`) qui consomme `@aphrody/m3-tokens` ; centraliser ici toute intégration Tailwind
  générique dupliquée dans m3.
- ⏳ Tests, docs, publication npm.

### E. Bugs Bun sous Windows (🔄)

Fichiers : `src/**`, tests dans les fichiers existants.

- ⏳ Segfault du debug build sur `-e` et `test` : cause racine, correctif ; `bun bd test` utilisable.
- ⏳ `require()` d'un chemin absolu mêlant `\` et `/` → `__dirname` faux : correctif + test (échoue avec
  `USE_SYSTEM_BUN=1`, passe avec `bun bd test`).

### F. Fork = noyau d'Aphrody (🔄)

Côté Aphrody : `patches/bun`, `vendor.toml`/lock, `tools/config/vendor.json`, `packages/infra/update`,
`docs/operations/infra/update/BUN.md`, `crates/compat/bun-bridge`, `crates/compat/bun-docs`.

- ✅ `APHRODY.md` décrit ce que le fork fournit.
- ⏳ Patches `patches/bun/0001-0009` : déjà présents → supprimés ; sinon appliqués ici comme commits.
- ⏳ Pins et vendoring Bun d'Aphrody pointent sur ce fork et ses releases.

### G. Déduplication de la couche JS Bun d'Aphrody (🔄)

Côté Aphrody : `m3/packages/m3-bun`, `crates/ui/bun`, `crates/interop/ffi/bun`, `scripts/build/ui/packages/bun`,
paquets `packages/**` qui refont une API Bun (`http`, `fuzzy`, `sql`, `paths`…).

- ⏳ Pour chaque paquet : API Bun native, suppression, migration ici sous `@aphrody/…`, ou maintien justifié.

### H. Docs Bun d'Aphrody (✅)

- ✅ Purge des copies et plans Bun périmés ; une seule page canonique « Bun = notre fork »
  (`docs/reference/upstream-bun/APHRODY-FORK.md`) ; seule copie de la doc : `docs/reference/upstream-bun`
  (`bun run docs:bun:update|check`). `CLAUDE.md`, `AGENTS.md` à jour ; `TOOLS.md` est généré et ne contient rien de
  périmé. Aphrody `8c13ad714` (une partie des suppressions est partie dans `e3aa1d730` et `9394cb5e8`).
  `docs:check`, `docs:bun:check` verts ; `docs:check-links` : 0 lien cassé, 3 chemins morts dans des fichiers des
  chantiers F (`docs/operations/infra/update/BUN.md` → `patches/bun`) et C (`packages/bun-next/docs/PLAN.md` cité
  par next-fork/PLAN.md et NEXTJS_VERCEL_RUST_CRATES.md).

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

### K. CLI Aphrody (🔄)

Côté Aphrody : `crates/ai/code-graph`, remote-desktop, défauts graph/yolo/MCP ; réinstallation du binaire.

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
