# M-produit — alléger le produit Aphrody sans régression

Agent M-produit, 2026-10-09. Lecture seule sur le code ; seul ce fichier est écrit.

| Dépôt | Commit lu | Note |
| --- | --- | --- |
| `C:\aphrody` | `27cfae4196`, recontrôlé à `3981261053` | les 4 commits intermédiaires (`baa610959a`, `4d343ff71e`, `b5d6c23d31`, `3981261053`) ne touchent aucune ligne des tables ci-dessous (`git diff --stat 27cfae4196..HEAD`) ; `b5d6c23d31` ajoute `m3/apps/example` sans retirer le showcase |
| `C:\bun` | `827b18db324` | fork : `@aphrody/next-bun`, `@aphrody/bun-plugin-tailwind`, `@aphrody/bun-webview-page`, `bun-plugin-oxc` (`packages/*/package.json:2`) |
| `C:\aports` | overlay `aphrody/` | `aphrody/aphrody/APKBUILD` : `cargo build --frozen --release -p aphrody --bin aphrody` (aucune option de feature) ; l'arbre aports amont n'est pas présent localement |

## Méthode

- **Inventaire.** Scripts `C:/tmp/M/*.ts` :
  - `inv.ts` : 218 `Cargo.toml` et leurs consommateurs (`[dependencies]` et références textuelles) ;
  - `lockgraph.ts` : exclusivité dans `Cargo.lock`, c'est-à-dire le nombre de paquets qui sortent du lock si l'on retire la crate (toutes features, toutes cibles) ;
  - `cmdweight.ts` : poids de chaque dépendance directe d'`aphrody-command` dans la fermeture du binaire `aphrody` ;
  - `dead.ts` : fermeture transitive du code mort ;
  - `imports.ts` : importeurs TS réels (`from|import(|require(` hors du dossier du paquet).
- **Colonne « LOC ».** Lignes des fichiers suivis.
- **Colonne « dernier commit ».** `git log -1 --format='%h %ad' --date=short -- <chemin>`.
- **Colonne « consommateurs ».** `rg` sur tout le monorepo, y compris les `members` du workspace Cargo, les workspaces `package.json`, les scripts, la CI et les docs.
- **Graphe `graph:aphrody`.**
  - `explain crates_ai_router_src_lib_router` : 8 arêtes, la seule entrante est `contains` depuis son propre fichier.
  - `explain FsIndex` : deux nœuds homonymes de 9 arêtes chacun, `crates/infra/yolo/src/cli.rs:L42` et `crates/os/kernel/libs/fsindex/src/lib.rs:L73`.
  - `explain HnswIndex` et `explain TorchTensor` : aucun nœud.
- **« non vérifié ».** Mention explicite partout où la preuve manque.

## Poids réel mesuré

