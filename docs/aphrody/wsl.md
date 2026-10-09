# Aphrody Alpine sous WSL2 (lot A4)

Distro WSL Aphrody Alpine 3.24, kernel WSL du fork, WSLg et GPU.

## Distro `.wsl`

Construction : image runtime (Alpine 3.24 + Bun musl du fork), puis `wsl.Dockerfile`, export `docker export`, filtre tar puis gzip.

```sh
bun scripts/aphrody/alpine/wsl.ts --base ghcr.io/aphrody-labs/alpine:3.24-runtime \
  --out C:/forks/wsl/out/aphrody-alpine-x86_64.wsl --install AphrodyAlpine --location C:\forks\wsl\distro\AphrodyAlpine
```

- `--no-gui` : sans `wsl/packages-gui.txt`. Cette liste contient Mesa, Wayland, Chromium pour `Bun.WebView` et les sondes.
- `--install` exécute `wsl --install --from-file … --no-launch`, puis les gates `bun --version` et `bunsh -c 'exit 0'`.
- La CI est dans `.github/workflows/aphrody-alpine-wsl.yml`. Elle produit un artefact et ne publie rien.
- Configuration de la distro :
  - `/etc/wsl.conf` : pas de systemd, `boot.command` = `wsl-boot.sh` (sysctl.d, local.d, `/etc/machine-id`), `ldconfig=false` (musl : `/etc/ld-musl-<arch>.path` contient `/usr/lib/wsl/lib`), pas de `PATH` Windows.
  - `/etc/wsl-distribution.conf` : l'OOBE crée l'uid 1000 avec le shell bunsh.

## WSLg

`/etc/profile.d/aphrody-wslg.sh` règle Wayland en premier (`GDK_BACKEND`, `QT_QPA_PLATFORM`, `ELECTRON_OZONE_PLATFORM_HINT`) et `WEBKIT_DISABLE_DMABUF_RENDERER=1`. `WGPU_BACKEND` vaut `gl`, ou `vulkan` avec dozen. Testé dans WSLg (WSL 3.0.1, WSLg 1.0.79), rendu llvmpipe :

| Cas | Commande | Résultat |
| --- | --- | --- |
| GTK 4 | `bun test/js/bun/ffi/gtk-window.fixture.ts --title café --timeout 50` | `window created: "café" 680x440`, exit 0 |
| COSMIC | `BUN_COSMIC_WINDOW_LIB=<libbun_cosmic_window.so musl> bun test/js/bun/ffi/cosmic-window.fixture.ts --timeout 50` | `window created`, exit 0 |
| wgpu 30.0.1 + winit 0.30.13 | `aphrody-wgpu-probe --frames 600` (`wsl/examples/wgpu-probe`) | 600 images à 57,6 i/s, backend GL |
| WebOS | `startWebOS()` (bun-webos) + `chromium-browser --app=… --ozone-platform=wayland` | bureau affiché |

GPU :

- `/dev/dxg` et DXCore fonctionnent sous musl + gcompat. `DXCoreCreateAdapterFactory` renvoie `hr=0`.
- La recette `aphrody/mesa` (aports `3.24-stable`, 26.1.6-r100) ajoute le pilote Gallium d3d12 et dozen (`mesa-vulkan-dzn`).
- Le premier device d3d12 avorte encore : `libd3d12.so` (glibc) lève `std::system_error` sous musl. d3d12 et dozen restent donc en opt-in (`APHRODY_D3D12=1`), et `mesa-vulkan-dzn` n'est pas installé par défaut.

## Kernel

- Fork `aphrody-labs/WSL2-Linux-Kernel`, branche `aphrody-wsl-6.18` : `rolling-lts/wsl/6.18.54.1` + les 17 commits de `aphrody-labs/linux` `aphrody-bun` (patchs Alpine lts, `CONFIG_BUN_ACCEL`, `/dev/bun_accel`).
- `arch/x86/configs/aphrody_wsl_defconfig` = `Microsoft/config-wsl` + fragments `linux-aphrody` + `Microsoft/aphrody-wsl.config`. Options activées : RUST, BUN_ACCEL, DXGKRNL, virtiofs, zram, zswap, MGLRU, DAMON, BPF/BTF, io_uring.
- Build : clang/LLD 22 dans `alpine:3.24`, `make LLVM=1`. Artefacts : `bzImage`, `modules.tar.zst`.
- Démarre sous QEMU/KVM jusqu'au montage de la racine.

## `.wslconfig` recommandé (`%UserProfile%\.wslconfig`)

```ini
[wsl2]
kernel=C:\\forks\\wsl\\out\\kernel\\bzImage
kernelModules=C:\\forks\\wsl\\out\\kernel\\modules.vhdx
memory=12GB
processors=8
networkingMode=mirrored
dnsTunneling=true
autoProxy=true
gpuSupport=true
guiApplications=true
[experimental]
autoMemoryReclaim=dropCache
```

- `kernel=` s'applique à toutes les distros, y compris `docker-desktop`. Un `wsl --shutdown` est donc nécessaire, et il arrête Docker Desktop.
- Sur ce poste, ce fichier n'est pas appliqué tant que les conteneurs tournent.
- `sparseVhd` est actuellement désactivé par WSL 3.0.1.
- `kernelModules` attend un VHDX de modules, qui n'est pas encore produit (`modules.tar.zst` seulement).
