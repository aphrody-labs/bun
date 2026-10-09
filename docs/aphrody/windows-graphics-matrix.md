# Matrice graphique Windows : backend WebGPU unifié

Inventaire lecture seule, 2026-10-09. Aucun build local.

## Sources locales

| Source | Chemin | Backend | Couverture DirectX |
|---|---|---|---|
| Aphrody render | `C:\aphrody\crates\ui\render` (feature `gpu`) | wgpu (`dx12`, `vulkan`, `metal`, `webgpu`, `webgl`) | D3D12 via wgpu |
| Aphrody gpu-backend | `C:\aphrody\crates\native\gpu-backend` | wgpu (`dx12` via `native-backends`) + CUDA | D3D12 via wgpu |
| Aphrody ui/bun | `C:\aphrody\crates\ui\bun` | wgpu (dépendance) | D3D12 via wgpu |
| Aphrody softraster | `C:\aphrody\crates\ui\softraster` | CPU | aucune |
| Rio | absent de `C:\` | non trouvé | non vérifié |
| Bun fork | `C:\bun\packages\bun-windows-{d2d1,d3d11,d3d12,dxgi,dwrite,dcomp}` | FFI générée (Win32 metadata 71.0.30-preview) | D2D1, D3D11, D3D12, DXGI, DWrite, DComp |

## Surface bun:windows existante

- `windows.families.<name>` (`src/js/bun/windows.ts`, ~ligne 983) charge les paquets `@aphrody/bun-windows-*`.
- Aucune API graphique de haut niveau (adaptateurs, device, présentation).

## Non fait dans cette passe

- Inventaire GitHub des projets WebGPU mis à jour dans les 30 derniers jours : non exécuté (outils MCP `github_*` non chargés).
- Vérification de Rio : dépôt absent de `C:\`.

## Lots suivants

1. Détection : `graphics.adapters()` via DXGI (`EnumAdapters1`) dans `bun:windows`.
2. Device D3D11 et D3D12 : création via les paquets existants, tests dans `test/js/bun/windows/windows.test.ts`.
3. D2D sur swap chain D3D11 ; présentation.
4. Build Rust sur le VPS build factory uniquement.
