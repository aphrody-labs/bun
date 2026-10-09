---
name: bun-docs-test
description: "Cheat-sheet bun test (docs/test + docs/guides/test) - CLI flags/defauts, [test] bunfig, discovery, modifiers, hooks, mocks, timers, snapshots, DOM, reporters, coverage, parallel/shard, runtime"
metadata:
 type: reference
---

Source : `<bun>\docs\test\*.mdx`, `docs\snippets\cli\test.mdx`, `docs\guides\test\*.mdx`. Voir aussi `bun-docs-map`, `bun-docs-bunfig-env`, `bun-docs-pm`.
(Dans le repo Bun lui-même : toujours `bun bd test`, jamais `bun test` -- cf CLAUDE.md.)

## Découverte
- Récursif depuis cwd (ou `[test] root`). Motifs : `*.test.*`, `*_test.*`, `*.spec.*`, `*_spec.*` avec ext `js|jsx|ts|tsx|mjs|cjs|mts|cts`.
- Ignorés : `node_modules`, dossiers cachés (`.x`), fichiers sans extension JS-like (selon loaders).
- Positionnels `bun test foo bar` = filtres **sous-chaîne** sur le chemin (pas de glob). Fichier exact : préfixer `./` ou `/`.
- `-t/--test-name-pattern <regex>` : matché contre "Describe1 Describe2 nom du test" (labels parents joints par espace).
- Ordre : fichiers séquentiels (ou workers avec `--parallel`), tests dans un fichier séquentiels dans l'ordre de définition.
- Par défaut : UN process, preloads chargés puis tous les fichiers dans UN global partagé. Échec -> exit non nul.
- `pathIgnorePatterns` (bunfig) / `--path-ignore-patterns` (répétable) : globs exclus de la découverte, dossiers élagués sans traversée. Le CLI **remplace** le bunfig (pas de fusion).

## Flags CLI (défauts)
| Flag | Effet / défaut |
|---|---|
| `--timeout <ms>` | timeout par test, défaut **5000** |
| `--bail[=N]` | stop après N échecs; sans nombre = 1 |
| `--rerun-each N` | relance chaque fichier N fois (flaky) |
| `--retry N` | réessaie un test échoué jusqu'à N fois; `{retry:N}` par test prime |
| `--concurrent` | tous les tests = `test.concurrent` (sauf `test.serial`) |
| `--max-concurrency N` | défaut **20** |
| `--randomize` | ordre aléatoire; le seed s'affiche (`--seed=12345`) dans le résumé |
| `--seed N` | implique `--randomize`, ordre reproductible |
| `--only` | ne lance que `test.only`/`describe.only` |
| `--todo` | exécute les `test.todo` ; todo qui passe = échec ("marked as todo but passes"), todo qui échoue = OK (exit 0) |
| `-t, --test-name-pattern <re>` | filtre par nom |
| `-u, --update-snapshots` | réécrit les snapshots |
| `--reporter=junit\|dots` | junit exige `--reporter-outfile`; défaut console |
| `--reporter-outfile <path>` | sortie du reporter |
| `--dots` | = `--reporter=dots` |
| `--only-failures` | moins de sortie (cité guide migrate-from-jest) |
| `--coverage` | profil de couverture |
| `--coverage-reporter text\|lcov` | défaut `text`, répétable, implique `--coverage` |
| `--coverage-dir <dir>` | défaut `coverage` |
| `--check` | type-check tests + imports avant exécution; erreur -> exit 1, aucun test |
| `--preload <f>` | répétable; scripts avant les tests |
| `--watch` / `--hot` | watch redémarre le process (meilleure isolation); hot préserve l'état |
| `--parallel[=N]` | fichiers sur N workers (défaut nb cœurs); implique `--isolate` |
| `--no-isolate` | avec `--parallel` : un global par worker |
| `--isolate` | global neuf par fichier dans le même process |
| `--parallel-delay=<ms>` | défaut 5, spawn paresseux des workers |
| `--shard=i/n` | i-ème tranche déterministe |
| `--timings=<f.json>` / `--update-timings` | équilibrage par durée |
| `--smol` | mémoire réduite |
| Autres runtime | `--inspect`, `--inspect-brk`, `--define`, `--loader .svg:text`, `--tsconfig-override`, `--conditions`, `--env-file`, `--prefer-offline`, `--frozen-lockfile` |
CLI prime toujours sur bunfig.

