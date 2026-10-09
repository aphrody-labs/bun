# M-os : OS d'aphrody vers le fork (agent OS, 2026-10-09)

Règle (LAYERS.md) : toute capacité système va dans le fork ; aphrody ne garde que le produit. Origine citée par dépôt@sha dans chaque commit.

## Lots livrés

| Lot | Source | Destination | Commit fork | Qualification |
|---|---|---|---|---|
| apps-web lot 1 (bureau WebOS) | aphrody@fcb731e964 apps/web (59 fichiers) | packages/bun-webos (hors e2e/, desktop/ de G2, examples/m3-native-app de codex-winuim3) | 499dbd0b9f1 | `bun test ./test` 28 pass ; `bun run build` ; tsgo/oxlint propres (Windows 11) |
| os-kernel, moteurs système | aphrody@5b36d40c6c crates/os/{ostd/proc,ostd/guard,kernel/libs/capture,kernel/libs/fsindex} | packages/bun-os (bun-proc, bun-guard, bun-capture, bun-fsindex ; workspace Cargo séparé) | 48b8fef810d | `cargo test --workspace` 59 ok + 3 doctests ; `cargo clippy --workspace --all-targets -D warnings` ok (Windows) ; `cargo check` linux-gnu (proc, guard, capture) et linux-musl (proc, guard) ok |

## Tri du lot os-kernel (1 464 fichiers offerts)

| Chemin aphrody | Décision | Raison |
|---|---|---|
| ostd/proc, ostd/guard, kernel/libs/capture, kernel/libs/fsindex | fork, packages/bun-os | moteurs système génériques |
| kernel/comps/re | fork, packages/bun-re (G3, e4d57537cf3) | déjà absorbé |
| kernel/comps/winclean | aphrody (outil produit, LAYERS) ; ses liaisons Win32 → `bun:windows` (W, M-winclean-bun-windows.md) | |
| kernel/core (MCP, bus, skills), kernel/client, ostd/subsystem | aphrody | contrat MCP produit ; host_service_windows.rs, hvsock.rs, systemd/ sont candidats `bun:windows`/`bun:linux` ⏳ (W, G4) ; coreutils/compat → bunsh (MS, G1) |
| comps/a2a-*, comps/jobs, comps/diagnostics, ostd/secrets | aphrody | produit (agents, file de travaux, doctor, configuration) |
| ostd/backend | aphrody | miroir d'assets M3, reconnaissance DNS, cookies Chromium : produit |
| comps/drive (Spacedrive) | aphrody | application ; l'explorateur visé est cosmic-files + WebOS (CW, OS) |
| comps/cron, task-runner, telemetry, a2a-grpc | supprimés par G1 (a4a30c9c60) | sans consommateur, Bun.cron |

## Limites Bun relevées (lots cœur)

- Routes HTMLBundle sans en-têtes propres : pas de COOP/COEP, donc pas de crossOriginIsolated pour bun_wasm threads dans la page. ⏳
- Bun.build cible browser ne suit pas `new Worker(new URL("./w.ts", import.meta.url))` ; contournement : `/dist/workers/:name` (build.ts ou Bun.build à la volée). ⏳
- bunsh absent de la release 1.4.3-aphrody.2 : le terminal WebOS retombe sur pwsh / $SHELL. Résolu par une release incluant b4c195bb7b8.

## À suivre

- WebOS comme shell Winlogon dans le shell COSMIC Win32 (CW) ; chaque app via `bun:windows` réel (W).
- Moteur REPL bun_wasm : dist/wasm/bun/bun_wasm.wasm non construit ici, non vérifié.
