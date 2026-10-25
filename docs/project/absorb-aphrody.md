# Absorption d'aphrody dans Bun

Directive du 2026-10-16 : Bun (`aphrody-labs/bun`, `main`) est le produit unique.
Tout code utile de `aphrody-labs/aphrody` (`C:\src\aphrody`, inventaire au commit
`ac1f1bce8b`) est absorbé dans Bun, sans shim ni chemin legacy.

> Note (2026-10-25) : depuis, les add-ons ont quitté ce dépôt. `src/bun_vpn` est le plugin
> aphrody-labs/bun-vpn (`plugins/vpn`), `packages/bun-video` le sous-module optionnel
> aphrody-labs/bun-video, et `aphrody-labs/bun-distribution` s'appelle `aphrody-labs/bun-os`.
> Voir [Add-ons](add-ons.mdx). Les tableaux ci-dessous gardent les chemins du 2026-10-16.

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

| Source aphrody                          | Cible Bun                                              | Statut                                                        |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| packages/web/agent-browser, packages/web/aphrody-web-test | packages/bun-web (`@aphrody/bun-web`, `/testing`) | fait |
| packages/web/fuzzy | packages/bun-fuzzy | fait |
| packages/web/qr | packages/bun-qr | fait |
| packages/web/timeline | packages/bun-timeline | fait |
| crates/web/{web-engine,web-frames,x}, obscura facade | src/browser/crates/{engine,frames}, src/x ; facade supprimée (doublon de `bun_browser`) | fait |
| packages/web/webos-wasm | bun-os `crates/aphrody-webos-wasm` + `packages/webos-wasm` (propriétaire OS) ; Bun garde `bun_wasm` et apps/desktop | fait |
| packages/web/x | packages/bun-x (`@aphrody/x`), Rust `src/x` (`bun_x`) | fait |
| packages/google/google, crates/google/* | packages/bun-google/aphrody                            | en cours (autre agent)                                        |
| CLI `aphrody web`, `aphrody search`     | `bun web` / src/browser/crates/{crawl,extract,service} | en cours (autre agent)                                        |
| crates/shell/web, packages/shell/web    | packages/web (site, worker)                            | à faire (lot 4)                                               |

### Git, docs, scan, graph, n2b

| Source aphrody                                 | Cible Bun                                   | Statut                                                 |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| crates/infra/git (`aphrody git …`)             | src/git (`bun_git`)                         | fait (lot 2) ; sous-commande `bun git` à faire (lot 9) |
| crates/compat/bun-docs (`aphrody docs search`) | `bun mcp` docs_search/docs_read (existant)  | supprimer (doublon)                                    |
| CLI `aphrody scan`                             | src/graph (`bun graph`) + `bun mcp` graph_* | supprimer (doublon de src/graph)                       |
| CLI `aphrody graph` (graphe de code non IA)    | src/graph                                   | fait                                                   |
| CLI `aphrody n2b`                              | src/migrate (`bun n2b`)                     | en cours (autre agent)                                 |
| crates/ai/code-graph                           | —                                           | reste aphrody (IA)                                     |

### Shell et terminal

| Source aphrody                         | Cible Bun                              | Statut                                                          |
| -------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| crates/shell/nu (`aphrody shell eval`) | Bun Shell (`Bun.$`)                    | reste aphrody : outil `nu_eval` du kernel MCP (couche IA/infra) |
| crates/shell/aphrody-term              | src/vt (grille et parseur déjà portés) | reste aphrody : pty et computer_use servent agent-tools (IA)    |
| crates/shell/term-caps                 | —                                      | supprimé (sans consommateur), aphrody `4b50cb3e2d`              |
| crates/shell/terminal-backend          | —                                      | reste aphrody : dépend d’aphrody-a2a-coord (IA)                 |
| crates/shell/tauri                     | bun-os/packages/bun-tauri              | à faire (lot 5)                                                 |

### OS et plateforme

| Source aphrody                                     | Cible Bun                                            | Statut                                                                                |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| crates/os/kernel, crates/os/ostd                   | —                                                    | reste aphrody : kernel MCP, bus A2A et ses bibliothèques (couche IA/infra)            |
| packages/os/kernel-client (@aphrody/os)            | —                                                    | reste aphrody : client du kernel MCP                                                  |
| packages/os/winclean                               | bun-os/packages/bun-windows-winclean                 | fait ; supprimer côté aphrody                                                         |
| packages/os/drive-client, crates/ui/drive          | packages/bun-google (Drive)                          | en cours (autre agent)                                                                |
| crates/native/native (aphrody-native)              | src/host/native (`bun_host::native::NativePlatform`) | fait (lot 1)                                                                          |
| packages/interop/native (@aphrody/bun)             | —                                                    | reste aphrody : pont bun:ffi vers aphrody-ffi (CLI IA en processus)                   |
| crates/native/gpu-backend                          | packages/bun-video (WebGPU)                          | à faire (lot 7)                                                                       |
| crates/interop/ffi                                 | —                                                    | reste aphrody : cdylib de la CLI aphrody (IA, inférence, RAG)                         |
| crates/pkg/{core,store,net,cli}                    | src/pkg/{core,store,net,cli} (`bun_pkg_*`)           | fait (lot 8)                                                                          |
| crates/pkg/ffi                                     | —                                                    | supprimé (C ABI sans consommateur)                                                    |
| crates/compat/toolchains                           | scripts/build (toolchains)                           | à faire (lot 8)                                                                       |
| crates/compat/egui-winit                           | —                                                    | supprimé (sans consommateur), aphrody `4b50cb3e2d`                                    |
| crates/compat/rfb-encodings, crates/native/simdutf | —                                                    | reste aphrody : `[patch.crates-io]` de rustvncserver (remote-desktop, infra) et de V8 |

### UI et rendu

| Source aphrody                                      | Cible Bun                                                     | Statut                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| crates/tauri/aphrody-tauri, -runtime, -runtime-cef  | bun-os/packages/bun-tauri/crates/*                            | fait (divergence à réconcilier, lot 5)                         |
| crates/tauri/aphrody-tauri-plugin-* (15)            | bun-os/packages/bun-tauri/crates/plugins                      | à faire (lot 5)                                                |
| crates/tauri/aphrody-tauri-api                      | bun-os/packages/bun-tauri/js                                  | à faire (lot 5)                                                |
| crates/ui/tauri-wrap, tauri-plugin-mcp-bridge       | bun-os/packages/bun-tauri                                     | à faire (lot 5)                                                |
| crates/ui/taffy                                     | src/browser/crates/layout (`bun_browser_layout`, lib `taffy`) | supprimé (doublon sans consommateur), aphrody `4b50cb3e2d`     |
| crates/ui/render, softraster, svg                   | src/browser/crates/render                                     | reste aphrody : consommés par yolo-runtime et aphrody-ffi (IA) |
| crates/ui/m3-reproduce, app, identity, sprite-sheet | packages/aphrody-migrated/m3, packages/bun-m3                 | à faire (lot 7)                                                |
| crates/ui/bun                                       | packages/bun-runtime-sdk                                      | supprimer (doublon)                                            |

### CLI généraliste et outils

| Source aphrody                                     | Cible Bun                                                               | Statut                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| crates/infra/aphrody, aphrody-command(-pure/-wasm) | dispatch `bun …` (src/runtime/cli) pour les sous-commandes non IA/infra | à faire (lot 9)                                          |
| packages/infra/cli-wasm                            | —                                                                       | supprimer avec aphrody-command-wasm                      |
| packages/infra/paths, workspace                    | src/paths, src/workspace                                                | à faire (lot 9)                                          |
| packages/infra/sql, crates/infra/sql               | Bun.sql / bun:sqlite                                                    | supprimer (doublon)                                      |
| packages/os/a2a, crates/contracts/a2a              | —                                                                       | reste aphrody (IA)                                       |
| crates/infra/vpn, wireguard                        | src/bun_vpn                                                             | reste aphrody (infra) ; moteur VPN déjà dans src/bun_vpn |

## Lots (ordre de dépendance et de valeur)

0. Plan (ce fichier).
1. Natif : `aphrody-native` → `bun_host::native` (fait) ; `aphrody-ffi` et `@aphrody/bun` restent des ponts IA d’aphrody.
2. `bun git` : crate `bun_git` (gix) + sous-commande ; tests test/cli.
3. Terminal : term-caps et terminal-backend dans src/vt.
4. Site/shell web dans packages/web (après l'autre agent).
5. Tauri : réconcilier bun-os/packages/bun-tauri avec aphrody, plugins et API JS.
6. OS : kernel/ostd vers bun:linux ; moteurs système (proc, guard, capture, fsindex) et RE dans aphrody-labs/bun-distribution.
7. Rendu : taffy/render/softraster/svg vers src/browser, m3 vers packages/bun-m3, gpu-backend vers bun-video.
8. Paquets système : aphrody-pkg vers src/install, toolchains vers scripts/build.
9. CLI : sous-commandes générales vers `bun …`, suppression des doublons côté aphrody.

Chaque lot : un commit Bun, puis suppression des sources absorbées dans aphrody.
Les builds natifs se font sur le VPS (`/home/ubuntu/src/bun`, verrou
`/home/ubuntu/build/locks/heavy.lock`, artefacts dans `/home/ubuntu/build`).