## bunfig `[test]`
| Clé | Notes |
|---|---|
| `root` | string, un seul dossier (tableau non supporté) |
| `preload` | string ou tableau; aussi `test.preload = [...]` au top-level |
| `pathIgnorePatterns` | string ou tableau de globs (exclut de la découverte) |
| `smol` | = `--smol` |
| `concurrentTestGlob` | string ou tableau; fichiers matchés = `--concurrent`; `--concurrent` l'écrase |
| `randomize` / `seed` | seed requiert `randomize = true` |
| `retry` | défaut 0; `--retry` et `{retry}` priment |
| `rerunEach` | relance chaque fichier N fois |
| `coverage` | bool |
| `coverageReporter` | `"text"`/`"lcov"` ou tableau, défaut `["text"]` |
| `coverageDir` | défaut `"coverage"` |
| `coverageThreshold` | nombre ou `{ lines, functions, statements }` |
| `coverageSkipTestFiles` | défaut true |
| `coveragePathIgnorePatterns` | globs, n'affecte que la couverture |
| `coverageIgnoreSourcemaps` | défaut false |
`[test.reporter] junit = "path.xml"`. `bun test` hérite de `[install]` (registry, cafile, prefer, exact).
Jest -> bunfig : setupFiles(AfterEnv)->`preload`, testPathIgnorePatterns->`pathIgnorePatterns`, rootDir->`root`, coverageDirectory->`coverageDir`, coverageReporters->`coverageReporter`, coverageThreshold en fraction (0.9). bail/collectCoverage/testTimeout -> `--bail`/`--coverage`/`--timeout`. Pas de `__mocks__` ni auto-mock.

