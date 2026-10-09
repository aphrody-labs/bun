# M-bun — ce qui, dans aphrody, relève du fork Bun

Agent M-bun, 2026-10-09. Lecture seule. Périmètre : runtime, outillage JS/TS, FFI, wasm et build.

## États lus

| Dépôt | Commit | Note |
| --- | --- | --- |
| `C:\aphrody` | `27cfae4196` | `HEAD` est passé à `3981261053` pendant la rédaction. Le diff `27cfae4196..HEAD` sur tout le périmètre ne touche que `package.json` (+1 ligne : workspace m3). |
| `C:\bun` | `305283a8d45` → `827b18db324` | Les sections Y, X et L du plan sont lues dans `PLAN-ALPINE-BUN.md`. |

**Méthode**

- **LOC** : lignes des fichiers suivis par git (`git ls-files`, script `C:/tmp/M/metrics.ts`).
- **Dernier commit** : `git log -1 --format='%h %ad' --date=short -- <chemin>` (script `C:/tmp/M/last.ts`).
- **Consommateurs** : relevés de deux façons, puis recoupés.
  - Avec `rg`, script `C:/tmp/M/consumers.ts` :
    - crates : dépendances dans les `Cargo.toml` et occurrences de `crate::` ;
    - paquets : dépendances dans les `package.json` et imports dans les fichiers `*.ts`, `*.tsx`, `*.js`, `*.mjs`.
  - Avec `aphrody graph --source graph:aphrody query|explain|path` (graphe reconstruit à `27cfae4196` : Rust, TS, JS et MD, 81 889 nœuds).
- **Présence côté fork** : script `C:/tmp/M/bunside.ts`, avec `rg` sur `src/`, `packages/`, `scripts/aphrody/`, `bench/aphrody/`, `docs/` et `test/cli/`.
- **Réimplémentations d'API Bun** : script `C:/tmp/M/reimpl.ts`.

**Chantiers** (sections de `PLAN-ALPINE-BUN.md`)

- **Y** (l.676-723) :
  - `bun lint`, `bun fmt`, `bun n2b`, `bun migrate` et `bun wasm package|artifact` (commits `5d71825be6b`, `05258490fbe` et `90482ce997c`) ;
  - `bun create aphrody/<t>` (commits `4ba861b7c8b` et `44747607202`).
- **X** :
  - crate `bun_wasm` (`c4d7ca9c410`) ;
  - repli en Rust pur de mimalloc, simdutf et highway sur wasm32 (`f55ad2a4774`) ;
  - vérification sur la cible `wasm32-wasip1-threads` (`b71e31bf26a`) ;
  - exports C du runtime natif (`Bun__atexit`, `Bun__onExit`, `bun_is_exiting`, `Bun__userAgent`, `Bun__stringSyntheticAllocationLimit`, `bun_stdio_tty`) retirés du module wasm, natif inchangé (H4, `c20fff4602a`) : 16 → 10 exports, 277 400 → 276 433 octets, `wasm-tools validate` VALID, smoke `C:/tmp/main/wasm-smoke.ts` vert.
- **L** : `bun-n2b`, `bun-oxc` 0.3.0 et les plugins `@aphrody/bun-plugin-n2b` et `@aphrody/bun-plugin-oxc`.
- **I** : `Bun.Archive` avec zip, mode et mtime (`5ffed5d5e53`).
- **V** : `bun:ffi`.
- **B** : release du binaire, glibc 2.31 et musl.
- **Z1 n'a pas de section dans le plan.** Son périmètre se déduit de deux passages :
  - Z2, l.601 : « Z1 garde rename, parse, docs Bun, bench (et L/Y : lint, scan, verify, create) » ;
  - le titre de L, l.957 : « bun-oxc 0.3.0 en cours, Z1 ».

  Côté aphrody, `bin/aphrody.ts:15` confirme : `Z1_PENDING_COMMANDS = ["parse","bench","create","rename","verify"]`.
- **M-alpine** (`docs/aphrody/merge/M-alpine.md`) couvre déjà trois éléments : `patches/linux` (lot A1), `scripts/build/os` et l'image `tools/config/container/build/Dockerfile` (lot A8). Ici, ils sont seulement renvoyés à ces lots.

**Légende des cibles**

- **cœur** : `src/...` du fork.
- **pkg** : `packages/...` du fork.
- **reste** : reste dans aphrody.
- **suppr.** : à supprimer d'aphrody.
- **réduire** : reste dans aphrody, mais doit être aminci.

