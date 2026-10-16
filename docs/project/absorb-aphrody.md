# Absorption d'aphrody dans Bun

Directive du 2026-10-16 : Bun (`aphrody-labs/bun`, `main`) est le produit unique.
Tout code utile de `aphrody-labs/aphrody` (`C:\src\aphrody`, inventaire au commit
`ac1f1bce8b`) est absorbé dans Bun, sans shim ni chemin legacy.

## Périmètre

Deux couches **restent dans aphrody** et consomment Bun (pas d'absorption) :

- **IA** : modèles, agents, mémoire, A2A, MCP et outils IA (`crates/ai/*`,
  `crates/contracts/*`, `crates/ml/*`, `crates/engine/yolo-runtime`,
  `crates/infra/yolo`, `packages/ai/*`, `packages/engine/*`, `packages/os/a2a`).
- **Infra** : hôtes, ssh, déploiement, services VPS/dbfr, quality/pipeline, cloud
  (`crates/infra/{infra,ssh,certificates,ovh,discord,remote-desktop,wireguard,vpn}`,
  `packages/infra/{ovh,update,product}`, `packages/discord/kit`).

Tout le reste (web, google, search, git, docs, scan, n2b, shell, graph non IA,
OS et plateforme, CLI généraliste) devient Bun.

## Zones en cours (autre agent) — ne pas toucher

`src/adblock`, `src/runtime/adblock`, `src/privacy`, `src/runtime/privacy.rs`,
`src/readability`, `src/runtime/api/HTMLReadability.rs`, `src/runtime/web_detect`,
`src/browser/crates/detect`, `packages/web/rust` (absorption web/google, reçu
`packages/web/rust/transfer-receipt.json`), `scripts/aphrody/chromium*.ts`,
`patches/chromium`, `src/migrate` (n2b), `packages/bun-types/*.d.ts` modifiés.

## Inventaire : source → cible → statut

Statuts : `fait` (déjà dans Bun), `en cours (autre agent)`, `à faire`,
`supprimer` (doublon ou mort), `reste aphrody`.

### Web, Google, recherche

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| packages/web/agent-browser | packages/web/rust/packages/agent-browser | en cours (autre agent) ; supprimer côté aphrody après bascule |
| packages/web/fuzzy | packages/web/rust/packages/fuzzy | en cours (autre agent) |
| packages/web/qr | packages/web/rust/packages/qr | en cours (autre agent) |
| packages/web/timeline | packages/web/rust/packages/timeline | en cours (autre agent) |
| packages/web/webos-wasm | packages/web/rust/packages/webos-wasm | en cours (autre agent) |
| packages/web/x | packages/web/rust/packages/x | en cours (autre agent) |
| packages/google/google, crates/google/* | packages/bun-google/aphrody | en cours (autre agent) |
| CLI `aphrody web`, `aphrody search` | `bun web` / src/browser/crates/{crawl,extract,service} | en cours (autre agent) |
| crates/shell/web, packages/shell/web | packages/web (site, worker) | à faire (lot 4) |

### Git, docs, scan, graph, n2b

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| crates/infra/git (`aphrody git api/graphql/repo/search/inspect`) | crate `bun_git` dans src/git + sous-commande `bun git` | à faire (lot 2) |
| crates/compat/bun-docs (`aphrody docs search`) | `bun mcp` docs_search/docs_read (existant) | supprimer (doublon) |
| CLI `aphrody scan` | src/graph (`bun graph`) + `bun mcp` graph_* | supprimer (doublon de src/graph) |
| CLI `aphrody graph` (graphe de code non IA) | src/graph | fait |
| CLI `aphrody n2b` | src/migrate (`bun n2b`) | en cours (autre agent) |
| crates/ai/code-graph | — | reste aphrody (IA) |

### Shell et terminal

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| crates/shell/nu (`aphrody shell eval`) | Bun Shell (`Bun.$`, `bun exec`) | supprimer : Bun Shell remplace Nushell |
| crates/shell/aphrody-term | src/vt | fait (src/vt porte déjà le code) ; supprimer côté aphrody |
| crates/shell/term-caps | src/vt (capacités terminal) | à faire (lot 3) |
| crates/shell/terminal-backend | src/vt + bun:pty | à faire (lot 3) |
| crates/shell/tauri | packages/bun-tauri | à faire (lot 5) |

### OS et plateforme

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| crates/os/kernel, crates/os/ostd | `bun:linux` / aphrody-labs/linux | à faire (lot 6) |
| packages/os/kernel-client (@aphrody/os) | packages/bun-os | à faire (lot 6) |
| packages/os/winclean | packages/bun-windows-winclean | fait ; supprimer côté aphrody |
| packages/os/drive-client, crates/ui/drive | packages/bun-google (Drive) | en cours (autre agent) |
| crates/native/simdutf | src/simdutf_sys | supprimer (doublon) |
| crates/native/native, packages/interop/native (@aphrody/bun) | src/runtime + bun:ffi | à faire (lot 1, audit API par API) |
| crates/native/gpu-backend | packages/bun-video (WebGPU) | à faire (lot 7) |
| crates/interop/ffi | bun:ffi / packages/bun-native-plugin-rs | à faire (lot 1) |
| crates/pkg/{cli,core,ffi,net,store} | packages/aphrody-pkg-system → src/install | à faire (lot 8) |
| crates/compat/toolchains | scripts/build (toolchains) | à faire (lot 8) |
| crates/compat/egui-winit, rfb-encodings | — | supprimer (sans consommateur Bun) |

### UI et rendu

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| crates/tauri/aphrody-tauri, -runtime, -runtime-cef | packages/bun-tauri/crates/* | fait (divergence à réconcilier, lot 5) |
| crates/tauri/aphrody-tauri-plugin-* (15) | packages/bun-tauri/crates/plugins | à faire (lot 5) |
| crates/tauri/aphrody-tauri-api | packages/bun-tauri/js | à faire (lot 5) |
| crates/ui/tauri-wrap, tauri-plugin-mcp-bridge | packages/bun-tauri | à faire (lot 5) |
| crates/ui/taffy, render, softraster, svg | src/browser/crates/{layout,render} | à faire (lot 7) |
| crates/ui/m3-reproduce, app, identity, sprite-sheet | packages/aphrody-migrated/m3, packages/bun-m3 | à faire (lot 7) |
| crates/ui/bun | packages/bun-runtime-sdk | supprimer (doublon) |

### CLI généraliste et outils

| Source aphrody | Cible Bun | Statut |
| --- | --- | --- |
| crates/infra/aphrody, aphrody-command(-pure/-wasm) | dispatch `bun …` (src/runtime/cli) pour les sous-commandes non IA/infra | à faire (lot 9) |
| packages/infra/cli-wasm | — | supprimer avec aphrody-command-wasm |
| packages/infra/paths, workspace | src/paths, src/workspace | à faire (lot 9) |
| packages/infra/sql, crates/infra/sql | Bun.sql / bun:sqlite | supprimer (doublon) |
| packages/os/a2a, crates/contracts/a2a | — | reste aphrody (IA) |
| crates/infra/vpn, wireguard | src/bun_vpn | reste aphrody (infra) ; moteur VPN déjà dans src/bun_vpn |

## Lots (ordre de dépendance et de valeur)

0. Plan (ce fichier).
1. Natif : audit `@aphrody/bun` / `aphrody-native` / `aphrody-ffi` contre bun:ffi et src/runtime ; absorber le manquant.
2. `bun git` : crate `bun_git` (gix) + sous-commande ; tests test/cli.
3. Terminal : term-caps et terminal-backend dans src/vt.
4. Site/shell web dans packages/web (après l'autre agent).
5. Tauri : réconcilier packages/bun-tauri avec aphrody, plugins et API JS.
6. OS : kernel/ostd vers bun:linux, @aphrody/os vers packages/bun-os.
7. Rendu : taffy/render/softraster/svg vers src/browser, m3 vers packages/bun-m3, gpu-backend vers bun-video.
8. Paquets système : aphrody-pkg vers src/install, toolchains vers scripts/build.
9. CLI : sous-commandes générales vers `bun …`, suppression des doublons côté aphrody.

Chaque lot : un commit Bun, puis suppression des sources absorbées dans aphrody.
Les builds natifs se font sur le VPS (`/home/ubuntu/src/bun`, verrou
`/home/ubuntu/build/locks/heavy.lock`, artefacts dans `/home/ubuntu/build/storage`).