| Mesure | Valeur |
| --- | --- |
| Fichiers suivis `C:\aphrody` | 11 918 |
| LOC dépôt (Rust / TS-TSX / Python) | 1 142 869 / 401 624 / 63 062 |
| `Cargo.lock` | 2 555 paquets (721 201 o) : 191 locaux, 2 364 externes ; 278 noms en plusieurs versions, soit 381 entrées en trop (`phf` ×6, `windows-sys` ×6, `html5ever` ×5) |
| Résolution features par défaut (`cargo metadata`) | 2 148 paquets ; 407 entrées du lock viennent de features optionnelles (datafusion 30, lance 17, arrow 14, cranelift 13, mistralrs 12, wasmtime 11, candle 7…) |
| Workspace Cargo | 191 membres (218 `Cargo.toml` avec `comps/drive` exclu et les fixtures) |
| Périmètre M-produit, Rust | 142 crates, 786 407 LOC : ai 50 / 166 016 · contracts 3 / 6 553 · google 6 / 13 888 · infra 8 / 46 864 · ml 9 / 96 527 · tauri 31 / 156 195 · ui 14 / 74 979 · web 21 / 225 385 |
| Périmètre M-produit, TS | 46 paquets, 194 648 LOC : apps/web 9 541 · m3 32 / 151 899 · packages/ai 4 / 4 791 · discord 5 754 · google 3 422 · packages/web 7 / 19 241 |
| Périmètre M-produit, py | aphrody 35 584 · aphrody-train 4 814 · cli 4 232 · embedding-fixtures 368 · model-tools 218 · apps/meetings 301 · tools 4 749 |
| `target/` (`dust`, en arrière-plan) | 77 Gio : debug 48, release 16, runtime 7,5, lib 5,8 |
| Binaire `target/release/aphrody.exe` | 269 728 256 o (multicall en hardlinks) ; `gn_out/obj/rusty_v8.lib` 222 067 788 o (part de V8 dans le binaire final : non vérifiée) |
| Fermeture du binaire `aphrody` (lock) | 2 070 paquets |
| `node_modules` racine | 1,3 Go (store isolé `.bun`, 888 entrées) : googleapis@182 214 Mo · next@16.3.8 202 Mo · @napi-rs/canvas win32 37 Mo · three 22 Mo · maplibre-gl 22 Mo · happy-dom 15,8 Mo · @babel/* ≈10 Mo · discord.js 2,9 Mo |

Poids, dans la fermeture du binaire `aphrody`, de chaque dépendance directe d'`aphrody-command` (toutes non optionnelles ; `cmdweight.ts`) :

| Dépendance | Paquets exclusifs | Part |
| --- | --- | --- |
| aphrody-tauri-cli | 345 | 17 % |
| aphrody-render | 34 | |
| aphrody-oxc-bridge | 13 | recouvre Z1 |
| aphrody-identity | 10 | |
| aphrody-infra | 8 | |
| aphrody-terminal-backend | 8 | |
| aphrody-mcp | 7 | |
| aphrody-create-tauri-app | 4 | |
| aphrody-web-engine | 3 | tire obscura-js, donc deno_core et V8 |

## Fichiers non commités d'agy (notés, aucune proposition)

`git status` dans `C:\aphrody` :

- **Racine.** `AGENTS.md`, `CLAUDE.md`, `GOAL.md`, `MEMORY.md`, `PLAN.md`, `README.md`, `START-HERE.md`, `TODO.md`, `agy.md`.
- **Code.**
  - `apps/web/src/os/os-router.ts` ;
  - `crates/infra/aphrody-command/src/{auto_command,codex_cmd,gateway_cmd,lib,pillars_cmd}.rs` ;
  - `packages/infra/workspace/src/docs-gen.ts` ;
  - `scripts/build/rust/vps-cargo*.ts` et `scripts/tools/*`.
- **Docs.** De nombreux `docs/**`, dont `docs/plans/vu/INVENTORY-py-vs-aphrody.md`, `docs/ecosystem/*` et `docs/reference/workspace/*`.
- **Configuration.** `tools/config/docs/root.json`, `tools/config/host/*.json`, `tools/config/production-topology.json`.
- **Non suivis.** `docs/operations/workspace/{agy-audit-2026-10-09,team-and-hosts,windows-native}.md`.

`crates/interop/ffi` n'apparaît pas dans le `git status`. Les lots ci-dessous qui touchent `aphrody-command` (lots 6 et 7) ne modifient que `Cargo.toml` ; ils attendent quand même qu'agy ait commité `lib.rs`.

## 1. `crates/ai`

Preuve commune aux 12 premières lignes :

- `rg 'aphrody_(router|llm_infra|context|prompts|mcp_oauth|skills_forge|supervisor|providers|engine_mistralrs|sdk|skills|tools)::'` hors des dossiers de ces crates : 0 résultat.
- `lockgraph.ts` : aucun dépendant hors de ce groupe.
- Fermeture calculée par `dead.ts`.

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain (perf, taille, dédup) | risque de régression + gate qui le prouve | chantier propriétaire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/ai/router` | 1 949 | `5bde43dade` 2026-10-05 | 0 crate ; graphe : seule arête entrante `contains`. **Gate déjà cassée** : `packages/infra/workspace/src/ai-release-gate.ts:44-56` lance `cargo-serial.sh test -p aphrody-summary -p aphrody-router …`, or `aphrody-summary` n'existe plus (0 occurrence dans `Cargo.lock`) | sans objet (code mort) | supprimer | −1 crate ; `model-antigravity` perd un dépendant | à corriger : `ai-release-gate.ts` (retirer `-p aphrody-summary -p aphrody-router`). Gate : `scripts/build/rust/cargo-serial.sh check --workspace --all-targets --locked --offline` + `bun test packages/infra/workspace` | nouveau (lot 1) |
| `crates/ai/llm-infra` | 2 585 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/providers` | 295 | `c3dd3d3fd6` 2026-10-09 | rdeps : `llm-infra`, `router` seulement | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/context` | 1 224 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/prompts` | 693 | `a6a4043443` 2026-10-07 | 0 ; seul un commentaire périmé (`crates/infra/aphrody-command/Cargo.toml:233`) | sans objet | supprimer (et le commentaire) | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/mcp-oauth` | 1 441 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate | même gate + `cargo-serial.sh test -p aphrody-mcp` (l'OAuth MCP actif vit dans `mcp-client`) | nouveau (lot 1) |
| `crates/ai/sdk` | 2 154 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate ; `memory`, `session`, `skills`, `tools` et `gemini-runtime` perdent un dépendant | même gate | nouveau (lot 1) |
| `crates/ai/skills` | 4 544 | `b50c62d3e5` 2026-10-05 | rdep : `sdk` seulement. `packages/infra/workspace/src/agent-plugin-providers.ts:277-292` appelle `Bun.which("aphrody-skills")`, binaire inexistant (la crate n'a pas de `[[bin]]`) : branche morte | sans objet | supprimer, avec la branche morte du `.ts` | −1 crate | même gate + `bun test packages/infra/workspace` | nouveau (lot 1) |
| `crates/ai/tools` | 3 961 | `e092963830` 2026-10-06 | rdep : `sdk` seulement. L'id `aphrody-tools` dans `apps/web/src/os/wasm/apps.ts` désigne une app wasm, pas cette crate | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/skills-forge` | 1 039 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/supervisor` | 759 | `5bde43dade` 2026-10-05 | 0 | sans objet | supprimer | −1 crate | même gate | nouveau (lot 1) |
| `crates/ai/engine-mistralrs` | 4 268 | `fcde83042e` 2026-10-05 | 0 crate ; seulement `tools/config/update/rust-doctor.json` et `packages/infra/update/test/rust-doctor.test.ts` | sans objet ; inférence locale déjà assurée par `crates/ai/llama-server` et `ml/llama` | supprimer + entrées de `rust-doctor` | **118 paquets exclusifs** (4,6 % du lock), dont mistralrs et candle ; rend inutiles `serde-saphyr` (seul dépendant : `mistralrs-core`) et le patch `crates/compat/serde-saphyr` (36 961 LOC, hors périmètre, à signaler à M-compat) | `bun test packages/infra/update/test/rust-doctor.test.ts` + gate du lot 1 + `cargo tree -i serde-saphyr` vide | nouveau (lot 2) |
| `crates/ai/memory` feature `memory-lancedb` (`src/lancedb.rs`) | 659 | `df8bc7604c` 2026-10-02 | feature déclarée dans `crates/infra/aphrody-command/Cargo.toml:22` ; activée par aucun script, aucune CI ni par le binaire `aphrody` (`rg 'memory-lancedb'` : seulement les `Cargo.toml`) | sans objet | supprimer la feature et le fichier | **126 paquets exclusifs** (lancedb, lance, datafusion, arrow) | `cargo-serial.sh test -p aphrody-memory` + gate du lot 1 | nouveau (lot 3) |
| `crates/ai/memory/src/hnsw.rs` | 418 | `0f684cfa72` 2026-10-02 | interne à `memory` ; le code se décrit lui-même comme une recherche exacte en force brute « en attendant instant-distance » | **doublon** : `crates/web/web-index` (4 250 LOC, vrai HNSW int8 mmap, seul consommateur `crates/interop/ffi/src/web/index.rs`) | reste aphrody : `memory` consomme `web-index` | dédup −418 LOC ; requêtes sous-linéaires | rappel ou précision différents de la force brute. Gate : `cargo-serial.sh test -p aphrody-memory -p aphrody-web-index` + un test qui compare top-k exact et HNSW sur un jeu fixe | nouveau (lot 3) |
| Noyaux vectoriels `dot`, `cosine`, `l2`, `dot_i8` : `web-index/src/kernels.rs` (`2b9c3d2e76`), `rag-core/src/fusion.rs:201-286` (`9c7889fff5`), `embed/src/native/{embedder.rs:313-321, quantize.rs:24}` (`df3ff0dd30`) | ≈250 | 2026-10-01 / 2026-10-05 | chacun interne à sa crate | **doublon ×3** ; Bun ne fournit rien d'équivalent (sans objet) | reste aphrody : regrouper dans `rag-core` (déjà compatible wasm) | dédup ; un seul chemin SIMD | divergence numérique. Gate : `cargo-serial.sh test -p aphrody-rag-core -p aphrody-embed -p aphrody-web-index` + `cargo check -p aphrody-rag-core --target wasm32-unknown-unknown` | nouveau (lot 3) |
| `crates/ai/session` (format JSONL) et `crates/ai/rollout` | 4 349 + 848 | `5bde43dade` 2026-10-05 | `session` : `mcp` (et `sdk`, mort) ; `rollout` : `agent-runtime`, `app-server`, `engine`, `rolloutd` | **doublon partiel** du format de session JSONL (non vérifié ligne à ligne) | reste aphrody : fusion à étudier | dédup estimée < 1k LOC | non vérifié. Gate : `cargo-serial.sh test -p aphrody-session -p aphrody-rollout -p aphrody-mcp` | nouveau (hors lots) |
| Micro-crates `http-error` (82), `ocr` (48) | 130 | `5bde43dade` 2026-10-05 | `http-error` : `embed`, `mcp` ; `ocr` : `command`, `mcp` | sans objet | reste aphrody : fusion (`http-error` dans `config`, `ocr` dans `ocr-core`) | −2 crates, compilation un peu plus rapide | faible. Gate du lot 1 | nouveau (hors lots) |
| `crates/ai/rag-python` (`aphrody-rust`, PyO3) | 319 | `ca0f470844` 2026-10-06 | **pas mort** : construite par `py/packages/aphrody` (maturin) | sans objet | reste aphrody | — | — | — |
| `crates/ai/{agent-*, app-server, config, models, model-client, mcp, mcp-client, llama-server, rag*, store, code-graph, toolcall*, translate*, vision, voice, train, infer, jev, firefly, gateway, patch, engine, ocr-*}` | ≈135k | 2026-10-05..09 | consommés par `aphrody-command`, `mcp` et `app` (rdeps 1 à 20, `show.ts crates/ai`) | sans objet | reste aphrody | — | — | — |

## 2. `crates/ml`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/ml/torch` (`publish = true`) | 70 060 | `fcde83042e` 2026-10-05 | rdeps 0 ; `ml-runtime` ne cite que des noms de DLL ; graphe : aucun nœud `TorchTensor` | sans objet | supprimer | −70k LOC, −1 crate publiée | crate publiée : vérifier qu'aucun dépôt externe ne la consomme (`aphrody git search 'aphrody-torch'`, non vérifié). Gate : `cargo-serial.sh check --workspace --all-targets --locked --offline` | nouveau (lot 4) |
| `crates/ml/torch-sys` | 3 346 | `fcde83042e` | rdep : `torch` seulement | sans objet | supprimer | −1 crate | même gate | nouveau (lot 4) |
| `crates/ml/diffusion` | 3 228 | `fcde83042e` | rdeps 0 | sans objet | supprimer | −1 crate | même gate | nouveau (lot 4) |
| `crates/ml/diffusion-sys` | 670 | `fcde83042e` | rdep : `diffusion` seulement | sans objet | supprimer | −1 crate ; `ml/bindgen` perd 2 dépendants | même gate | nouveau (lot 4) |
| `crates/ml/ml-runtime/src/runtime/packages/{torch,diffusion}.rs` | 344 | `fcde83042e` | seul usage réel : `Runtime::discover([Feature::Llama])` dans `crates/ai/llama-server/src/in_process/mod.rs:119` | sans objet | supprimer (réduire `ml-runtime`) | −344 LOC | `cargo-serial.sh test -p aphrody-ml-runtime -p aphrody-llama-server` | nouveau (lot 4) |
| `crates/ml/ml-runtime` : téléchargement des runtimes llama.cpp et ONNX dans `~/.aphrody/runtimes` | 3 183 | `fcde83042e` | `llama-server` | **oui sur Alpine edge** : `llama.cpp` et `llama.cpp-libs` 0.6.0-r0, `onnxruntime` 1.30.0-r0 dans community (pkgs.alpinelinux.org) ; présence en 3.24 non vérifiée ; absents de `C:\aports\aphrody\aphrody\APKBUILD` (`rg 'llama\|onnxruntime'` : 0) | aports `aphrody/aphrody` : `depends="llama.cpp-libs onnxruntime"` et `ml-runtime` qui découvre d'abord `/usr/lib` | pas de téléchargement au premier lancement ; mises à jour par apk | ABI de llama.cpp entre la version apk et `ml/llama-sys`. Gate : `abuild -r` dans `aphrody/aphrody` puis `aphrody model …` en conteneur Alpine | **C2** (signalé) |
| `crates/ml/{llama, llama-sys, bindgen, ml-config}` | 16 040 | `fcde83042e` | `llama-server` | sans objet | reste aphrody | — | — | — |

## 3. `crates/web`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/web/dragon-pixel-{core, server, wasm}` (bevy) | 1 128 | `b172737dab` 2026-10-07 | seul consommateur : `examples/crystal-universe` (`serve.js`, `README.md:45`) ; `dragon-pixel-server` est un binaire sans consommateur ; `core` → `aphrody-web-game-server` | sans objet | supprimer du workspace : `exclude` avec son propre `Cargo.lock`, comme `examples/runtime-rust-extension` | **164 paquets exclusifs** (6,4 % du lock, dont 141 bevy) | `examples/crystal-universe` cesse d'être compilé par la gate workspace. Gate : `cargo check --manifest-path crates/web/dragon-pixel-wasm/Cargo.toml --target wasm32-unknown-unknown` + gate workspace | nouveau (lot 5) |
| `crates/web/obscura-js` (deno_core 0.412, V8 150) | 54 793 | `ce81d28298` 2026-10-07 | `web-engine`, `obscura-browser`, `obscura-cdp` | moteur JS côté Bun : JSC (`C:\bun\vendor\WebKit`) ; aucune API d'embarquement JSC pour Rust tiers (`rg 'deno_core' C:\bun\src` : 0) | nouveau : JSC via le fork Bun à la place de V8 ; risque élevé, à évaluer seulement | 36 paquets exclusifs ; `rusty_v8.lib` 222 Mo ; patch `simdutf` (sert aussi `rio-vt`) | très élevé (rendu DOM d'Obscura). Gate : `cargo-serial.sh test -p obscura-js -p obscura-browser -p obscura-cdp` | nouveau (hors lots) |
| `crates/web/{obscura (2 261), web-engine (2 440), web-service (1 465), obscura-mcp (2 728)}` | 8 894 | `d21e0f54a0` / `6567868770` 2026-10-05..09 | quatre façades au-dessus d'`obscura-browser` ; consommateurs : `command`, `google`, `mcp`, `agent-tools` | doublon de couches (non vérifié en détail) | reste aphrody : fusion en une façade | dédup estimée 2-4k LOC (non vérifié) | `cargo-serial.sh test -p aphrody-web-engine -p aphrody-web-service -p aphrody-obscura -p aphrody-mcp` | nouveau (hors lots) |
| `crates/web/obscura-ssrf` | 126 | `d21e0f54a0` | `obscura-net`, `obscura-render` | sans objet | reste aphrody : fusion dans `obscura-net` | −1 crate | gate workspace | nouveau (hors lots) |
| `crates/web/web-index` | 4 250 | `5bde43dade` | `crates/interop/ffi` | sans objet | reste aphrody ; devient la recherche vectorielle de `memory` (lot 3) | dédup | voir lot 3 | nouveau (lot 3) |
| `crates/web/webos-wasm` | 277 | `0d6c3444b8` 2026-10-09 | `apps/web` (WebOS) | — | reste aphrody | — | — | **X** |
| `crates/web/{obscura-browser, obscura-cdp, obscura-dom, obscura-net, obscura-render, web-crawl, web-detect, web-extract, web-frames, x}` | ≈161k | 2026-10-05..09 | consommés par `command`, `ffi`, `mcp`, `google` | sans objet ; `obscura-render` dépend de `taffy` patché | reste aphrody | — | — | — |

## 4. `crates/ui` (hors `ui/bun`) et `crates/tauri`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/ui/gui-core` | 650 | `9577422cc3` 2026-10-05 | rdeps 0 | sans objet | supprimer | −1 crate ; `m3-tokens` perd un dépendant | gate workspace | nouveau (lot 4) |
| `crates/ui/a2a-ui` | 280 | `5bde43dade` 2026-10-05 | rdeps 0 ; seulement un commentaire dans `a2a-coord` | sans objet | supprimer | −1 crate | gate workspace | nouveau (lot 4) |
| `crates/tauri/aphrody-tauri-specta` et sa crate `-macros` | 2 441 | `fa2cfb2e00` 2026-10-05 | rdeps 0 ; les dépendances workspace `specta` et `specta-typescript` (`Cargo.toml:343-344`) deviennent mortes avec elles | sans objet | supprimer, avec les deux entrées workspace | −2 crates, −specta | gate workspace + `bun test packages/infra/update` (catalogue de crates) | nouveau (lot 4) |
| `crates/ui/softraster` | 282 | `efdb7cd643` 2026-10-09 | rdeps 0 dans le monorepo, mais consommée par des dépôts externes (`C:\iecode`, `aphrody-nie-inventory`, d'après `tools/config/docs/root.json:331`, modifié par agy) | — | **reste aphrody** (à garder) | — | — | — |
| `aphrody-command` → `aphrody-tauri-cli` + `aphrody-create-tauri-app` (`Cargo.toml:153-154`, sans condition) | — | `8925b0edaf` 2026-10-09 | binaire `aphrody`, dont le paquet apk `aphrody/aphrody` | aports construit `-p aphrody --bin aphrody` sans feature (`APKBUILD`, `build()`) | reste aphrody : feature `tauri` (désactivée pour le CLI aports, activée pour le poste développeur) | **349 paquets** sortent de l'APK (17 % de la fermeture) ; build aports plus court | `aphrody tauri …` disparaît du binaire Alpine. Gates : `cargo-serial.sh check -p aphrody --no-default-features --features cli` puis `cargo-serial.sh check -p aphrody` (complet) ; `abuild -r` | nouveau (lot 6), coordonné avec **C2** pour l'APKBUILD |
| `crates/tauri/*bundler*` : `rpm` sous Linux (33 exclusifs), `apple-codesign` sous macOS (43) | — | — | `tauri-cli` | sur Alpine, la distribution passe par APKBUILD (`C:\aports\aphrody`) | reste aphrody (vendored) ; neutralisé côté Alpine par le lot 6 | −33 paquets dans l'APK | gate du lot 6 | nouveau (lot 6) |
| Tauri vendorisé (31 crates, `vendor.toml`, `yolo import`) | 156 195 | 2026-10-05..09 | `crates/ui/app`, `tauri-wrap`, `tauri-plugin-mcp-bridge` | — | reste aphrody (piste : consommer le fork par dépendance git ou registre) | — | — | — |
| `crates/ui/taffy` (fork `aphrody-labs/taffy` @`4cd8b38f`, `[patch.crates-io]`) | 23 989 | `9e4e294047` 2026-10-07 | `obscura-render` | — | reste aphrody | — | — | — |
| `crates/ui/m3-tokens/src/scheme` (port Rust de material-color-utilities) et npm `@material/material-color-utilities` | — | `6567868770` | Rust : `render`, `m3-reproduce`, `aphrody-bun` ; npm : m3 | doublon Rust/TS ; sans objet côté Bun | reste aphrody (priorité faible) | dédup faible | — | nouveau (hors lots) |
| `crates/ui/sprite-sheet` | 389 | `5bde43dade` | `app`, `identity` | sans objet | reste aphrody : fusion dans `identity` | −1 crate | gate workspace | nouveau (hors lots) |
| `crates/ui/{app, drive, identity, m3-reproduce, render, svg, tauri-wrap, tauri-plugin-mcp-bridge}` | ≈62k | 2026-10-05..09 | `app`, `command`, `aphrody-bun` | sans objet | reste aphrody | — | — | — |

## 5. `crates/infra`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/infra/yolo/src/cli.rs`, `FsIndex` (SQLite FTS5 trigram, l. 38-195) | ≈160 | `8a35b2e062` 2026-10-09 | `aphrody yolo` ; graphe : `FsIndex` `crates/infra/yolo/src/cli.rs:L42` (9 arêtes) | **doublon** de `aphrody-fsindex` (`crates/os/kernel/libs/fsindex/src/lib.rs:L73`, build et recherche) | reste aphrody : `yolo` consomme `aphrody-fsindex` | dédup −160 LOC | format de base différent. Gate : `cargo-serial.sh test -p aphrody-yolo -p aphrody-fsindex` | nouveau (lot 7) ; recouvre **Z1** (yolo → bun), à faire avant ou à abandonner si Z1 retire ce code |
| `crates/infra/discord` (moteur Rust : REST, interactions, bot) | 1 298 | `5cebb70f3b` 2026-10-09 | `aphrody-command` (`discord_cmd.rs`, `discord_compiler.rs`), `packages/discord/kit/src/lab/install-network.ts` | doublon avec `packages/discord/kit` (discord.js) ; sans objet côté Bun | reste aphrody : un seul moteur (décision produit, non tranchée ici) | dédup | — | nouveau (hors lots) |
| `crates/infra/infra/src/nginx.rs` | 347 | `5cebb70f3b` | `aphrody-infra` | doublon avec `m3/packages/m3-bun/src/targets/nginx.ts` (97 LOC) | reste aphrody (propriétaire unique) ; m3-bun le consomme | dédup | voir lot 9 | nouveau (lot 9) |
| `crates/infra/{aphrody, aphrody-command, git, infra, ovh, sql}` | 44 658 | 2026-10-05..09 | binaire `aphrody` ; `aphrody-command` est modifié par agy (non commité) | sans objet (gix : 71 paquets exclusifs dans `agent-home`, `git`, `infra` et `kernel` ; candidat de dépendance lourde, non remplaçable par Bun ni Alpine) | reste aphrody | — | — | — |

## 6. `crates/google` et `crates/contracts`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/google/model-antigravity` | 296 | `5bde43dade` 2026-10-05 | `agent-runtime` (`factory.rs`), `router` (mort, lot 1) | sans objet | reste aphrody : fusion dans `crates/google/antigravity` après le lot 1 | −1 crate | `cargo-serial.sh test -p aphrody-antigravity -p aphrody-agent-runtime` | nouveau (hors lots) |
| `crates/google/boq` | 207 | `9577422cc3` 2026-10-05 | `gemini-web` (`src/boq.rs`) seulement | sans objet | reste aphrody : fusion dans `gemini-web` | −1 crate | `cargo-serial.sh test -p aphrody-gemini-web` | nouveau (hors lots) |
| `crates/google/{antigravity, gemini-runtime, gemini-web, google}` | 13 385 | 2026-10-06..08 | `command`, `mcp`, `agent-*`, `ffi` | sans objet | reste aphrody | — | — | — |
| `crates/contracts/{a2a, agent-proto, app-protocol}` (`schema` exclu du workspace) | 6 553 | 2026-10-06..07 | 7, 5 et 1 rdeps | sans objet | reste aphrody | — | — | — |

## 7. Paquets TS : `packages/ai`, `packages/web`, `packages/google`, `packages/discord`

Preuve des importeurs : `bun C:/tmp/M/imports.ts <nom>`, sur les fichiers suivis `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.rs`, `.ps1`, `.nu` et `.py`, hors du dossier du paquet.

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `packages/web/http` (`@aphrody/http`, publié 0.1.1) | 154 | `f7d623e826` 2026-10-08 | **0 importeur**. Contredit `PLAN-ALPINE-BUN.md` section G, qui le dit « maintenu » | Bun fournit `fetch` et `Bun.serve` | supprimer, puis `blocked` dans `tools/config/npm-packages.json` (pas de dépublication) | −1 paquet | utilisateurs npm externes (non vérifié). Gate : `bun install --frozen-lockfile` + `bun run typecheck:packages` | nouveau (lot 8) ; mettre à jour la section G |
| `packages/ai/inference` (`@aphrody/inference`, publié) | 58 | `a43286b85f` 2026-10-07 | seulement `packages/interop/native/test/ffi-drift.test.ts` | sans objet | supprimer, avec son cas dans `ffi-drift.test.ts` | −1 paquet | `bun test packages/interop/native/test/ffi-drift.test.ts` | nouveau (lot 8) |
| `packages/ai/rag-core` TS (`@aphrody/rag-core`) | 855 | — | 0 importeur ; références dans `crates/ai/rag-core/src/api.rs` et `ffi-drift.test.ts` | sans objet | reste aphrody (couche wasm/FFI, à garder) | — | — | — |
| `packages/ai/xai` (`@aphrody/xai`, `blocked`) | 1 467 | — | 0 importeur hors de ses tests | sans objet | supprimer | −1 paquet | `bun install --frozen-lockfile` + `typecheck:packages` | nouveau (lot 8) |
| `packages/google/google` (`@aphrody/google`, publié) : seuls `drive v3` et `docs v1` de `googleapis` sont utilisés (`src/api.ts:117-118`) | 3 422 | `81242345ef` 2026-10-08 | 0 importeur ; utilisé par l'hôte (`tools/config/host/systemd/aphrody/aphrody-fonts-proxy.service`, `agent-sync.json` modifié par agy) et par `packages/engine/yolo/src/package-commands.ts` | Bun fournit `fetch` ; `@googleapis/drive` et `@googleapis/docs` existent sur npm (non vérifié localement) | reste aphrody : remplacer `googleapis` par `@googleapis/drive` + `@googleapis/docs`, ou par du REST `fetch` | **−214 Mo** de `node_modules` (googleapis@182) | surface d'API équivalente. Gate : `bun test packages/google/google` + démarrage du service `aphrody-fonts-proxy` en conteneur | nouveau (lot 8) |
| `packages/web/aphrody-web-test` (runner « compatible Playwright » sur Obscura CDP) | 2 233 | `3bcd104b34` 2026-10-09 | `scripts/audit/live-audit.ts` | **oui** : `@aphrody/bun-webview-page` (`C:\bun\packages\bun-webview-page/package.json:2`, Playwright sur `Bun.WebView`) | bun package `packages/bun-webview-page` ; aphrody garde un adaptateur fin vers Obscura | dédup ≈2k LOC | Obscura comme backend de `Bun.WebView` : compatibilité `Target.createTarget` non vérifiée. Gate : `bun scripts/audit/live-audit.ts` sur une page locale + `bun bd test` de `bun-webview-page` côté fork | fait (lot 10) |
| `packages/web/agent-browser/src/cdp.ts` (client CDP brut) | 291 | `6d2bbf3166` 2026-10-01 | `agent-browser` | **oui** : `Bun.WebView` avec `backend: { type: "chrome", url }` (`C:\bun\packages\bun-types\bun.d.ts:9700-9718`) et `view.cdp()` (`bun.d.ts:9989-10007`) | bun cœur, déjà livré : consommation | −291 LOC | `bun test packages/web/agent-browser` | fait (lot 10) |
| `packages/discord/kit` (`@aphrody/discord-kit` : discord.js, discordx) | 5 754 | `2b734aac9a` 2026-10-09 | 0 importeur ; utilisé par `scripts/tools/discord/debate/*.ts` | doublon avec `crates/infra/discord` | reste aphrody (choix d'un moteur, hors lots) | −2,9 Mo discord.js si abandon | — | nouveau (hors lots) |
| `packages/web/x`, `packages/ai/doc-ai` (bridge CLI `crates/infra/aphrody-command/src/multicall/bun_bridge.rs`, `922646bc26`) | — | 2026-10-06..09 | FFI vers `crates/web/x` ; `aphrody doc-ai` | sans objet | reste aphrody | — | — | — |

## 8. `m3/`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `m3/packages/m3-codemods` (MUI → m3-react, jscodeshift et `@babel/*`) | — | `414cb7121a` 2026-10-09 | agent `md-migrator` ; `m3/scripts` | **oui** en partie : `m3-next-migrate/src/codemods/mui.ts` passe déjà par le lex de `@aphrody/next-bun` (`C:\bun\packages\bun-next\codemods\lex.ts`) ; `rg jscodeshift C:\bun\packages` : 0 | bun package : codemods de `packages/bun-next/codemods` ou `bun-plugin-oxc` (Z1) ; retirer jscodeshift et `@babel/*` | −jscodeshift (0,6 Mo), −@babel/* (≈10 Mo) ; un seul moteur de codemod | sorties de codemod différentes. Gate : `bun test m3/packages/m3-codemods` (instantanés avant/après) | ✅ `9770240fa9` lot 11 (moteur TSX Bun, sans bun-plugin-oxc ; voir lot 11) |
| `m3/packages/eslint-plugin-m3` | 833 | `f7d623e826` 2026-10-08 | lint m3 | oxlint charge les plugins JS ; `bun lint` en cours chez Y (non vérifié) | bun package : plugin JS d'oxlint via `bun lint` | −eslint de la chaîne m3 | Gate : mêmes diagnostics sur `m3/packages/m3` | **Y** (recouvrement) |
| `m3/packages/m3-bun/src/targets/{linux-image.ts (214, initramfs + PID 1 en C), systemd.ts (82), docker.ts, nginx.ts (97)}` | ≈450 | `7b4d5f0cda` 2026-10-07 | `m3-bun deploy` | **oui** : image Aphrody Alpine (aports, OpenRC ; voir `docs/aphrody/merge/M-alpine.md`) ; `nginx.rs` dans `crates/infra/infra` | image (`linux-image`, `docker`) + aports (service OpenRC au lieu de systemd) ; `m3-bun compile` reste (il utilise déjà `Bun.build({ compile })`) | dédup ≈450 LOC, plus de C embarqué | cible « linux-image » perdue pour les apps m3. Gate : `bun test m3/packages/m3-bun` + `docker run` de l'image runtime avec l'app compilée | **C2** (image) / nouveau (lot 9) |
| `m3/packages/rg-ui` (`@rosegriffon/ui`) | 13 695 (115 f.) | `cd32a4b248` 2026-10-09 | seulement l'import optionnel `m3:optional/@rosegriffon/ui/tokens` dans `m3/packages/app-ui/showcase/src/pages/Brands.tsx` ; exclu de `typecheck:packages` | sans objet | supprimer du monorepo (sortie vers le dépôt du site rosegriffon) | −13,7k LOC | le showcase perd la page Brands. Gate : `bun run --cwd m3/packages/app-ui build` | nouveau (lot 12) |
| `@aphrody/m3-icons` déclaré dans `apps/web/package.json` | — | — | jamais importé par `apps/web` | sans objet | supprimer la dépendance | mineur | — | **X** et agy (noté seulement) |
| `m3-next`, `m3`, `m3-next-migrate` : déjà sur `@aphrody/next-bun`, `@aphrody/bun-plugin-tailwind` et `next-bun/codemods/lex` | — | 2026-10-09 | — | **oui**, déjà consommé | — (rien à refaire) | — | — | F1 et F2 |
| `@aphrody/web-to-tauri`, `@aphrody/app-ui` | — | — | 0 importeur, mais consommés via `tauri-wrap` et des scripts | sans objet | reste aphrody | — | — | — |

## 9. `apps/web`, `examples`, `py`, `docs`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/reference/upstream-bun` (344 fichiers, ≈2 Mo) | — | `5936a4e05c` 2026-10-09 | générateur `packages/infra/workspace/src/bun-upstream-docs.ts` ; lecteurs : `crates/compat/bun-docs` (outils MCP `bun_docs_*`), `scripts/release/release.ts:113` (`LICENSE.md`), `scripts/audit/compat/scripts/n2b/coverage-check.ts:33`, `docs-consolidation.ts`, tests | **oui** : 331 fichiers identiques octet pour octet à `C:\bun\docs`, 10 différents (périmés, par exemple `runtime/bunfig.mdx`, 22 lignes de diff), 3 propres (`APHRODY-FORK.md`, `LICENSE.md`, `SOURCE.json` → `bd599f5af9` 2026-10-06) | bun cœur `docs/` : `bun-docs` lit le checkout du fork (`APHRODY_BUN_CHECKOUT`) ou un artefact publié par le fork ; garder les 3 fichiers propres | −2 Mo ; fin de la dérive (10 fichiers déjà périmés) | MCP `bun_docs_*` sans checkout local. Gate : `cargo-serial.sh test -p aphrody-bun-docs` + `bun scripts/audit/compat/scripts/n2b/coverage-check.ts` + `bun scripts/release/release.ts --dry-run` (non vérifié que le flag existe) | ✅ lot 13 (aphrody `12ab1bc475`) ; recouvre **Y** (`bun docs`) |
| `docs/reference/discord` (copie du site de docs discordx) | ≈2 Mo | `5bfe9e1bd6` 2026-10-07 | aucun lecteur de code (`rg 'reference/discord'` : seulement les index de docs) | docs amont publiques | supprimer, avec un lien dans l'index | −2 Mo | Gate : `bun packages/infra/workspace/src/docs-gen.ts --check` (modifié par agy, attendre son commit) | ✅ lot 13 (aphrody `12ab1bc475`) |
| `examples/crystal-universe` | — | `a6abcb9be3` 2026-10-09 | seul consommateur de `dragon-pixel` | sans objet | reste aphrody (hors workspace, suit le lot 5) | — | voir lot 5 | nouveau (lot 5) |
| `py/` : réimplémentations de `gemini_web`, `session_db`, `antigravity_bridge`, `voice_server`, `web_browser` et `whisper` face aux propriétaires Rust (`docs/plans/vu/INVENTORY-py-vs-aphrody.md`, version HEAD, ligne I-24, décision « keep ») ; second workspace Python `packages/engine/python` avec `yolo-pyo3` (I-17) | 35 584 (aphrody) | `be449b3975` 2026-10-09 | `py/packages/aphrody` (maturin → `aphrody-rust`) | sans objet (Bun et Alpine ne fournissent pas ces services) | reste aphrody (décision « keep » de l'inventaire ; doublons signalés) | — | fichier d'inventaire modifié par agy | nouveau (hors lots) |
| `apps/web` (WebOS) | 9 541 | 2026-10-09 | — | — | reste aphrody | — | modifié par agy (`os-router.ts`) | **X** (noté seulement) |

## Lots de migration (disjoints en fichiers, dans cet ordre)

Gate commune `W` :

```
scripts/build/rust/cargo-serial.sh check --workspace --all-targets --locked --offline
bun install --frozen-lockfile
bun run typecheck:packages
```

1. **Lot 1. Groupe IA mort.**
   - À supprimer :
     - `crates/ai/{router, llm-infra, providers, context, prompts, mcp-oauth, sdk, skills, tools, skills-forge, supervisor}` ;
     - le commentaire de `crates/infra/aphrody-command/Cargo.toml:233` ;
     - `-p aphrody-summary -p aphrody-router` dans `packages/infra/workspace/src/ai-release-gate.ts`, une gate déjà cassée à réparer ;
     - la branche `aphrody-skills` de `agent-plugin-providers.ts:277-292`.
   - Gates : `W` + `cargo-serial.sh test -p aphrody-config -p aphrody-mcp -p aphrody-a2a-coord -p aphrody-agent-runtime` + `bun test packages/infra/workspace`.
   - Gain : −11 crates, −20 643 LOC.
   - Statut (G1, 2026-10-09) : ✅ aphrody `90f5899e4d` (suppressions des 11 crates, faites dans Z1) + `6963130884` (références, `ai-release-gate.ts`, branche `aphrody-skills`) ; lock 2555 → 2544. Tests : `cargo test -p aphrody-config -p aphrody-mcp -p aphrody-a2a-coord -p aphrody-agent-runtime` verts (423 + 122 tests). `bun test packages/infra/workspace` : 360 pass, 2 échecs hors lot (contrat bun-workspace sur `apps/web`, `m3/apps/example`, `m3-codemods`, `winclean` : chantier en cours chez un autre agent, `68fe1a3389` ; `bun-native.test.ts` expire à 60 s). Gate `W` complète : en cours sur le VPS (chargé, load ≈ 90), non conclue à cette date ; checks et tests ciblés verts ci-dessous.
2. **Lot 2. `engine-mistralrs`.**
   - À supprimer : `crates/ai/engine-mistralrs`, ses entrées dans `tools/config/update/rust-doctor.json` et dans `packages/infra/update/test/rust-doctor.test.ts`.
   - Gates : `W` + `bun test packages/infra/update` + `cargo tree -i serde-saphyr` vide.
   - Gain : −118 paquets du lock.
   - Ensuite, chez M-compat : retirer `[patch.crates-io] serde-saphyr` et `crates/compat/serde-saphyr` (36 961 LOC).
   - Statut (G1, 2026-10-09) : ✅ aphrody `81d968bf69` : `engine-mistralrs`, le patch `serde-saphyr` et `crates/compat/serde-saphyr` retirés (449 fichiers, −42 634 l.) ; lock 2544 → 2390 (−154). `bun test packages/infra/update` vert.
3. **Lot 3. Vecteurs de `memory`.**
   - Fichiers touchés :
     - supprimer `crates/ai/memory/src/{lancedb.rs, hnsw.rs}` et la feature `memory-lancedb` (`crates/ai/memory/Cargo.toml`) ;
     - retirer la dépendance `aphrody-memory/lancedb` de `aphrody-command/Cargo.toml:22` (même ligne que le lot 6 : faire ce lot d'abord) ;
     - faire consommer `aphrody-web-index` par `memory` ;
     - regrouper les noyaux dans `crates/ai/rag-core/src/fusion.rs`, à consommer depuis `web-index/src/kernels.rs` et `embed/src/native/{embedder.rs, quantize.rs}`.
   - Gates : `W` + `cargo-serial.sh test -p aphrody-memory -p aphrody-web-index -p aphrody-rag-core -p aphrody-embed` + `cargo check -p aphrody-rag-core --target wasm32-unknown-unknown`.
   - Gain : −126 paquets du lock, ≈−650 LOC.
   - Statut (G1, 2026-10-09) : ✅ aphrody `75bbbf51e2` : LanceDB retiré, `HnswBackend` sur `aphrody-web-index` (vrai HNSW, groupé par dimension, compaction des pierres tombales) ; tests ajoutés `put_replaces_embedding` et `recall_matches_exact_search` (500 vecteurs, dim 32, top-10, rappel ≥ 0,98) ; `cargo test -p aphrody-memory` 82/82, `cargo check -p aphrody-command -p aphrody-memory --all-targets` vert. Lock 2390 → 2257 (−133), −1 324/+205 l. ⏳ regroupement des noyaux dans `rag-core` : `web-index` et `embed` ne dépendent pas de `rag-core`, qui tire syn, regex, ndarray, blake3 et oxc ; et risque de divergence numérique (AVX2/FMA contre code sûr, seuils EPSILON). À refaire comme une petite crate de noyaux sans dépendance, avec tests de parité.
4. **Lot 4. ml et ui morts.**
   - À supprimer :
     - `crates/ml/{torch, torch-sys, diffusion, diffusion-sys}` ;
     - `crates/ml/ml-runtime/src/runtime/packages/{torch,diffusion}.rs` ;
     - `crates/ui/{gui-core, a2a-ui}` ;
     - `crates/tauri/aphrody-tauri-specta{,-macros}` ;
     - `specta` et `specta-typescript` dans le `Cargo.toml` racine.
   - Gates : `W` + `cargo-serial.sh test -p aphrody-ml-runtime -p aphrody-llama-server -p aphrody-m3-tokens`.
   - Gain : −8 crates, −80 960 LOC.
   - Avant de commencer : vérifier qu'aucun consommateur externe n'utilise la crate publiée `aphrody-torch`.
   - Statut (G1, 2026-10-09) : ✅ aphrody `81a89be6af` (124 fichiers, −82 028 l.) ; lock 2257 → 2243. `aphrody-torch`, `-sys`, `diffusion`, `-sys`, `gui-core`, `a2a-ui`, `tauri-specta{,-macros}` : aucune dépendance inverse sur crates.io. `Feature`/`Component` de `ml-runtime` réduits à Llama (+ Cuda/Rocm) ; catalogues `rust-doctor`, `forks.json`, `tauri-upstream.json`, `UPSTREAMS.md` régénéré. Tests : `cargo test -p aphrody-ml-runtime -p aphrody-llama-server -p aphrody-a2a-coord` (122) et `-p aphrody-m3-tokens` verts ; `bun test packages/infra/update` 186 pass. Non touché (modifié par un autre) : `tools/config/product-residue.baseline.json` garde 3 entrées mortes (`crates/ml/torch/README.md`, `dinov2.rs`, `aphrody-tauri-specta/UPSTREAM.md`).
5. **Lot 5. dragon-pixel hors workspace.**
   - Fichiers touchés : `exclude` de `crates/web/dragon-pixel-*` dans le `Cargo.toml` racine et `Cargo.lock` propre ; `examples/crystal-universe/README.md`.
   - Gates : `W` + `cargo check --manifest-path crates/web/dragon-pixel-wasm/Cargo.toml --target wasm32-unknown-unknown`.
   - Gain : −164 paquets du lock principal.
   - Statut (G1, 2026-10-09) : ✅ aphrody `274733def6` : `exclude`, trois manifestes autonomes (`[workspace]` vide, lints copiés, `Cargo.lock` propre), `wasm-package.ts --manifest-path` (artefact dans le `target/` du dépôt ; 3 tests ajoutés, 11 pass). Lock 2243 → 2074 (−169, 0 ajout). Gates : `cargo check --manifest-path crates/web/dragon-pixel-wasm/Cargo.toml --target wasm32-unknown-unknown --locked` vert (sous Windows, sans sccache : la ligne de commande de `web-sys` dépasse la limite, os error 206) ; `cargo test --manifest-path crates/web/dragon-pixel-server/Cargo.toml` 5/5.
6. **Lot 6. Feature `tauri` d'`aphrody-command`.**
   - Fichiers touchés :
     - `crates/infra/aphrody-command/Cargo.toml:153-154`, qui passent `optional` ;
     - les `#[cfg(feature = "tauri")]` du dispatch multicall, dans les fichiers non modifiés par agy ;
     - `crates/infra/aphrody/Cargo.toml`.
   - Côté aports (C2) : `C:\aports\aphrody\aphrody\APKBUILD` construit sans `tauri`.
   - Gates : `W` + `cargo-serial.sh check -p aphrody --no-default-features --features cli` + `abuild -r` dans `aphrody/aphrody`.
   - Gain : −349 paquets dans l'APK.
   - Attendre le commit d'agy sur `aphrody-command/src/lib.rs`.
7. **Lot 7. `FsIndex` de yolo sur `aphrody-fsindex`.**
   - Fichiers touchés : `crates/infra/yolo/src/cli.rs`, `crates/infra/yolo/Cargo.toml`.
   - Gate : `cargo-serial.sh test -p aphrody-yolo -p aphrody-fsindex`.
   - Recouvre Z1 : à abandonner si Z1 retire ce code.
   - Statut (G3, 2026-10-09) : ⏸ non fait, pas un remplacement à l'identique. `aphrody-fsindex::FsIndex` parcourt avec `walkdir` (ni `.gitignore` ni `.ignore`, entre dans `.git`), indexe aussi les dossiers, cherche par préfixe de mot (`term*`, classement `bm25`) et ne retire jamais un fichier disparu (upsert). Le `FsIndex` de yolo (`cli.rs:42-200`) parcourt avec `ignore`, ne garde que les fichiers, cherche une sous-chaîne sans casse (FTS5 trigram + `LIKE` sous 3 caractères, test `lib.RS`), reconstruit la base de façon atomique (`.partial` puis renommage) et importe l'ancien `fsindex.tsv`. Basculer changerait les résultats de `yolo fs search` ; aligner `aphrody-fsindex` changerait son schéma pour ses 3 autres consommateurs (`aphrody-command` feature `index`, `winclean`, `ui/app`). Gain ≈ 150 LOC : lot gardé en attente d'une décision de schéma commun.
   - Statut (H1, 2026-10-09) : ⏳ après G1 (Cargo.lock). Patch prêt, non commité, non compilé : `C:/tmp/H1b/lot7-fsindex.patch` (`git apply --check` OK sur `8a06065c9b`). Il ne change pas les résultats de `yolo fs search` : nouveau module `aphrody_fsindex::paths` (`PathIndex`, `PathHit`), qui reprend à l'identique le schéma `files(path,size,modified)` + `files_fts` trigram, la reconstruction atomique et l'import `fsindex.tsv`, avec 4 tests ; le `FsIndex` public et son schéma ne bougent pas pour les 3 autres consommateurs. yolo garde son parcours `ignore`, perd `rusqlite` et dépend d'`aphrody-fsindex`. LOC : `cli.rs` 1897 → 1759, fsindex +296 (`paths.rs` 272) : on déplace le code sans gain net. Passe finale : `git apply C:/tmp/H1b/lot7-fsindex.patch && scripts/build/rust/cargo-serial.sh test -p aphrody-yolo -p aphrody-fsindex` (met Cargo.lock à jour).
   - Statut (G1, 2026-10-09) : ✅ aphrody `93cf838526`. Patch de H1 appliqué, une seule correction de durée de vie (`io_error<'a>` dans `paths.rs`, E0106), rustfmt. Gates : `cargo-serial.ps1 test --locked --offline -p aphrody-yolo -p aphrody-fsindex` : fsindex 30 pass, yolo 9 pass ; clippy `--all-targets` des deux crates sans avertissement. Cargo.lock : 1 ligne (yolo perd `rusqlite`, gagne `aphrody-fsindex`).
8. **Lot 8. Paquets TS morts et googleapis.**
   - Fichiers touchés :
     - supprimer `packages/web/http`, `packages/ai/inference` et `packages/ai/xai` ;
     - retirer leurs cas dans `packages/interop/native/test/ffi-drift.test.ts` ;
     - passer leurs entrées à `blocked` dans `tools/config/npm-packages.json` ;
     - `packages/google/google/{package.json, src/api.ts}` : `googleapis` → `@googleapis/drive` + `@googleapis/docs` ;
     - `bun.lock`.
   - Gates : `W` + `bun test packages/interop/native/test/ffi-drift.test.ts packages/google/google`.
   - Gain : −214 Mo de `node_modules`, −3 paquets.
   - À reporter dans `PLAN-ALPINE-BUN.md` section G : `@aphrody/http` y figure à tort comme maintenu.
   - Statut (G2, 2026-10-09) : ✅ aphrody `e2a6a42c91` (+ reformatage `fefc5307e0`), 37 fichiers, +78/−2 261. `packages/web/http`, `packages/ai/inference` et `packages/ai/xai` supprimés (aucun importeur de code) ; leurs tests utiles rejoignent `@aphrody/bun` (`packages/interop/native/test/http.test.ts`, `inference.integration.test.ts`) ; npm-packages `blocked`, pipeline (7 étapes), product-residue, docs. Cohérence avec le lot 7 de M-bun : la copie canonique du transport JSON est `packages/interop/native/src/http.ts` (`@aphrody/bun`) ; la ligne « `@aphrody/web/http` reste la copie canonique » de M-bun était fausse (ce paquet n'existe pas, `@aphrody/http` n'en était qu'une façade). `ffi-drift.test.ts` : les symboles `aphrody_inference_*` restent (ABI liée par `src/inference.ts`), seul le commentaire change. `googleapis` 182 (245,7 Mo décompressé) → `@googleapis/drive` 26.0.2 + `@googleapis/docs` 14.1.0 (2,5 + 0,5 Mo), `api.ts` sur `auth.OAuth2`/`auth.GoogleAuth` de `@googleapis/drive`. Gates : `tsgo` native et google à 0 erreur ; `bun test packages/google/google packages/interop/native` : 65 pass, 0 échec google. Les 17 échecs Windows préexistants de google (uid, bits de mode, racine `/`, `rename` sur une cible ouverte) sont passés en `skipIf(win32)`. Reste : 1 échec préexistant hors lot, `test-native.test.ts` N2B, qui lit un `n2b.json` égaré dans `%TEMP%` (la recherche du manifeste remonte au-dessus de la racine scannée).
9. **Lot 9. Cibles de déploiement de m3-bun.**
   - Fichiers touchés : supprimer `m3/packages/m3-bun/src/targets/{linux-image.ts, systemd.ts}` ; `docker.ts` construit `FROM ghcr.io/aphrody-labs/alpine:3.24-runtime` (lot A2 de M-alpine) ; `nginx.ts` génère via `aphrody infra nginx` (`crates/infra/infra/src/nginx.rs`).
   - Gates : `bun test m3/packages/m3-bun` + `docker run` de l'app compilée.
   - Statut : ✅ `docker.ts` (aphrody `7f339f6b8d`) : build et exécution sur `ghcr.io/aphrody-labs/alpine:3.24-runtime`, `ROOTFS_SCRIPT` supprimé ; `targets.test.ts` vert, app compilée exécutée sur l'image locale. ⏳ `systemd.ts` gardé : hôtes de production sous systemd (`service-catalog.json`, VPS Ubuntu). ✅ `linux-image.ts` délègue à `scripts/aphrody/initramfs.ts` du fork (aphrody `fad1493c9f`, voir A7 de M-alpine ; ⏳ preuve qemu). ✅ `nginx.ts` (aphrody `fad1493c9f`) : nouvelle commande `aphrody infra nginx render [<json>|-] [--comment …]` et `aphrody infra nginx test <conf>` sur `NginxConfig` (champs facultatifs en `#[serde(default)]`, sans nouvelle dépendance) ; m3-bun écrit `<app>.nginx.json` et `<app>.http.nginx.json`, puis les fait rendre par cette commande ; sans elle sur le PATH, un `.conf.todo` donne la commande à lancer. Tests Rust `nginx` 6/6 (Docker local, `aphrody/build-linux:26.04`). ⏳ le binaire `aphrody` installé ne contient pas encore la commande : rendu `.conf` effectif après sa reconstruction. 16 échecs préexistants de `bun test m3/packages/m3-bun` (`m3:theme.css`/`m3:tokens.css` non résolus : le plugin Tailwind résout lui-même les `@import` et court-circuite les `onResolve` `m3:`) : domaine F2.
   - Gain : ≈−450 LOC, plus de PID 1 en C embarqué.
10. **Lot 10. Navigateur sur Bun.WebView.**
    - Fichiers touchés : `packages/web/agent-browser/src/cdp.ts` remplacé par `Bun.WebView({ backend: { type: "chrome", url } })` et `view.cdp()` ; `packages/web/aphrody-web-test` réduit à un adaptateur au-dessus de `@aphrody/bun-webview-page` ; `scripts/audit/live-audit.ts`.
    - Gates : `bun test packages/web/agent-browser packages/web/aphrody-web-test` + `bun scripts/audit/live-audit.ts` sur une page locale.
    - Prérequis non vérifié : Obscura doit répondre à `Target.createTarget`.
    - Statut (G2, 2026-10-09) : prérequis prouvé en local (`aphrody web-engine launch` puis CDP brut : `Target.createTarget` → `{"targetId":"page-1"}` ; `new Bun.WebView({ backend: { type: "chrome", url } })` + `view.cdp("Runtime.evaluate")` → 2). ✅ aphrody `47ed28b58b` : `WebCdpPage` (`agent-browser/src/cdp.ts`, 291 → 177 LOC) sur `Bun.WebView` ; transport WebSocket et `cdp-wire.test.ts` retirés. `view.cdp()` est sérialisé, car Bun refuse un second `cdp()` en vol (« a cdp() is already pending »). Bun.WebView garde `Page.frameNavigated`, `Page.loadEventFired` et `Runtime.consoleAPICalled` sans les dispatcher (`src/runtime/webview/ChromeBackend.cpp:1139-1171`) : l'URL vient de `view.url`, la console de l'option `console`, et `onEvent` prend la liste des méthodes. Gates : `bun test packages/web/agent-browser` : les 3 tests Obscura réels passent, et les 19 échecs Windows préexistants (faux binaires shell, `os error 193`) sont identiques avant et après ; `aphrody-web-test` 37 pass ; étape 5 de `live-audit` (TestPage `http` + `collectPageDiagnostics`) sur une page `Bun.serve` locale : 200, titre, texte, `consoleErrors: ["boom"]`. `live-audit.ts` ne vise que des origines `https://<host>` publiques. ✅ cœur du fork `d8a6f1c5dd4` : les événements CDP traités en interne (`Page.frameNavigated`, `Page.loadEventFired`, `Runtime.consoleAPICalled`, `Target.detachedFromTarget`) sont aussi transmis aux écouteurs, et plusieurs `cdp()` peuvent être en vol (promesses indexées par id CDP) ; tests dans `test/js/bun/webview/webview-chrome.test.ts`, rouges avec le Bun installé. ✅ aphrody `4fefb35bb2` : `ObscuraPage` (`aphrody-web-test/src/cdp.ts`) enveloppe un `Page` de `@aphrody/bun-webview-page` 0.1.1-aphrody.2 sur `Bun.WebView` backend chrome ; `TestPage` et `collectPageDiagnostics` passent par lui ; `resolveEngineBinary` trouve `aphrody-web.exe` sous Windows (`.exe`, `%LOCALAPPDATA%/aphrody/bin`). Typage tsgo propre. Gates restants (passe finale) : `bun bd test test/js/bun/webview/webview-chrome.test.ts` côté fork ; `bun test packages/web/aphrody-web-test` exige `target/runtime/aphrody_ffi.dll` (`just yolo::runtime-build`), absent au moment du lot.
11. **Lot 11. Codemods m3 (après Z1).**
    - Fichiers touchés : `m3/packages/m3-codemods/**` sur `@aphrody/next-bun/codemods` ou `bun-plugin-oxc` ; retrait de `jscodeshift` et `@babel/*` de `m3/packages/m3-codemods/package.json`.
    - Gates : `bun test m3/packages/m3-codemods` (instantanés identiques avant et après).
    - Statut (H2, 2026-10-09) : ✅ aphrody `9770240fa9`, 36 fichiers, +1 576/−780. Le moteur jscodeshift/recast est remplacé par un moteur Bun sans dépendance runtime : scanner TSX (`lib/tsx-scan.ts` : imports, directives, arbre JSX), éditions de texte positionnées (`lib/edits.ts`), entrée validée par `Bun.Transpiler` (TSX invalide → `SyntaxError`, fichier intact), et CLI `bun scripts/codemod.ts <transform> <glob> [--dry]`. Cibles écartées, avec preuve : `bun-plugin-oxc` absent de npm (404) ; `@aphrody/bun-plugin-oxc` 0.2.0 publié sans addon `.node` ni parser (4 fichiers, 12 Ko) ; 0.3.0 non publiée et hors des workspaces aphrody. `@aphrody/next-bun/codemods/lex.ts` prend l'apostrophe d'un texte JSX pour une chaîne, et son `applyEdits` inverse l'ordre des insertions à une même position. Parité avant/après, après oxfmt, sur 5 transforms × (5 fixtures + 20 fichiers de corpus) + `transformSource` : 172/175 identiques. Les 3 écarts portent sur le même fichier : recast perdait l'espace significatif de `</Button> c'est ok`. 6 fixtures ajoutées (11 au total), toutes vérifiées : TSX valide, idempotence et égalité oxfmt. Gate : 15 pass, 0 échec ; `tsgo` 0 erreur. Gain : −jscodeshift, −@types/jscodeshift (catalog), `bun.lock` 919 → 840 paquets, `@babel/*` 37 → 3 (code-frame, helper-validator-identifier et runtime restent, utilisés ailleurs). Reste : `tools/config/npm-packages.json` décrit la 3.3.7 publiée (`dependencies: ["jscodeshift"]`, intégrité du tarball), à mettre à jour à la prochaine publication ; `packages/infra/workspace/src/code-edit.ts` appelle la CLI jscodeshift externe (outil de toolchain, ce n'est pas une dépendance) ; doublon possible avec `m3-next-migrate/src/codemods/jsx.ts`.
12. **Lot 12. Sortie de rg-ui.**
    - Fichiers touchés : supprimer `m3/packages/rg-ui/**` ; retirer l'import optionnel de `m3/packages/app-ui/showcase/src/pages/Brands.tsx` et l'entrée `nav.ts` ; mettre à jour `package.json` (workspaces) et `tools/config/application-contracts.json`.
    - Gates : `W` + `bun run --cwd m3/packages/app-ui build`.
    - Statut (G2, 2026-10-09) : ✅ aphrody `732cd8d810`, 124 fichiers, −15 270 LOC. `m3/packages/rg-ui` supprimé ; kit `@rosegriffon/ui/tokens` retiré de `Brands.tsx` (la page reste, avec ses autres contenus) et de `nav.ts` ; `inventory.json` régénéré ; filtre `!@rosegriffon/ui` retiré de `typecheck:packages` (les workspaces passent par le glob `m3/packages/*`, sans changement) ; `application-contracts.json` (`ui` venu du dépôt du site) ; `m3/README.md`, `m3/docs/architecture/DECISIONS.md`, exemple de `m3-bun/src/plugin.ts`. Gates : `bun run --cwd m3/packages/app-ui build` (640 fichiers), typecheck app-ui et 21 tests showcase verts. Reste à régénérer par docs-gen (fichiers générés ou claimés) : `docs/reference/workspace/STATE.md`, `documentation.json`, `docs/ecosystem/ECOSYSTEM.md`, `ecosystem.json` ; `m3/PLAN.md:79` est claimé par F3.
    - Gain : −13,7k LOC.
13. **Lot 13. Docs recopiées.**
    - Fichiers touchés :
      - `docs/reference/upstream-bun/**`, réduit à `APHRODY-FORK.md`, `LICENSE.md` et `SOURCE.json` ;
      - `crates/compat/bun-docs`, qui lit le checkout du fork ;
      - `packages/infra/workspace/src/bun-upstream-docs.ts` ;
      - suppression de `docs/reference/discord/**`.
    - Gates : `cargo-serial.sh test -p aphrody-bun-docs` + `bun scripts/audit/compat/scripts/n2b/coverage-check.ts` + vérification des index de docs, après le commit des `docs/**` d'agy.
    - Gain : −4 Mo.
    - Statut (H3, 2026-10-09) : ✅ aphrody `12ab1bc475` (412 fichiers, +811/−72 820) et `68fe1a3389`. `docs/reference/upstream-bun` passe de 344 fichiers (2,09 Mo) à 3 (13 Ko) : `SOURCE.json` n'est plus qu'un pin (commit de `docs/` du fork hors `docs/aphrody`, aujourd'hui `c9408c68abe`, et sha256 de `LICENSE.md`). `docs/reference/discord` (41 fichiers, 2,12 Mo) est supprimé, sans consommateur de code (rg) ; `carbon-oauth.md`, contenu Aphrody, va dans `docs/guides/discord/`. Ordre de résolution, identique en Rust (`aphrody-bun-docs`) et en TS (`resolveBunDocs`) : `APHRODY_BUN_DOCS`, checkout du fork (`APHRODY_BUN_CHECKOUT`, sinon `C:/bun` sous Windows), corpus installés, téléchargement précédent, puis téléchargement versionné annoncé sur stderr (`git clone --filter=blob:none --sparse` de `docs/` sans images, au commit épinglé ou à `APHRODY_BUN_DOCS_REF` ; ≈15 s, 7 Mo). `APHRODY_BUN_DOCS_FETCH=0` en fait une erreur explicite. `bun-reference.ts`, `monorepo-audit.ts` et `coverage-check.ts` lisent le corpus résolu. 18 pages de docs ont été réécrites vers le fork ; les chemins de pages dans `SERVER.md` sont relatifs à son `docs/`. Gates : `cargo test -p aphrody-bun-docs` 13 pass (via `cargo-serial.ps1` local, `APHRODY_LOCAL_CARGO=1`, car le tunnel `vps-cargo.ts` a coupé deux fois), clippy `-D warnings` et fmt propres ; `bun test …/bun-upstream-docs.test.ts` 4 pass, dont un téléchargement depuis un dépôt `file://` ; `coverage-check.ts` 348 pages scannées (correctif au passage : le plugin `aphrody` installé par Claude Code sert de repli, au lieu d'un ENOENT sur `~/plugins/aphrody`) ; `docs-links` : il reste 4 liens cassés, tous dans des fichiers claimés par codex. Préexistant corrigé dans `68fe1a3389` : `engines.bun` passe à `>=1.4.3` dans 70 manifestes. ⏳ fichiers claimés ou modifiés par d'autres, à corriger par leur propriétaire :
      - `docs/README.md:93,100` : lien vers `reference/discord/` et vers `upstream-bun/README.md` ;
      - `docs/plans/workspace/PLAN.md:89-90` : `upstream-bun/runtime/{ffi,node-api}.mdx`, à pointer vers `https://github.com/aphrody-labs/bun/blob/main/docs/runtime/…` ;
      - `AGENTS.md:31-33`, `docs/reference/infra/UPSTREAMS.md:39,66`, `docs/ecosystem/MCP-TOOLS.md:87` et `ecosystem.json` : décrivent encore un miroir ;
      - `docs/cli/HELP.md:25,84` et `packages/engine/yolo/src/index.ts:90-91,310-315` (H1) : `BUN_DOCS_MIRROR` doit devenir `resolveBunDocs({ download: false })`, et l'aide « Bun docs mirror » doit être corrigée ;
      - `documentation.json` et `STATE.md` : à régénérer par docs-gen ;
      - `bun-workspace` reste rouge sur `apps/web/package.json` (engines, catalog, typecheck), `m3/apps/example`, `m3/packages/m3-codemods` et `packages/os/winclean`.
      - Le test `cli_app` « searches the Bun docs » échoue : le bun système 1.4.3-aphrody.2 n'a pas `bun docs` (Z1).

Hors lots, à décider avant d'agir :

- fusion des façades Obscura ;
- remplacement de V8 (obscura-js) par JSC ;
- choix d'un seul moteur Discord ;
- session et rollout ;
- micro-crates (`http-error`, `ocr`, `boq`, `model-antigravity`, `obscura-ssrf`, `sprite-sheet`) ;
- doublons py (I-24, I-17) ;
- material-color-utilities.

## Recouvrements avec les chantiers en cours

| Chantier | Recouvrement |
| --- | --- |
| Y | `eslint-plugin-m3` → `bun lint` ; `docs/reference/upstream-bun` → `bun docs` |
| Z1 | `aphrody-oxc-bridge` (13 paquets exclusifs dans le binaire) ; `m3-codemods` (jscodeshift) ; `yolo` (FsIndex, lot 7) |
| X | `apps/web`, `webos-wasm`, `@aphrody/m3-icons` (noté seulement) |
| C2 | runtimes llama.cpp et onnxruntime en apk ; APKBUILD `aphrody/aphrody` sans `tauri` (lot 6) ; image runtime pour m3-bun (lot 9) |
| G (`PLAN-ALPINE-BUN.md`) | `@aphrody/http` y est noté « maintenu », alors qu'il n'a aucun importeur |

## Décompte des items par cible

| Cible | Items |
| --- | --- |
| supprimer | 28 |
| reste aphrody, réduit ou fusionné (dédup interne) | 19 |
| reste aphrody, inchangé (à garder) | 18 |
| bun package `packages/...` | 3 (`bun-webview-page`, `bun-next/codemods` ou `bun-plugin-oxc`, plugin oxlint via `bun lint`) |
| bun cœur `src/...` ou `docs/` | 2 (`Bun.WebView` CDP, `docs/` du fork) |
| aports `aphrody/<pkg>` | 3 (llama.cpp-libs et onnxruntime en dépendances, APKBUILD sans `tauri`, service OpenRC de m3-bun) |
| image | 1 (`alpine:3.24-runtime` pour m3-bun) |
| nouveau, à risque élevé | 1 (JSC à la place de V8 dans obscura-js) |