## 1. Crates moteur, interop et natifs

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/engine/yolo-core` (mapper/audit, detect, watch, polyglot, privilege, resources) | 2847 | e3aa1d7304 2026-10-08 | `yolo-runtime`, `yolo-pyo3`, `crates/infra/yolo`, `crates/ui/app/src/lib.rs`. Le graphe trouve `parse()` et `compute_benchmark` dans `polyglot.rs` et `lib.rs`. | Non : `rg '\byolo\b' C:\bun\src` ne trouve que des commentaires, aucun crate. | reste | — | aucun | Z2 (le scan Rust est retenu ; Y : « yolo scan non repris ⏸ ») |
| `crates/engine/yolo-runtime` (ABI C : process.supervise, http.probe, gpu, browser) | 3925 | be449b3975 2026-10-09 | `Cargo.toml` racine et `crates/interop/ffi`. Côté TS : 17 occurrences de `yolo_process_*` dans `packages/engine/runtime/src/index.ts`, plus `yolo/src/python.ts`, `runtime/src/desktop.ts` et `modules.ts`. Côté Python : `py/packages/aphrody/src/aphrody/yolo_runtime.py`. | En partie : `Bun.spawn({detached})` (`bun.d.ts:7678-7691`) et `src/spawn/process.rs:1609` `new_process_group` couvrent le groupe de processus. `rg 'yolo_runtime\|yolo_process_' C:\bun` → 0. | réduire (`process.rs` : 849 LOC, `47415b9844`) | dédup du superviseur côté TS | Python reste lié à l'ABI C. Gate : `cargo check -p yolo-runtime` et `bun test packages/engine/runtime`. | nouveau (aphrody) |
| `crates/engine/yolo-pyo3` | 22 | 5bde43dade 2026-10-05 | seul consommateur : le manifeste maturin `packages/engine/python/pyproject.toml` | Non : sans objet pour Bun. | reste | — | aucun | — |
| `crates/interop/ffi` (cdylib `aphrody_ffi`) | 9023 | 8925b0edaf 2026-10-09 | chargé par `dlopen` dans `packages/interop/native/src/library.ts`, `packages/engine/runtime/src/*.ts` et `packages/ai/rag-core/src/ffi.ts` | Non : `rg 'aphrody_ffi\|libaphrody' C:\bun\src` → 0. | reste | — | — | — |
| ↳ feature `tooling` : `tooling.rs` (22 LOC, `3bb98f70be`) et `n2b_native.rs` (328 LOC, `47415b9844`) | 350 | 47415b9844 2026-10-09 | `runtime/src/tooling.ts` (NativeTooling) ; le graphe ajoute `runtime-ffi.test`, `compiler-native.test`, `compiler-oxc.test` et `scripts/release/tooling-asset.ts`. | Oui : `packages/bun-n2b` et `packages/bun-oxc` existent dans le fork (L ✅). Aphrody ne les consomme pas encore : `rg bun-plugin-n2b -g package.json C:\aphrody` → 0. | suppr. | binaire FFI plus petit (oxc et n2b en double) ; une seule source oxc | Les tests du compilateur passent sur les plugins. Gate : `cargo check -p aphrody-ffi --no-default-features` et `bun test packages/engine/core packages/engine/runtime`. | L |
| ↳ `glibc_compat.rs` | 99 | 2d3f713f99 2026-10-09 | build ffi pour glibc ancienne | Le sysroot glibc 2.31 de B (`scripts/aphrody/build-host.ts`) vise le binaire bun, pas la cdylib d'aphrody. | reste | — | — | B |
| `crates/native/native` | 483 | 2b9c3d2e76 2026-10-01 | `aphrody-command` (`ai_cmd.rs`, `pillars_cmd.rs`) et `crates/ui/app` (`models.rs`) | Non. | reste | — | — | — |
| `crates/native/simdutf` (C++ vendoré, `[patch.crates-io]` pour rio-vt) | 81386 | df3ff0dd30 2026-10-05 | `terminal-core` (rio-vt) ; namespace privé « alongside V8 » ; SIMDUTF_VERSION 7.7.1 | Le fork n'a pas de crate : simdutf y vient de WebKit WTF (`src/simdutf_sys/bun-simdutf.cpp:1` `#include "wtf/SIMDUTF.h"`). `rg 'SIMDUTF_VERSION "' C:\bun\src` → 0. | reste | — | aucun (aucune ABI partagée) | — |
| `crates/native/gpu-backend` | 890 | 6b7947c7ed 2026-10-08 | `yolo-runtime/src/gpu.rs` | Non. | reste | — | — | — |
| `crates/ui/bun` (`aphrody-bun`) | 6820 | c3dd3d3fd6 2026-10-09 | `aphrody-ffi` | G ✅ « maintenu » ; la dédup est déjà faite (mémoire `aphrody-bun-dedup`). | reste | — | — | G |
| `crates/compat/bun-docs` | 949 | 1aa7eaedbc 2026-10-09 | `kernel/core/src/cli.rs` | F/H ✅ : docs Bun lues depuis le fork. | reste | — | — | F/H |
| `crates/compat/toolchains` | 766 | 2b9c3d2e76 2026-10-01 | `kernel/core` (`runtimes.rs`, `lib.rs`) et `ai/train/runner.rs` | Non : la découverte de uv et nu sort du périmètre de Bun. | reste | — | — | — |
| `crates/compat/serde-saphyr` (+ `patches/serde-saphyr-0.0.16-regex.patch`) | 37078 | 613deb4c75 2026-10-05 | patch crates-io pour mistral.rs (`engine-mistralrs`) | Non : `rg saphyr C:\bun\src` → 0 ; le fork a son propre YAML (`Bun.YAML`). | reste | — | — | — |
| `crates/infra/aphrody-command-wasm` | 138 | f7d623e826 2026-10-08 | membre du workspace ; construit par `cli-wasm` `build:wasm` | Le fork fournit `bun:wasm` package/artifact (Y, `90482ce997c`) et `bun_wasm` (X). Le crate lui-même est propre à aphrody. | reste | — | — | X/Y |
| `crates/infra/aphrody-command-pure` | 586 | c008d77682 2026-10-07 | `aphrody-command-wasm/src/lib.rs` et `aphrody-command/src/lib.rs` | Non. | reste | — | — | — |

## 2. Paquets engine et interop

Imports comptés dans les fichiers `ts`, `tsx`, `js` et `mjs` : `@aphrody/yolo-core` 21, `@aphrody/plugins` 0, `@aphrody/runtime-sdk` 38, `@aphrody/yolo-cli` 4, `@aphrody/bun` 38.

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `packages/engine/core/src/curation/rename.ts` | 483 | 8172f535ce 2026-10-05 | `yolo/src/rename.ts` ; commande `rename` (`yolo/src/index.ts:522`) | Non : `rg 'bun rename\|case "rename"' C:\bun\src C:\bun\packages` → 0. | cœur : script embarqué `src/js/eval/` et routage dans `src/runtime/cli/` | une CLI de moins dans aphrody | Renommage AST faux. Gate : `bun bd test test/cli/lint/toolchain.test.ts` (cas rename à ajouter). | Z1 |
| `packages/engine/core/src/vfs/parse.ts` | 67 | 255189af13 2026-10-05 | commande `parse` (`index.ts:262`) via NativeTooling (aphrody-ffi) | Oui : `Bun.Transpiler.scan()` renvoie `{exports, imports}` (`bun.d.ts:3142`) ; le hashbang est corrigé en `809b733f681`. | suppr. (passe à `Bun.Transpiler.scan`) | plus d'aller-retour FFI | sortie JSON différente. Gate : `bun test packages/engine/core` | Z1 |
| `packages/engine/core/src/sys/benchmark.ts` (wyhash, crc32, stringWidth, stripANSI) | 86 | 255189af13 2026-10-05 | commande `bench` (`index.ts:296`) | Non : absent de `bench/aphrody/micro` (`rg 'stringWidth\|stripANSI' C:\bun\bench\aphrody` → 0). | cœur (bench) : `bench/aphrody/micro/` | une mesure unique, côté fork | aucun (bench). Gate : `bun bd bench/aphrody/micro/<f>.ts` | Z1 |
| `packages/engine/core/src/sys/supervisor-benchmark.ts` | 267 | 1a8883eb72 2026-10-07 | `bench` (superviseur yolo-runtime) | Non. | reste | — | — | — |
| `packages/engine/core/src/sys/hash.ts` (façade sur `Bun.hash` et `CryptoHasher`) | 27 | c3dd3d3fd6 2026-10-09 | `core/src/ledger/index.ts` et `core/src/sys/index.ts` | Oui : `Bun.hash` et `Bun.CryptoHasher` sont natifs. | suppr. (appels directs) | dédup | Gate : `bun test packages/engine/core` | nouveau (aphrody) |
| `packages/engine/core/src/verify/engine.ts` | 633 | 19823fc04e 2026-10-09 | commande `verify` (`index.ts:588`) | Non : `rg 'bun verify' C:\bun\src` → 0 ; marqué « Z1 pending ». | reste en attendant Z1 | — | — | Z1 |
| `packages/engine/core/src/scaffold/create.ts` | 156 | 4ff21550d7 2026-10-09 | commande `create` (`index.ts:504`) | Oui : `bun create aphrody/<t>` (Y ✅, `4ba861b7c8b` et `44747607202`). | réduire (passe la main à `bun create`) | dédup des gabarits | Gate : `bun bd test test/cli/install/bun-create.test.ts` et `bun test packages/engine/core` | Y |
| `packages/engine/core/src/compiler/oxc.ts` et `native.ts` | 27 | 255189af13 2026-10-05 | `compiler-oxc.test` et `compiler-native.test` (graphe) | Oui : `packages/bun-oxc` 0.3.0 (L, `6922c5edba7`). | suppr. | dédup | Gate : `bun test packages/engine/core` | L |
| `packages/engine/core/src/compiler/flags.ts` (`--bytecode` en CJS, sans TLA) | 15 | 1a8883eb72 2026-10-07 | `scripts/release/compile-flags.ts` (réexport) | Le fork accepte `--format=esm` avec `--compile --bytecode` (`Arguments.rs:2653-2661`, `docs/bundler/executables.mdx:303`). | réduire (le commentaire CJS est obsolète ; ajouter `--format=esm`) | TLA permis dans les binaires | démarrage du bytecode ESM non mesuré. Gate : `bun test packages/engine/core` puis release smoke | B |
| `packages/engine/core/src/vfs/scan.ts` et `yolo/src/scan.ts` | 253 + 138 | 8172f535ce / 3311e4dcee 2026-10-07 | commande `scan` (`index.ts:434`) | Non côté fork : c'est `aphrody scan`, en Rust, qui l'emporte. | suppr. (yolo scan) | dédup avec le Rust | Gate : `bun test packages/engine/yolo` | Z2 |
| `packages/engine/core/src/vendor/import.ts` (`yolo import`, vendoring tauri) | 902 | f7d623e826 2026-10-08 | `vendor.toml` | Non. | reste | — | — | — |
| autres modules de `core` (gemma4, redis, fleet, host, ledger, server, coord) | ≈17 000 | 4ff21550d7 2026-10-09 | yolo-cli, apps | Non : produit aphrody. | reste | — | — | — |
| `packages/engine/yolo/src/cli/forge/*` (main 86, run 707, plan 549, glibc 212) | 1554 | 2d3f713f99 2026-10-09 | `yolo forge` ; `lowerGlibcCeiling` est appelé par `buildRevision` (`run.ts:543`) | Oui : `scripts/aphrody/build-host.ts` (sysroot glibc 2.31, `fd278401fca`) et `scripts/build/binary-expectations.ts` dans le fork. `rg lowerGlibcCeiling C:\bun` → 0, ce que le sysroot rend inutile. | suppr. après B | plus de réécriture de `.gnu.version_r` | binaire Linux sur une glibc ancienne. Gate : `bun scripts/build/binary-expectations.ts` (B) | B |
| `packages/engine/yolo/src/n2b.ts` | 129 | 3311e4dcee 2026-10-07 | commande `n2b` | Oui : `bun n2b` (Y, `5d71825be6b`) et `packages/bun-n2b` (L). | suppr. | dédup | Gate : `bun bd test test/cli/lint/toolchain.test.ts` | L/Y |
| `bin/aphrody.ts` (lanceur, `RELAY_COMMANDS`) | — | — | `yolo/test/aphrody-launcher.test.ts` | — | ✅ `7ec5501079` : `RELAY_COMMANDS = [bench, rename, verify]` (H1) | — | Gate : `bun test packages/engine/yolo/test/aphrody-launcher.test.ts` | Z1/Y |
| `packages/engine/runtime/src/tooling.ts` (NativeTooling) | 350 | 46e436e96e 2026-10-07 | parse, n2b et oxc ; `scripts/release/tooling-asset.ts` (graphe) | Oui : les plugins L (`packages/bun-n2b`, `packages/bun-oxc`). | suppr. | dédup et FFI plus petite | Gate : `bun test packages/engine/runtime` | L |
| `packages/engine/runtime/src/tooling-schema.ts` | 176 | 0b74677d8d 2026-10-05 | `tooling.ts` ; générée par `scripts/tools/compat/scripts/n2b/generate-schema-types.ts` | Oui : `packages/bun-n2b/scripts/generate-schema-types.ts` dans le fork. | suppr. | une seule source de schéma | Gate : `bun test packages/engine/runtime` | L |
| `packages/engine/runtime/src/ffi.ts` (`toCString`, `readOwnedBytes`, `nativeLibrary`) | 216 | 46e436e96e 2026-10-07 | runtime-sdk, rag-core | Le finaliseur existait déjà (`toArrayBuffer(ptr, off, len, ctx?, deallocator)`, `FFIObject.rs:603`) ; seuls les types manquaient (H4, `04ef0f8260f`). Le `free(data, len, cap)` d'`OWNED_SLOT` n'a pas la signature `(bytes, ctx)` d'un deallocator JSC. | reste ; `readOwnedString` décode la vue empruntée sans copie (aphrody `0296ad4c9c`) | moins de copies | Gate : `bun bd test test/js/bun/ffi/ffi.test.ts` | V (optionnel) |
| `packages/engine/runtime` (reste : `index.ts`, desktop, modules) | ≈3500 | be449b3975 2026-10-09 | 38 importeurs | Non. | reste | — | — | — |
| `packages/interop/native` (`@aphrody/bun`) | 5850 | be449b3975 2026-10-09 | 38 importeurs | G ✅ : la dédup est déjà faite. | reste | — | — | G |
| ↳ `src/http.ts` | 81 | a43286b85f 2026-10-07 | aucun importeur (graphe : `requestJson`, 2 nœuds) | Identique, octet pour octet, à `infra/workspace/src/http.ts` et à `@aphrody/web/http`. | suppr. | dédup ×3 | Gate : `bun test packages/interop/native` | nouveau (aphrody) |
| ↳ `src/n2b.ts` et `src/oxc.ts` (réexports) | 14 | be49d7459f 2026-10-05 | réexports de `tooling.ts` | Oui : L. | suppr. | dédup | Gate : `bun test packages/interop/native` | L |
| `packages/engine/plugins` (`@aphrody/plugins`, façade de compatibilité) | — | 7b4d5f0cda 2026-10-07 | 0 importeur dans le code | — | suppr. | moins de surface | Gate : `bun install --frozen-lockfile` et `bun test` | nouveau (aphrody) |
| `packages/engine/python` | — | c3dd3d3fd6 2026-10-09 | `py/` (maturin) | Non. | reste | — | — | — |

## 3. Paquets infra et web

Importeurs : `cli-wasm` 2, `paths` 16, `workspace` 6, `update` 18, `http` 0, `fuzzy` 2, `qr` 1 (`m3/packages/app-ui/src/components/modals/PairingModal.tsx`).

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `packages/infra/cli-wasm` | — | f7d623e826 2026-10-08 | `stage-cli-wasm.ts` et 2 importeurs | Le fork fournit `bun:wasm` (Y) ; ce paquet reste celui d'aphrody. | reste | — | — | X/Y |
| `packages/infra/paths` (réexporte `workspace/src/paths.ts`) | — | 7b4d5f0cda 2026-10-07 | 16 importeurs | Non. | reste | — | — | — |
| `packages/infra/workspace/src/http.ts` | 81 | a43286b85f 2026-10-07 | aucun importeur (copie morte) | Identique à `@aphrody/bun` http et à `@aphrody/web/http`. | suppr. | dédup | Gate : `bun test packages/infra/workspace` | nouveau (aphrody) |
| `packages/infra/workspace/src/canonical-tar.ts` (tar PAX façon CPython, zlib par `dlopen`) | 256 | 9ad1869260 2026-10-08 | `aphrody-packages.ts` et tests | En partie : `Bun.Archive` gère zip, mode et mtime (I, `5ffed5d5e53`). Octets identiques au tar PAX de CPython : non vérifié. | réduire (passe à `Bun.Archive` après la release qui contient `5ffed5d5e53`) | plus de zlib par `dlopen` | reproductibilité des sha d'archive. Gate : `bun test packages/infra/workspace` (sha figés) et `bun bd test test/js/bun/archive` | I |
| `packages/infra/workspace/src/docs-consolidation.ts:1657` `globToRegExp` | 2084 (fichier) | fcde83042e 2026-10-05 | interne | Oui : `Bun.Glob#match`. | réduire | dédup | sémantique de `**`. Gate : `bun test packages/infra/workspace` | nouveau (aphrody) |
| `build-factory.ts:35` et `scripts/build/rust/vps-cargo.ts:89` `shellQuote` | 833 / 908 | e78cf94fd7 / f77c549be2 2026-10-08 | appels ssh distants | `$.escape` existe (`shell.d.ts:44`). Compatibilité avec un `sh` distant : non vérifiée. | réduire (si l'équivalence est prouvée) | dédup | quoting ssh. Gate : `bun test packages/infra/workspace` | nouveau (aphrody) |
| `packages/infra/workspace` (reste : `bun-upstream-docs.ts`, `bun-reference.ts`, `bun-workspace.ts`, `bun-native.ts`…) | ≈40 000 | 5cebb70f3b 2026-10-09 | 6 importeurs | `bun-upstream-docs` et `bun-reference` relèvent de H ✅. | reste | — | — | H |
| `packages/infra/update/src/ecosystems/bun.ts` | 1012 | 99eda6f674 2026-10-08 | `update` | Utilise déjà `Bun.TOML` et `Bun.semver` (`distribution.ts:276`). | reste | — | — | — |
| `packages/infra/update/src/process.ts` (adapte `Bun.spawnSync` à la forme `child_process`) | 82 | aa49800407 2026-10-08 | `update` | Oui : `Bun.spawnSync` est natif. | réduire | dédup | Gate : `bun test packages/infra/update` | nouveau (aphrody) |
| `packages/web/http` (`@aphrody/web/http`) | — | f7d623e826 2026-10-08 | 0 importeur ; seulement `tools/config/pipeline.json` et `npm-packages.json` | Le même code existe en trois copies. | reste (copie canonique ; retirer les deux autres) | — | Gate : `bun test packages/web/http` | nouveau (aphrody) |
| `packages/web/fuzzy` (port de fuse.js) | — | 1a8883eb72 2026-10-07 | 2 importeurs | Non : `rg 'bitap\|fuse\.js' C:\bun\src` → 0. | reste | — | — | — |
| `packages/web/qr` | — | 1a8883eb72 2026-10-07 | 1 importeur (m3 PairingModal) | Non : `rg 'qrcode\|ISO/IEC 18004' C:\bun\src` → 0. | reste | — | — | — |

## 4. Scripts de build et de release

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/build/rust/wasm-package.ts` | 184 | 31b72597e9 2026-10-09 | `build-wasm.sh` et `stage-cli-wasm.ts` | Presque : il importe déjà `bun:wasm`. `maxBytes` (`src/js/bun/wasm.ts:376`) et le remplacement atomique (`wasm.ts:399-407`) existent. Manque une surcharge de cargo : `cargo` est codé en dur à `wasm.ts:307` ; seuls `BUN_WASM_BINDGEN`, `BUN_WASM_OPT`, `BUN_JCO` et `BUN_WASM_TOOLS_DIR` sont surchargeables. | cœur : option `cargo` et variable `BUN_WASM_CARGO` dans `src/js/bun/wasm.ts`, puis réduire le script (le routage par `cargo-serial.sh` ou `vps-cargo.ts` passe en option) | un seul empaqueteur wasm | Gate : `bun bd test test/cli/lint/toolchain.test.ts` et `bun run build:wasm` (cli-wasm) | Y (suite) |
| `scripts/build/shell/build-wasm.sh` | 8 | 02b68eea88 2026-10-06 | `package.json` de `cli-wasm` | Appelle `wasm-package.ts`. | suppr. après le lot 1 (devient `bun wasm package`) | — | même gate | Y |
| `scripts/build/rust/cargo-serial.sh`, `vps-cargo.ts`, `channel-cargo.sh` | 122 + 908 + — | 9b40294ed7 / f77c549be2 2026-10-09 | règle globale et build distant | Non : orchestration propre à aphrody. | reste | — | — | — |
| `scripts/build/container` | 593 | 406c798f52 2026-10-08 | image de build | M-alpine, lot A8 (double image contre `scripts/aphrody/linux.Dockerfile`). | image (voir M-alpine A8) | — | voir M-alpine | C2 |
| `scripts/build/os` | 483 | d8965bd942 2026-10-07 | WSL | M-alpine, section 2. | voir M-alpine | — | — | M-alpine |
| `scripts/build/ui`, `desktop`, `build-aphrody-*-release.sh` | 381 + 67 + — | 766186e779 2026-10-09 | apps | Non. | reste | — | — | C1 |
| `scripts/release/windows-exe.ts` (rcedit sous Wine) | 76 | aba87e2a3d 2026-10-06 | `publish-creator.ts:32` et `stage-setup.ts:21` (graphe ; `rg` confirme) | Non : le fork refuse `--windows-icon`, `--windows-title` et `--windows-publisher` hors de Windows (`Arguments.rs:2479-2486`, `if !cfg!(windows)`). L'écriture des ressources passe par Win32 (`src/jsc/bindings/windows/rescle.cpp`, 830 LOC, `df49a6e1cf4`) ; `src/exe_format/pe.rs` (643 LOC, `595f97b949c`) existe déjà. | cœur : écriture portable des ressources PE dans `src/exe_format/pe.rs` et levée de la garde dans `Arguments.rs` | supprime la dépendance Wine et rcedit | métadonnées PE corrompues. Gate : `bun bd test test/bundler/compile-windows-metadata.test.ts` (cas `--target=bun-windows-x64` depuis Linux) | nouveau |
| `scripts/release/tooling-asset.ts` | 32 | b080042a2d 2026-10-05 | release de la cdylib tooling | Oui : les paquets L sont publiés depuis le fork. | suppr. | — | Gate : `bun test scripts/release` | L |
| `scripts/release/compile-flags.ts` | 4 | 1a8883eb72 2026-10-07 | release | Réexporte `core/compiler/flags.ts`. | réduire avec `flags.ts` | — | — | B |
| `scripts/release/stage-cli-wasm.ts` | 331 | 2072d221e3 2026-10-07 | release wasm | Utilise `wasm-package.ts`. | reste (appellera `bun wasm package`) | — | Gate : `bun test scripts/release` | Y |
| `scripts/release` (reste : `release.ts`, `runtime_*`, `bun-packages`, `crates-io-prepare`, `cdn-optimize`) | ≈9400 | be449b3975 2026-10-09 | CI release | Non. | reste | — | — | — |
| `scripts/tools/compat/scripts/n2b` et `scripts/audit/compat` | 296 + 311 | 2db2b5a973 2026-10-09 | génération du schéma n2b et audit de compatibilité | Oui : `packages/bun-n2b/scripts/` (L). | suppr. (passe au fork) | une seule source | Gate : `bun test packages/bun-n2b` (fork) | L |
| `scripts/audit/workspace/bun-absorb.ts` (cliquet des paquets absorbés par Bun) | 227 | c4461a2f7d 2026-10-08 | audit du workspace | En partie : le registre n2b du fork (L) liste les équivalents. | reste (lire le registre de `bun-n2b`) | — | — | L |

## 5. Patches, vendor et configs

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `patches/` : aucun patch ne vise bun | — | 30796120bc 2026-10-09 | — | `patches/bun` a été supprimé (F ✅). | — | — | — | F |
| `patches/linux/0001-…aphrody_runtime…` | — | — | `vm/rootfs/sbin/init.ts` | M-alpine, lot A1. | suppr. (M-alpine A1) | — | — | M-alpine |
| `patches/simdutf-rio-0.7.0.patch` et `serde-saphyr-0.0.16-regex.patch` | — | — | crates de la section 1 | Non concernés par Bun. | reste | — | — | — |
| `vendor.toml` et `vendor.lock` (tauri, `yolo import`) | 1323 + 253 | db0382d6f6 / 30796120bc 2026-10-09 | `core/src/vendor/import.ts` | Aucun vendoring de bun (`rg bun vendor.toml` : seulement des commentaires). | reste | — | — | — |
| `.oxlintrc.json` | 120 | df3ff0dd30 2026-10-05 | `bun lint` (`toolchain.ts:185,424`) | Oui : lu par `bun lint` (Y). | reste | — | — | Y |
| `.oxfmtrc.json` | 20 | a4f58b4a08 2026-10-05 | `bun fmt` (`toolchain.ts:195,431`) | Oui : lu par `bun fmt` (Y). | reste | — | — | Y |
| scripts `oxlint` et `oxfmt` globaux (`packages/infra/workspace/package.json:79-81` ; `package.json:169-170` `ai:lint`, `ai:fmt`) | — | — | CI et développeurs | `bun lint` et `bun fmt` embarquent OXLINT 1.87.0 et OXFMT 0.72.0. oxlint et oxfmt sont absents de `node_modules` d'aphrody. | réduire (passer à `bun lint` et `bun fmt`) | plus d'outil global | diff de format si les versions diffèrent. Gate : `bun fmt --check` et `bun lint` sur aphrody | Y |
| `tsconfig.base.json` | 18 | d406f11b34 2026-09-29 | tous les paquets | Non. | reste | — | — | — |
| `bunfig.toml` | 48 | 30796120bc 2026-10-09 | runtime et tests | Les sections `[lint]` et `[fmt]` du fork existent (Y). | reste (ajouter `[lint]` et `[fmt]`) | — | Gate : `bun lint` | Y |
| `turbo.json` (+ `turbo ^2.11.5`) | 40 | 33a4b79a3f 2026-10-08 | seulement les scripts `ai:*` (`package.json:165-168`) | `bun run --filter` couvre l'orchestration du workspace ; n2b possède un scanner `turbo_json` (L). | suppr. | une dépendance de moins | ordre des tâches. Gate : `bun run --filter '*' typecheck` | L/Y |

## 6. Code TS qui réimplémente une API Bun (`C:/tmp/M/reimpl.ts`)

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paquets npm `semver`, glob (`fast-glob`, `minimatch`…), `toml`, `yaml`, `dotenv`, `execa` et `better-sqlite3` | 0 | — | — | 0 fichier trouvé ; `Bun.semver` est déjà utilisé (`distribution.ts:276`) et `bun:sqlite` apparaît dans 14 fichiers. | — | — | — | — |
| `createHash` (`node:crypto`, 41 fichiers) et `child_process` (14 fichiers) | — | — | — | Natifs dans Bun : rien à migrer. | reste | — | — | — |
| `sys/hash.ts`, `globToRegExp`, `shellQuote` ×2, `update/process.ts`, http ×3, `parse.ts` | voir les tables 2 et 3 | — | — | — | suppr. ou réduire | — | — | — |

## Écarts du cœur Bun mis en évidence

1. **`bun:wasm` ne permet pas de surcharger cargo** (`src/js/bun/wasm.ts:307`) : lot 1.
2. **`--windows-icon`, `--windows-title` et `--windows-publisher` sont refusés hors de Windows** (`Arguments.rs:2479-2486`) : lot 3.
3. **Aucune commande `rename` ni bench micro des primitives** côté fork : lot 2 (Z1).
4. ~~**`toArrayBuffer` n'a pas de finaliseur ou deallocator**~~ : faux, le natif l'acceptait déjà ; seuls les types et un test manquaient (lot 4, ✅ `04ef0f8260f`).

## Lots de migration (ordonnés, disjoints en fichiers)

1. **Y-suite : surcharge de cargo dans `bun:wasm`**
   - Fork : `src/js/bun/wasm.ts`, `packages/bun-types/wasm-build.d.ts` (déclare `bun:wasm`) et `test/cli/lint/toolchain.test.ts`.
   - Gates : `bun bd test test/cli/lint/toolchain.test.ts` et `bun test test/integration/bun-types/bun-types.test.ts`.
   - Puis, dans aphrody : réduire `scripts/build/rust/wasm-package.ts` à un appel `bun wasm package --cargo=<cargo-serial.sh>` ; supprimer `scripts/build/shell/build-wasm.sh`. Gate : `bun run build:wasm` dans `packages/infra/cli-wasm`.
   - Statut : fork ✅ `fa46590790f` (G3) : `cargo?: boolean | string | string[]` remplace cargo pour `cargo metadata` et `cargo build` (plugin compris), `rustup target add` sauté pour un cargo personnalisé ; CLI `--cargo=<cmd>` (mots entre guillemets) ; `docs/bundler/wasm.mdx` ; test `bun:wasm > bun wasm build --cargo and the cargo option replace cargo` (faux cargo, sans rustc). `bun test test/integration/bun-types/bun-types.test.ts` : 22 pass. `bun bd test test/cli/lint/toolchain.test.ts` : passe finale.
   - Aphrody ⏳ après release du fork : le Bun système (`1.4.3-aphrody.2`) n'a pas `bun wasm` (« Script not found "wasm" »). La sous-commande s'appelle `bun wasm build` (pas `package`). À faire alors : dans `wasm-package.ts`, les branches cloud (`cargo-serial.sh`) et win32 (`cargo`) deviennent `build({ cargo: … })` sans `artifact` ; la branche VPS (`vps-cargo.ts run` puis `fetch` de l'artefact) n'est pas un remplaçant de cargo et garde `artifact`. `build-wasm.sh` a 3 consommateurs à réécrire dans le même commit : `scripts/build/shell/check-all.sh:6`, `scripts/build/desktop/e2e.ts:22`, `packages/shell/web/package.json:26` (`build:wasm`), plus `docs/plans/shell/wasm-stack-definitive.md:85,211,247` et `docs/plans/ai/shenron-targets.md:67`.
2. **Z1 : rename, bench et parse**
   - Fork : nouveau script embarqué `src/js/eval/` pour `rename`, routage dans `src/runtime/cli/`, `bench/aphrody/micro/primitives.ts` (wyhash, crc32, stringWidth, stripANSI) et un test dans `test/cli/`.
   - Gates : `bun bd test test/cli/<rename>.test.ts` et `bun bd bench/aphrody/micro/primitives.ts`.
   - Dans aphrody :
     - supprimer `core/src/curation/rename.ts`, `core/src/sys/benchmark.ts` et `yolo/src/rename.ts` ;
     - faire passer `core/src/vfs/parse.ts` par `Bun.Transpiler.scan` ;
     - retirer `parse`, `bench`, `rename` et `create` de `Z1_PENDING_COMMANDS` (`bin/aphrody.ts`).
   - Gate : `bun test packages/engine/core packages/engine/yolo`.
   - Statut aphrody (H1, 2026-10-09) : ✅ `7ec5501079`. `Z1_PENDING_COMMANDS` devient `RELAY_COMMANDS = [bench, rename, verify]` : `parse` et `create` sortent (`bun parse`, `bun create aphrody/<t>`) ; restent relayés `rename` (preset Aphrody), `bench --supervisor` et `verify` (graphe de gates), pour les binaires natifs construits avant que `bun_bridge.rs` ROUTES les liste (ajout en cours côté codex, non commité). Sans binaire natif, le lanceur retombe sur le dispatcher. `bin/yolo` et `bin/yolo.cmd` deviennent l'alias déprécié de `bin/aphrody.ts`. `yolo train` et `yolo mcp` supprimés (0 consommateur). `aphrody ai doc-ai` câblé par codex (`1f286cd651`). Aide resynchronisée (`docs/cli/HELP.md`, 20 commandes). Gardés, consommateurs trouvés : `core/src/sys/benchmark.ts` (`/api/bench`), `core/src/vfs/parse.ts` (`Bun.Transpiler.scan` perd les exports de type), `yolo/src/rename.ts` (preset), `n2b`, `version|doctor|upgrade|uninstall` (distribution compilée). Gate : tests touchés 38 pass ; `bun test packages/engine/yolo packages/engine/core` reste rouge sous Windows pour des causes extérieures (faux `sh`, miroir docs H3, forge, install.ps1) ; `cli_app.test.ts` « --json and --md » attend `bun parse` (Bun du fork), fichier tenu par H3. Passe finale avec le Bun du fork sur PATH.
3. **Nouveau : ressources PE portables dans le cœur**
   - Fork : `src/exe_format/pe.rs` (écriture de RT_GROUP_ICON, RT_ICON et VS_VERSIONINFO), `src/runtime/cli/Arguments.rs` (levée de la garde `cfg!(windows)`), `src/standalone_graph/StandaloneModuleGraph.rs` (chemin d'appel) et `test/bundler/compile-windows-metadata.test.ts`.
   - Gates : `bun bd test test/bundler/compile-windows-metadata.test.ts` et `bun run rust:check-all`.
   - Dans aphrody : supprimer `scripts/release/windows-exe.ts`, ainsi que rcedit et Wine des étapes `publish-creator.ts` et `stage-setup.ts`.
   - Statut : fork ✅ `fc2255e1b2f` (G3) : `src/exe_format/pe_resources.rs` (arbre de ressources lu, modifié puis réécrit en Rust pur : RT_GROUP_ICON/RT_ICON depuis le `.ico`, VS_VERSIONINFO, `OriginalFilename` vidé) ; `PEFile::set_windows_metadata` écrit l'arbre dans une nouvelle section `.rsrc` (l'ancienne devient `.rsrc_0`, répertoire de données 2 et somme de contrôle à jour) ; appel dans `inject()` avant `add_bun_section`, pour tout hôte ; les six gardes `cfg!(windows)` d'`Arguments.rs` levées (contrôles « cible Windows » et `--compile` gardés) ; rescle (C++/ATL, 3 fichiers), son module `bun_sys::windows::rescle` et son câblage `scripts/build/{bun,flags}.ts` supprimés ; `docs/bundler/executables.mdx`. Tests : `Windows resources from any host` (gabarit PE minimal avec `.rsrc` existant, `--target=bun-windows-x64` : sections, icône, groupe, chaînes, versions fixes, somme de contrôle ; versions invalides et icône invalide sur tout hôte). `cargo check -p bun_exe_format --tests` vert ; `bun bd test test/bundler/compile-windows-metadata.test.ts` et `bun run rust:check-all` : passe finale. ATL retiré du sysroot Windows (G3, commit suivant) : `--include-atl` ôté de `winsysroot.ts`, `config.ts`, `ci-images/spec.ts` et `docs/project/building-windows.mdx` ; le contrôle de complétude du splat vérifie `vcruntime.h` au lieu d'`atlstr.h` ; `bun test test/internal/source-lints/ci-images.test.ts` : 7 pass. Le changement de `spec.ts` change le nom de l'image de build Linux (nouvelle cuisson à la prochaine CI).
   - Aphrody ⏳ après release du fork : supprimer `scripts/release/windows-exe.ts` (75 LOC, `RCEDIT`, `brandExe`) ; ses 2 consommateurs passent aux options `windows` de `Bun.build` (ou `--windows-*`) : `scripts/release/publish-creator.ts:32,162-176` (`brand()`) et `scripts/release/stage-setup.ts:21,84` ; dans `stage-setup.ts:98-100`, le `--smoke` lance encore l'exe sous `wine` hors Windows (exécution, pas marquage : à garder ou à retirer à part). Écart : `publish-creator.ts` pose `OriginalFilename` et `InternalName`, que les options `windows` ne savent pas écrire (`OriginalFilename` est vidé). Docs à reprendre : `docs/operations/infra/CREATOR.md:29`, `docs/operations/infra/DOWNLOADS.md:53,70`, `tools/config/downloads.json:142`, `packages/infra/product/resources/setup/README.md:38`, `packages/infra/product/resources/admin/README.md:28`.
4. **V, optionnel : finaliseur de `toArrayBuffer`**
   - Fork : `src/runtime/ffi/` et `packages/bun-types/ffi.d.ts`.
   - Gate : `bun bd test test/js/bun/ffi/ffi.test.ts`.
   - Dans aphrody : réduire `runtime/src/ffi.ts` `readOwnedBytes`.
   - Statut : fork ✅ `04ef0f8260f` (H4). Le natif (`FFIObject.rs:603-657`, 5 arguments : ptr, byteOffset, byteLength, contexte ou deallocator, deallocator) et `docs/runtime/ffi.mdx:494` existaient déjà, et le Bun système `1.4.3-aphrody.2` les a. Ajouts : surcharges `toArrayBuffer`/`toBuffer` avec deallocator et contexte dans `ffi.d.ts`, fixture de types `test/integration/bun-types/fixture/ffi.ts`, fixture C qui enregistre bytes et contexte, et test `toArrayBuffer with a finalizer and context…` dans `test/js/bun/ffi/ffi.test.js`. Le test passe aussi avec le Bun système, puisqu'il couvre un comportement existant. `bun test test/js/bun/ffi/ffi.test.js -t finalizer` : 2 pass ; `bun test test/integration/bun-types/bun-types.test.ts` : 22 pass. `bun bd test test/js/bun/ffi/ffi.test.js` : passe finale.
   - Aphrody ✅ `0296ad4c9c` : `readOwnedBytes` et `readOwnedString` partagent `withOwnedView`, et `readOwnedString` décode la vue empruntée (une copie de moins). Pas de copie zéro par finaliseur : le `free(data, len, cap)` des consommateurs (dont iecode `nie.ts:444`) n'a pas la signature `(bytes, ctx)`. Il faudrait un symbole natif dédié dans chaque bibliothèque, ce qui n'est pas fait. `bun test packages/engine/runtime/test/runtime-ffi.test.ts` : 11 pass.
5. **B : retrait de forge**
   - Dans aphrody : supprimer `packages/engine/yolo/src/cli/forge/*` (1554 LOC), une fois la release B publiée.
   - Gate fork : `bun scripts/build/binary-expectations.ts` sur l'artefact Linux. Gate aphrody : `bun test packages/engine/yolo`.
6. **L : aphrody adopte `@aphrody/bun-plugin-n2b` et `@aphrody/bun-plugin-oxc`**
   - Dans aphrody : supprimer
     - `crates/interop/ffi/src/tooling.rs` et `n2b_native.rs` (feature `tooling`) ;
     - `packages/engine/runtime/src/tooling.ts` et `tooling-schema.ts` ;
     - `core/src/compiler/oxc.ts` et `native.ts` ;
     - `interop/native/src/n2b.ts` et `oxc.ts` ;
     - `yolo/src/n2b.ts` ;
     - `scripts/release/tooling-asset.ts` ;
     - `scripts/tools/compat/scripts/n2b` et `scripts/audit/compat`.
   - Gates : `cargo check -p aphrody-ffi`, `bun test packages/engine packages/interop/native` et `bun install --frozen-lockfile`.
7. **Dédup interne à aphrody, sans changement côté fork**
   - Supprimer :
     - `interop/native/src/http.ts` et `infra/workspace/src/http.ts` (`@aphrody/web/http` reste la copie canonique) ;
     - `core/src/sys/hash.ts` ;
     - `packages/engine/plugins`.
   - Remplacer `globToRegExp` par `Bun.Glob` et réduire `update/src/process.ts`.
   - Dans `core/src/compiler/flags.ts`, ajouter `--format=esm` et corriger le commentaire sur CJS et TLA.
   - Remplacer `shellQuote` par `$.escape`, seulement après avoir prouvé l'équivalence avec `sh`.
   - Gates : `bun test packages/engine/core packages/interop/native packages/infra/workspace packages/infra/update` et `bun install --frozen-lockfile`.
   - Statut (G2, 2026-10-09) : ✅ aphrody `d0272b9582` (+ reformatage oxfmt `fefc5307e0`), 31 fichiers, +270/−708. Contradiction tranchée par `rg` : `@aphrody/web/http` n'existe pas ; `packages/web/http` (`@aphrody/http`) n'était qu'une façade `export *` de `packages/interop/native/src/http.ts`, sans importeur. La copie canonique est donc `interop/native/src/http.ts` (`@aphrody/bun`, exportée par `src/index.ts`) : elle est gardée, `infra/workspace/src/http.ts` (copie identique sans importeur) supprimée, la façade retirée au lot 8 de M-produit. `core/src/sys/hash.ts` supprimé (`Bun.hash.wyhash`, `Bun.CryptoHasher`) ; `packages/engine/plugins` supprimé (pipeline, npm-packages `blocked`, docs) ; `globToRegExp` → `Bun.Glob` ; `update/src/process.ts` réduit, API gardée (une vingtaine d'importeurs utilisent `encoding`, `stdio` en tuple, `execFileSync`) ; `--format=esm` dans `COMPILE_FLAGS` (preuve : `bun build --compile --bytecode --format=esm` de yolo, puis `yolo version`). `shellQuote` → `$.escape` dans `crawl-index.ts` et `build-factory.ts` (garde NUL conservée) : équivalence prouvée sur 41 cas (espaces, quotes, `$`, backtick, ``, saut de ligne, vide, unicode) contre `docker run --rm -i alpine:3.24 sh -s` (41/41 pour les deux) ; test `crawl-index.test.ts` contre le `sh` de l'hôte. Reste : `scripts/build/rust/vps-cargo.ts` garde son `shellQuote` (fichier claimé par codex-windows-context). Gates : `bun test` des 4 paquets (266 pass), `tsgo` core/update/workspace/scripts à 0 erreur.
8. **I : tar canonique**
   - Après une release du fork contenant `5ffed5d5e53` : faire passer `infra/workspace/src/canonical-tar.ts` (et le `package.ts` de m3-bun) à `Bun.Archive`.
   - Gate : `bun test packages/infra/workspace` ; les sha d'archive figés doivent rester identiques, sinon on garde le tar actuel.
9. **Y : configs**
   - Scripts : `oxlint`/`oxfmt` → `bun lint`/`bun fmt` (`package.json:169-170`, `packages/infra/workspace/package.json:79-81`).
   - `bunfig.toml` : ajouter `[lint]` et `[fmt]`.
   - Supprimer `turbo.json` et la dépendance `turbo` ; les scripts `ai:*` passent à `bun run --filter`.
   - Gates : `bun lint`, `bun fmt --check` et `bun run --filter '*' typecheck`.
   - Statut (G2, 2026-10-09) : ✅ turbo, aphrody `a7569eb6d5` : `turbo.json` et `packages/interop/native/turbo.json` supprimés, `turbo` retiré du catalogue et des devDependencies (−1 paquet du lock), `ai:build|typecheck|test` → `bun run --filter '@aphrody/*' <script>`, `ai:dev` → `bun run --filter '*' dev` ; `bun run ai:typecheck` vert. ⏳ `bun lint`/`bun fmt` et `[lint]`/`[fmt]` de `bunfig.toml` : après release du fork. Les commandes sont dans le fork poussé (`5d71825be6b`, sur origin/main), mais le Bun installé (1.4.3-aphrody.2, `f7a7086b6`) ne les a pas : `bun lint --help` hors projet répond « Script not found "lint" ». Les scripts restent sur oxlint/oxfmt.
10. **Image** : voir M-alpine A8 (`scripts/build/container`) et A1 (`patches/linux`). Aucun fichier dans ce lot.

## Décompte par cible (71 lignes, comptées par `C:/tmp/M/count.ts` sur la colonne « cible proposée »)

| cible | items |
| --- | --- |
| bun cœur (`src/...`, `bench/aphrody`) | 4 (rename, bench micro, cargo pour `bun:wasm`, ressources PE). En plus, `toArrayBuffer` (V) est optionnel et compté dans « reste ». |
| bun package (`packages/...`) | 0 nouveau : bun-n2b et bun-oxc sont déjà dans le fork (L) |
| aports / image | 1 (`scripts/build/container`, voir M-alpine A8) |
| supprimer (aphrody) | 16, dont `patches/linux` (M-alpine A1) |
| réduire (aphrody) | 10 |
| reste aphrody | 39 |
| renvoi M-alpine (`scripts/build/os`) | 1 |