## Écrire des tests (`bun:test`)
- `test`/`it`, `describe`, `expect`, hooks, `jest`, `vi` dispo en globals sans import; `@jest/globals` réécrit vers `bun:test`. Types globals : `/// <reference types="@aphrody/bun-types/test-globals" />` dans un seul fichier (>= 1.2.19).
- Async ou callback `done` (si param `done`, il faut l'appeler sinon hang).
- Timeout par test : 3e arg nombre (`test(n, fn, 500)`); `0`/`Infinity` = pas de timeout; `jest.setTimeout`. Timeout = exception inattrapable + kill des sous-process (`Bun.spawn`, `spawnSync`, `node:child_process`) = zombie killer.
- Options objet : `{ retry: N }` ; `{ repeats: N }` = N+1 exécutions, échoue si une échoue. retry et repeats incompatibles sur un même test.
- Modifiers (chaînables, ex. `test.failing.each([...])`) :
 - `.skip` : non exécuté (`» nom`, compté `skip`).
 - `.todo` : body optionnel, non exécuté sauf `--todo`.
 - `.only` : avec `--only`, seuls `test.only`/`describe.only` tournent.
 - `.if(cond)` : exécuté si truthy; `.skipIf(cond)` : sauté si truthy.
 - `.todoIf(cond)` : todo si truthy (intention "prévu" vs skipIf "invalide pour cette cible").
 - `.failing` : inverse le résultat (échec attendu passe, succès échoue avec message).
 - `.each(table)` : paramétré.
 - `.concurrent` / `.serial` : forcer concurrent / séquentiel.
- `describe` : `.only`, `.skip`, `.if`, `.skipIf`, `.todoIf`, `.each`, `.concurrent`.
- `.each` : ligne tableau -> args étalés; objet -> 1 arg (titre `$a`). Formats : `%p` pretty, `%s`, `%d`, `%i`, `%f`, `%j`, `%o`, `%#` index, `%%`.
- `expect.hasAssertions`, `expect.assertions(n)`. `expectTypeOf` (compat Vitest) = no-op runtime, vérifié par `bun check`/`bun test --check`.
- Matchers : quasi tout Jest (toBe, toEqual, toStrictEqual, toThrow, resolves/rejects, toHaveBeenCalled*, toHaveReturned*, toMatchObject, toContainAllKeys/Values/AnyValues, closeTo, extend, any, anything...). Non implémenté : `addSnapshotSerializer`.

## Hooks & preload
- `beforeAll`, `beforeEach`, `afterEach`, `afterAll`, `onTestFinished` (après tous les afterEach; non supporté en test concurrent -> `test.serial`). Tous acceptent async.
- Portée = describe ou fichier; dans un preload = global sur tout le run (`--preload` ou `[test] preload`).
- Ordre imbriqué : File bA > Outer bA > Inner bA > Outer bE > Inner bE > test > Inner aE > Outer aE > Inner aA > Outer aA > File aA.
- `beforeAll` qui throw -> tous les tests de sa portée sont sautés.
- Avec `--parallel --no-isolate`, les beforeAll/afterAll du preload enveloppent chaque fichier.

## Mocks
- `mock(fn)` == `jest.fn(fn)` == `vi.fn`.
- État : `.mock.calls` (args), `.mock.results` (`{type:"return", value}`), `.mock.instances` (new), `.mock.contexts` (this), `.mock.lastCall`.
- Reset : `mockClear` (historique), `mockReset` (historique + impl), `mockRestore` (impl d'origine).
- Impl : `mockImplementation(Once)`, `mockReturnValue(Once)`, `mockReturnThis`, `mockResolvedValue(Once)`, `mockRejectedValue(Once)`, `withImplementation(fn, cb)` (temporaire).
- Nom : `mockName(n)`, `getMockName`.
- `spyOn(obj, "m")` : suit sans remplacer; chaînable `.mockResolvedValue(...)`.
- `mock.module(spec, factory)` : ESM + CJS, live bindings mis à jour même si déjà importé (mais effets de bord de l'original déjà exécutés -> utiliser `--preload` pour les éviter). Factory paresseuse (évaluée à l'import). Spécificateur résolu comme un import (relatif, absolu, package). Factory async en attente -> renvoie une promise (`await mock.module(...)`), sinon `undefined`; au top-level Bun attend avant de lancer les tests.
- `mock.clearAllMocks` (historiques, garde impl), `jest.resetAllMocks`/`vi.resetAllMocks` (mockReset partout, ne restaure pas les spies), `mock.restore` = `jest.restoreAllMocks` (restaure tout; **ne** défait **pas** `mock.module`).
- `vi` expose : fn, spyOn, mock, restoreAllMocks, resetAllMocks, clearAllMocks.

## Temps
- `setSystemTime(date)` affecte `Date.now`, `new Date`, `Intl.DateTimeFormat.format`; `setSystemTime` sans arg = reset.
- `jest.useFakeTimers`/`useRealTimers`/`jest.setSystemTime` supportés; contrairement à Jest, `Date` n'est pas remplacé (`Date === OriginalDate`). `jest.now` = horodatage mocké.
- TZ défaut `Etc/UTC`; `TZ=... bun test` ou `process.env.TZ = ...` à l'exécution, changeable plusieurs fois (diff Jest).

## Snapshots
- `toMatchSnapshot` -> `__snapshots__/<fichier>.test.ts.snap` à côté du test (en-tête `// Bun Snapshot v1`, `exports[\`nom 1\`]`), format Jest (virgules finales).
- `toMatchInlineSnapshot` : réécrit le fichier de test au 1er run. `toThrowErrorMatchingSnapshot`, `toThrowErrorMatchingInlineSnapshot`.
- Property matchers : `toMatchSnapshot({ id: expect.any(Number) })` -> `Any<Number>`.
- En CI, les nouveaux snapshots ne sont **pas** écrits sans `--update-snapshots`. Résumé : `snapshots: +1 added`.

## DOM
- `bun add -d @happy-dom/global-registrator`; `happydom.ts` : `GlobalRegistrator.register;`; `[test] preload = ["./happydom.ts"]`.
- Types : `/// <reference lib="dom" />` en tête du test.
- Testing Library : `@testing-library/react @testing-library/dom @testing-library/jest-dom`; preload `expect.extend(matchers)` + `afterEach(cleanup)`; types via `declare module "bun:test" { interface Matchers<T> extends TestingLibraryMatchers<...> }`. Si un seul preload : importer `@testing-library/*` via `await import` APRÈS `register` (sinon `screen` throw).
- Remplace `testEnvironment: "jsdom"`. Svelte : plugin `onLoad` .svelte en preload.

## Reporters
- Console par défaut; sans couleurs -> `(pass)` ASCII au lieu de `✓`. `» skip`, `✎ todo`.
- `--dots` : `.` par succès, détails des échecs.
- JUnit : sortie console inchangée, XML écrit en fin de run; `<properties>` : `ci` (GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY, CI_JOB_URL), `commit` (GITHUB_SHA, CI_COMMIT_SHA, GIT_SHA), `hostname`. Pas de stdout/stderr par test ni timestamps précis.
- GitHub Actions détecté automatiquement (`GITHUB_ACTIONS`) -> annotations, zéro config (`oven-sh/setup-bun@v2`).
- Custom : WebKit Inspector Protocol, domaines `TestReporter` (found/start/end) et `LifecycleReporter.error`, + `Console.messageAdded`.
- Sortie IA silencieuse (échecs + résumé seulement) si `CLAUDECODE=1`, `REPL_ID=1` ou `AGENT=1`.

## Couverture
- Colonnes `% Funcs`, `% Lines`, `Uncovered Line #s`. Seuls les fichiers chargés comptent.
- Défauts : exclut node_modules, fichiers non-JS/TS loaders, fichiers de test (`coverageSkipTestFiles=true`); sourcemaps utilisés.
- `lcov` -> `<coverageDir>/lcov.info`.
- `coverageThreshold = 0.9` ou `{lines, functions}` : vérifié **par fichier** (pas la moyenne All files) -> exit 1. Clé omise garde 0.9 (code-coverage.mdx). `statements` accepté mais non appliqué.
- Gotcha : hors `--parallel`, le seuil n'est vérifié que si le reporter `text` est actif; `--coverage-reporter=lcov` seul -> exit 0 malgré le seuil.
- `coverageIgnoreSourcemaps=true` : résultats confus, ajouter `// @bun` en tête du source.

## Parallel / isolate / shard
- `--parallel` : coordinateur + workers paresseux; fichiers triés par chemin, chunks contigus, vol de travail (moitié arrière du plus gros chunk). Sortie groupée par fichier, pas d'entrelacement.
- Env worker : `BUN_TEST_WORKER_ID` et `JEST_WORKER_ID` (index 1-based).
- Flags forwardés aux workers (timeout, preload, define, coverage, -u, -t, retry, rerun-each, concurrent, randomize/seed...). `--bail` géré par fichier (fichiers en cours finissent). Couverture, JUnit, snapshots fusionnés en un rapport.
- Worker crash (`process.exit`) -> fichier en échec, worker remplacé; signal fatal -> run entier avorté. `--parallel=1` ou 1 fichier -> exécution dans le process principal.
- `--isolate` : nouveau `globalThis`, registres ESM/CJS vidés, ferme serveurs/sockets/watchers/sous-process, annule timers, restaure fake timers, rejoue preloads. Transpilation/bytecode cachés au niveau process.
- `test.concurrent` = concurrence coopérative même thread/global (I/O), pas de CPU en plus.
- `--shard=i/n` sans timings : fichier i -> shard `(i mod n)+1`. Timings JSON `{version:1, files:{path: ms}}` (relatifs racine, plus lent d'abord); fichiers sans entrée = médiane. `--timings` répétable, `--update-timings` écrit dans le **premier**; avec `--shard` n'écrit que les fichiers du shard; sans shard fusionne.

## Runtime
- `NODE_ENV=test` sauf si déjà défini (env ou .env). `.env.test` chargé auto.
- Erreurs/rejets non gérés hors test -> "Unhandled error between tests", exit 1 même si tout passe (si au chargement du fichier, ses tests ne tournent pas).
- Exit : 0 = OK, 1 = échecs ou erreurs non gérées. SIGTERM = arrêt gracieux.
- `CI` détecté (comportements ajustés, ex snapshots).
- Gotchas : global partagé par défaut entre fichiers (nettoyer en afterEach ou `--isolate`); `mock.module` après import n'empêche pas les effets de bord; `onTestFinished` interdit en concurrent; filtres positionnels non glob; `root` n'accepte pas de tableau.
