# M-alpine — ce qui, dans aphrody, relève d'Aphrody Alpine

Agent M-alpine, 2026-10-09. Lecture seule. États lus :

| Dépôt | Commit | Note |
| --- | --- | --- |
| `C:\aphrody` | `4d343ff71e` | C2 a commité la cible `cli` pendant la lecture ; `766186e779` (C1, cible `desktop`) |
| `C:\bun` | `0f9b7bda85f` | `PLAN-ALPINE-BUN.md` sans section C1 ni C2 à ce commit (`rg '### C'` → 0) |
| `C:\aports` | `071286df8e3` (`3.24-stable`) | travail C2 non suivi : `aphrody-rust-base`, `uutils-findutils`, `uutils-diffutils`, `ntpd-rs`, `zlib-rs`, `scripts/abuild-rust.conf` |
| `C:\linux` | `47f637c54` (`aphrody-bun`) | 3 commits V sur linux-lts 6.18.55 |

- Graphe `graph:aphrody` reconstruit à `27cfae4196` (Rust, TS, MD). Requêtes faites :
  - `query "initramfs aphrody-init bunsh qemu"` : `aphrody-init/src/main.rs` et `vm/rootfs/sbin/init.ts` sont isolés, sans arête entrante hors de `vm/`.
  - `explain SystemdSubsystem` : `crates/os/kernel/core/src/systemd/subsystem.rs:17`, degré 14.
  - Recoupé avec `rg` ci-dessous.
- LOC : lignes des fichiers suivis (`git ls-files`, script `C:/tmp/M/loc.ts`). « Dernier commit » : `git log -1 --format='%h %ad' -- <chemin>`.
- C1 et C2 : propriété déduite de deux sources, faute de section dans le plan. Côté aports : `PLAN.md` de `C:\aports` (paquets marqués C1) et l'en-tête d'`aphrody-rust-base/APKBUILD` (« PLAN-ALPINE-BUN.md section C2 »). Côté aphrody : les commits `766186e779` et `4d343ff71e`.

## Réponse de cadrage : `crates/os` (kernel, ostd) ne vise aucun noyau

- **Aucun code noyau.** `rg no_std crates/os` (hors `comps/drive`) → 0 fichier. Tous les crates sont `std`/tokio/libc/rustix (dépendances relevées dans les `Cargo.toml` de `kernel/core`, `comps/sandbox`, `ostd/proc`, `ostd/guard`).
  - `aphrody-kernel` est un démon MCP en espace utilisateur (`kernel/core/src/lib.rs:1-20` : « agentic fabric router », JSON-RPC sur socket Unix ou tube nommé).
  - `ostd/*` est un jeu de bibliothèques partagées : proc, guard, secrets, subsystem, backend.
  - La doctrine l'écrit noir sur blanc : « Aphrody OS ne s'exécutera JAMAIS depuis un firmware BIOS ou UEFI » (`docs/architecture/os/research/RUST-OS-ARCHITECTURE-AND-BAREMETAL-ANALYSIS.md:13-17`).
- **Rien n'est réutilisable pour `linux-aphrody` ni pour `drivers/misc/bun_accel.rs`.** Le Rust noyau n'a ni `std` ni tokio. `bun_accel` repose déjà sur `kernel::miscdevice` (`C:\linux\drivers\misc\bun_accel.rs:25,253`).
- **Les extraits `no_std` de la doctrine** (`IrqSafeMutex`, §3) ne vivent dans aucun crate. Le §5 cite six crates inexistants : `aphrody-coreutils`, `aphrody-libaphrody`, `aphrody-systemd`, `aphrody-compat`, `aphrody-browser`, `aphrody-shell` (`rg '^name = "<n>"' -g Cargo.toml crates` → 0 pour chacun).
- **Seul code noyau d'aphrody : `patches/linux/0001-misc-add-aphrody_runtime-Rust-driver.patch`.**
  - Pilote misc `/dev/aphrody-runtime`, 185 lignes Rust, visant Linux 7.2.
  - Absent de `C:\linux` (`rg aphrody_runtime C:\linux\drivers C:\linux\rust` → 0).
  - Son seul lecteur est `vm/rootfs/sbin/init.ts` : à supprimer (table 1, lot A1).

## 1. Images, VM et initramfs (`tools/config/container/**`, `patches/linux`, workflows)

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `container/aphrody-os/Dockerfile`, stages `bun` + `runtime` (l. 18-50) | ~35/142 | `4d343ff71e` 2026-10-09 | `.github/workflows/container.yml:85-89` (matrice « Alpine minimal runtime ») ; stage `cli` = `FROM runtime` | Non. `rg 'AS runtime\|3.24-runtime' C:\bun\scripts\aphrody C:\bun\.github\workflows` → 0. `aphrody-alpine.Dockerfile` est une image de build (`aphrody-bun-build-deps`, LLVM 23). Le paquet `bun` signé existe (`C:\aports\aphrody\bun\APKBUILD:37`, `/usr/bin/bun`) | image : `scripts/aphrody/alpine/runtime.Dockerfile` → `ghcr.io/aphrody-labs/alpine:3.24-runtime` (minirootfs épinglé + `apk add bun`) | un seul binaire bun, signé par apk, au lieu du `curl \| bash install.sh` ; stage `bun` supprimé côté aphrody | chemin `/usr/local/bin/bun` → `/usr/bin/bun`, uid 1000 `agent`. Gate : `docker buildx build --platform linux/amd64,linux/arm64`, `docker run … bun --version`, matrice `container.yml` | **nouveau** côté bun (lot A2). La bascule du `FROM` dans aphrody revient à **C2** (le stage `cli` en hérite) |
| `container/aphrody-os/Dockerfile`, stage `cli` | ~45 | `4d343ff71e` 2026-10-09 | `container.yml:91-94` | En cours chez C2 : `C:\aports\aphrody\aphrody-rust-base\APKBUILD` (non suivi), consommé par `apk add … aphrody-rust-base` | aports `aphrody/aphrody-rust-base` + image | liste unique des paquets | voir C2 | **C2** |
| `container/aphrody-os/rootfs/**` (`pam.d/sudo{,-i}`, `sudoers.d/agent`, `skel/.config/nushell/config.nu`, `usr/local/bin/aphrody-selftest`) | 92 (5 f.) | `4d343ff71e` 2026-10-09 | `COPY rootfs/ /` du stage `cli` | **Doublon** : `sudoers.d/agent` (`agent` NOPASSWD) fait la même chose que `aphrody-sudoers` (`C:\aports\aphrody\sudo-rs\aphrody.sudoers:2`, `%aphrody ALL=(ALL:ALL) NOPASSWD: ALL`). **Divergence** : shell de root = `/usr/bin/nu` (`Dockerfile`, cli l. 31) contre `/bin/bunsh` dans Aphrody Alpine (`aphrody-alpine.Dockerfile`, `sed … /bin/bunsh`) | aports (`aphrody-sudoers` : `agent` dans le groupe `aphrody`) ; le reste suit C2 | −1 fichier sudoers, une seule règle NOPASSWD | `visudo -c` ; `sudo -n true` en `agent` ; `aphrody-selftest` | **C2** (signalé, pas de lot concurrent) |
| `container/aphrody-os/Dockerfile`, stage `desktop` ; `desktop/usr/local/bin/aphrody-desktop` ; `desktop-test/**` ; `scripts/build/container/desktop-qualify.sh` | ~30 + 65 + 28 + 70 | `766186e779`, `7b4d5f0cda`, `7b4d5f0cda`, `7b4d5f0cda` | `container.yml:96-99` ; `scripts/release/install-host-bridge.ps1` ; `scripts/tools/os/scripts/wslg-manager.sh` | Oui pour les paquets : `aphrody-desktop-cosmic` (`C:\aports` `071286df8e3`) | aports + image | — | — | **C1** |
| `scripts/build/ui/scripts/package-cosmic-sysext.sh` | 0 (supprimé) | `766186e779` 2026-10-09 | — | déjà supprimé (474 lignes) | — | fait | — | **C1** (fait) |
| `container/aphrody-os/vm/` : `build-initramfs.sh`, `aphrody-init/` (crate Rust PID 1, hors workspace), `rootfs/sbin/init.ts`, `rootfs/usr/bin/bunsh` (bunsh en JS sur `Bun.$`), `run-qemu.sh` | 398 (8 f.) | `ecaa5605e4` 2026-10-09 | aucun hors `vm/` : `rg build-initramfs` → 0 ; `rg aphrody-init` → `vm/**` et `docs/reference/workspace/STATE.md` ; graphe : nœuds isolés | **Oui, en mieux** : `C:\bun\scripts\aphrody\initramfs.ts` (256 l., `14ade19f275`) lit lui-même l'ELF (`PT_INTERP`, `DT_NEEDED`) ; `initramfs-init.ts` (59 l.) monte via `bun:linux`, récolte les orphelins et éteint la machine ; `bunsh` natif dans `src/runtime/cli/bunsh.rs` (522 l.) et paquet `bun-shell`. **Manque** côté bun : dépendances ELF des binaires supplémentaires (`--file` copie sans résoudre), nom d'hôte, aucun test | bun : `scripts/aphrody/initramfs.ts` (`--bin <elf>` avec résolution `DT_NEEDED`), `initramfs-init.ts` (`hostname` dans `bun-init.json` via `/proc/sys/kernel/hostname`), test `test/internal/aphrody-initramfs.test.ts` ; puis **supprimer** `vm/` dans aphrody | −398 l. et un crate ; un seul PID 1 Bun ; musl au lieu de glibc (`libc.so.6`, `x86_64-linux-gnu` dans `build-initramfs.sh`) | perte du mode `aphrody.shell` (remplacé par `argv: ["/bin/bunsh","-i"]`). Gate : `bun test test/internal/aphrody-initramfs.test.ts` ; amorçage qemu de la passe finale V | **nouveau** (lot A1) |
| `container/aphrody-os/vm/aphrody.config` (tinyconfig + virtio + `RUST` + `APHRODY_RUNTIME` + `SAMPLES_RUST`) | 52 | `7b4d5f0cda` 2026-10-07 | `build-initramfs.sh` (commentaire) | Partiel : `linux-aphrody` part de la config lts complète (`C:\aports\aphrody\linux-aphrody\config-aphrody.fragment`, `bun.config`) ; aucune saveur microVM | **supprimer** ; à défaut, demander à U3 un fragment `microvm.config` | −52 l. | aucun consommateur | **nouveau** (lot A1, suppression seule) |
| `patches/linux/0001-misc-add-aphrody_runtime-Rust-driver.patch` | 225 | `6234bc6dfb` 2026-10-07 | `vm/rootfs/sbin/init.ts` (écrit `/dev/aphrody-runtime`), `vm/aphrody.config` | Absent de `C:\linux` (rg → 0) ; `bun_accel` occupe déjà le créneau misc device Rust | **supprimer** (aucun lecteur ; vise Linux 7.2, la branche est en 6.18) | −225 l. | aucun | **nouveau** (lot A1) |
| `container/aphrody-os/Dockerfile.wsl-builder` (Ubuntu 24.04 + debootstrap) | 11 | `d8965bd942` 2026-10-07 | aucun (`rg Dockerfile.wsl-builder` → 0 hors lui-même) | — | **supprimer** (lot A4) | −11 l. | aucun | **nouveau** |
| `container/Dockerfile` (Ubuntu 24.04 : runtime/dev/release-builder/wasm), `compose*.yaml`, `entrypoint.sh` | 224 + 117 + 79 | `5cebb70f3b` 2026-10-09 | `container.yml:61-82`, `compose.yaml:10-89` | Le paquet aports `aphrody` existe (`_commit=b70bfdf`, musl, `rust-stable`) mais n'est pas qualifié comme runtime produit | **reste aphrody** (binaires glibc des hôtes Ubuntu 26.04, `inventory/targets.json:29,55`) | — | — | — |
| `container/build/Dockerfile` (« single VPS build image », Ubuntu 26.04, LLVM 22, cargo-xwin, sccache, mold, bun, uv) | 127 (2 f.) | `fa0964cb5a` 2026-10-09 | `scripts/build/container/aphrody-build.ts`, `tools/config/production-topology.json` | **Recoupement** : `C:\bun\scripts\aphrody\linux.Dockerfile` (« for the fork and Aphrody », Ubuntu 26.04, LLVM 23 + 22, bun) ; jamais publié (`rg ghcr.io/aphrody-labs/` → seulement `alpine`, `aphrody`) | image : publier `build-linux:26.04` côté bun, puis `FROM` dans aphrody (lot A8, optionnel) | dédup LLVM/Rust/bun (~60 l.) | cargo-xwin exige clang-cl ≥ 19 (l. 28) ; gate `aphrody-build.ts image` + build `-p aphrody` | **nouveau** (optionnel) |
| `container/desktop/**` (Ubuntu 24.04, CEF/GTK4) | 125 (2 f.) | `ecaa5605e4` 2026-10-09 | `container.yml:101-109` | — | **reste aphrody** (CEF prébuilt glibc, non vérifié sur musl) | — | — | — |
| `container/shenron-gateway/**`, `container/shenron-state/**` | 90 + 21 | `7b4d5f0cda` 2026-10-07 | compose Shenron | — | **reste aphrody** (services produit) | — | — | — |
| `.github/workflows/container.yml` | 160 | `a1e96d1b46` 2026-10-08 | CI | `C:\bun\.github\workflows\aphrody-alpine-image.yml` publie déjà `ghcr.io/aphrody-labs/alpine` et le rootfs | **reste aphrody** ; les 3 lignes Alpine (l. 85-99) deviennent de simples `FROM` après A2/C1/C2 | matrice Alpine plus courte (pas de bun via curl) | gate : run `workflow_dispatch` | C1/C2 + A2 |
| `.github/workflows/update.yml`, `inline-interpreters.yml` | 33 + 33 | `ecaa5605e4` 2026-10-09 | CI | — | **reste aphrody** (pas OS ; `rg 'wsl\|aphrody-os\|alpine\|kernel' .github/workflows` ne sort que `container.yml`) | — | — | — |

## 2. WSL et noyau WSL (`scripts/build/os/**`, `tools/config/os/**`, `scripts/tools/os/**`)

Contexte : la WSL Ubuntu a été désinstallée le 2026-10-09 (mémoire `reference-agent-method-tmux`). La règle globale dit « WSL is retained until Windows validation completes ».

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `scripts/build/os/build-wsl-distro.sh` + `test-wsl-distro.sh` + section distro de `tools/config/os/wsl-build.json` (debootstrap Ubuntu `resolute`, distro `AphrodyOS`) | 187 + 100 + ~30/73 | `d8965bd942` 2026-10-07 | `crates/infra/aphrody-command/src/wsl/recipes.rs:102` (`Target::Distro` → `sudo build-wsl-distro.sh`), `wsl/runner.rs`, `wsl/cli.rs`, `multicall.rs:45` (`aphrody-wsl`) | Le rootfs existe : `aphrody-alpine-image.yml` publie `aphrody-alpine-rootfs-<arch>.tar.gz` (l. 5, 71-84). Aucun paquet `.wsl` ni `wsl.conf` (`rg -il wsl C:\aports\aphrody C:\bun\scripts\aphrody` → seulement `tmux.sh`) | image : `scripts/aphrody/alpine/wsl.ts` (rootfs + `/etc/wsl.conf` + `/etc/wsl-distribution.conf` → `aphrody-alpine-<arch>.wsl`) et workflow distinct `aphrody-alpine-wsl.yml` ; dans aphrody, **supprimer** les deux scripts et `Target::Distro` est remplacé par un import | −~320 l. aphrody ; plus de debootstrap ni de validation Python de la charge utile (`build-wsl-distro.sh:24-40`) | WSLg et GPU sous musl non vérifiés. Gate : `wsl --install --from-file …wsl`, puis `wsl -d AphrodyAlpine -- bun --version` et `bunsh -c 'exit 0'` ; tests `aphrody-command` (module `wsl`) | **nouveau, conditionnel** (lot A4 : seulement si la WSL est gardée) |
| `scripts/build/os/build-wsl-kernel.sh` (arbre Microsoft WSL2, `config-wsl`, `LLVM=1`, `RUST`) | 37 | `8419658432` 2026-10-05 | `wsl/recipes.rs:96` (`Target::Kernel`) | `linux-aphrody` existe, mais `dxgkrnl` manque (`C:\linux\drivers\hv\dxgkrnl` absent) : le GPU WSL serait perdu | **reste aphrody** jusqu'à la validation Windows, puis **supprimer** | — | — | — |
| `scripts/build/os/build-wslg.py` (reconstruction WSLg, Azure Linux) + sources WSL/wslg/terminal de `wsl-build.json` | 87 + ~40 | `b50c62d3e5` 2026-10-05 | `wsl/recipes.rs:98`, `tools/config/upstream-sources.json`, `THIRD-PARTY.md` | — (outillage côté hôte Windows) | **reste aphrody**, puis **supprimer** après la validation Windows | — | — | — |
| `scripts/tools/os/scripts/wslg-manager.{sh,ps1}` (WSLg + COSMIC) | 263 + 111 | `766186e779` 2026-10-09 | `docs/reference/workspace/SCRIPTS-INVENTORY.md` | — | suit le bureau | — | — | **C1** |
| `scripts/build/os/scripts/build-uutils-coreutils.ps1` (uutils 0.12.0 + findutils/grep/sed/diffutils/tar compilés depuis `third_party/`) | 72 | `004540e1bf` 2026-09-29 | `crates/os/kernel/core/src/coreutils.rs` (548 l., table `COMPANIONS`) | Partiel. Alpine 3.24 a `community/uutils` **0.11.0** (`git show HEAD:community/uutils/APKBUILD:4`). C2 empaquette `uutils-findutils` 0.10.0 et `uutils-diffutils` (non suivis). Rien pour grep, sed ni tar | aports (C2) pour les paquets ; aphrody garde le script **pour Windows seulement**, et sous Linux l'adaptateur prend `/usr/bin/*` fournis par apk (lot A6) | plus de compilation uutils sous Linux | versions 0.11 contre 0.12 : à figer. Gate : tests `aphrody-kernel` (`coreutils`) + `aphrody-selftest` | **C2** (paquets), **nouveau** (A6, adaptateur) |
| `scripts/tools/os/mullvad-{netns-setup,switch-relay}.sh` | 49 + 77 | `0bf832dc57` 2026-10-08 | `crates/infra/vpn/src/lib.rs`, `crates/infra/ssh/src/lib.rs` | `main/wireguard-tools` dans aports 3.24 ; `CONFIG_WIREGUARD=m` (`main/linux-lts/lts.x86_64.config:958`) | **reste aphrody** (adresse et clé propres à un hôte, l. 4-8) | — | — | — |
| `scripts/tools/os/scripts/*` (winclean, aphrody-admin.ps1, forensics, `*.nu` de réparation) et `plugins/ghidra-suite` | 1358 - 374 + 486 | `766186e779` / `004540e1bf` | outillage Windows, RE et dépôt | — | **reste aphrody** (pas OS Linux) | — | — | — |

## 3. Hôtes (`tools/config/host/**`)

Les hôtes sont sous Ubuntu 26.04 et systemd (`inventory/targets.json:29,55`). Aphrody Alpine utilise OpenRC. Rien ne bascule tant qu'aucun hôte n'est passé sous Alpine.

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `host/aphrody-os/VPS-TUNING.md` §1 (`/etc/sysctl.d/99-aphrody-vps.conf`, ~40 clés) | 244 | `7b4d5f0cda` 2026-10-07 | `docs/products/infra/vps/README.md`, `docs/operations/infra/INFRA-UNIFICATION.md` | **Majoritairement** : `aphrody-sysctl` 1.1 (`C:\aports\aphrody\aphrody-sysctl\90-aphrody-bun.conf`) a déjà `default_qdisc=fq`, `bbr`, `tcp_fastopen=3`, `rmem/wmem_max=16M`, `tcp_tw_reuse`, `mtu_probing`, `max_map_count`, `overcommit_memory=1`. Valeurs qui diffèrent : `somaxconn` 8192 / 65535, `swappiness` 150 / 10, `inotify.max_user_watches` 1048576 / 524288. Absents : `tcp_max_syn_backlog`, `bpf_jit_harden=2` | aports : sous-paquet `aphrody-sysctl-server` (`/etc/sysctl.d/91-aphrody-server.conf`, seulement les écarts serveur ; le format `sysctl.d` vaut aussi sous Ubuntu) ; la doc aphrody devient un renvoi | une seule source sysctl pour Bun et les serveurs | ordre `90-`/`91-`. Gate : `abuild -r` (alpine:3.24) ; `sysctl -e -p` en conteneur ; `bun aphrody/kernel/check-config.ts --sysctl` (VM) | **nouveau** (lot A3, à coordonner avec U3, propriétaire d'`aphrody-sysctl`) |
| `host/systemd/rg/rg-zram-swap.service` (zram 16G zstd) | 34 | `7b4d5f0cda` 2026-10-07 | unités rg du VPS | Partiel : `zram` dans `aphrody.modules-load.conf:7` ; `CONFIG_ZRAM=m` + zstd (`config-aphrody.fragment:114-118`) ; `community/zram-init` dans 3.24 | **reste aphrody** (systemd, propre à l'hôte) | — | — | — |
| `host/systemd/**` (86 f., dont `shared/sandbox-*.conf`), `host/user/**`, `host/nginx/**`, `host/legacy-rg/**`, `host/ssh/**`, `host/sudoers/omar`, `host/wireguard/aphrody-tunnel.json`, `host/privoxy/**`, `host/logrotate/**`, `host/tmux/**`, `host/inventory/**`, `host/*.json`, `host-policy.toml` | ~9 000 | `d0fc5ac2cc` 2026-10-09 (systemd) | `crates/infra/infra` (deploy, nginx, catalog), `packages/engine/yolo/test/host.test.ts`, `scripts/tools/toolchain-sync.*`, `scripts/build/rust/vps-cargo.ts` | — | **reste aphrody** (déploiement produit sur hôtes Ubuntu) | — | — | — |

## 4. `crates/os`, `crates/shell`, `crates/infra` (partie système), `packages/os`

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crates/os/kernel/comps/sandbox` (`aphrody-sandbox` : Landlock/seccomp Linux, Low-IL Windows, seatbelt) | 1165 (11 f.) | `7b4d5f0cda` 2026-10-07 | **aucun** : `rg 'aphrody-sandbox\|aphrody_sandbox' -g Cargo.toml -g '*.rs'` → seulement sa déclaration (`Cargo.toml:301`) et deux commentaires de `shell/aphrody-shell-sandbox-host` | Côté Linux, `bun:linux` couvre landlock et seccomp (`src/runtime/linux/landlock.rs`, `seccomp.rs`). Le crate lui-même se déclare « Landlock/seccomp not enforced » (`capability.rs:106-110`) | **supprimer** dans aphrody | −1165 l. | aucun consommateur. Gate : `cargo check --workspace` (`scripts/build/rust/cargo-serial.sh`) | **nouveau** (lot A5) |
| `crates/os/kernel/core/src/systemd/**` (« pure Rust implementation of systemd init… journald ») | 1366 (6 f.) | `7b4d5f0cda` 2026-10-07 | `kernel/core/src/cli.rs:113`, `crates/ui/app/src/lib.rs:93` (`SystemdSubsystem`), `crates/infra/infra/src/secrets/mod.rs:113-224` (`parse_env_file`) | Recoupement : OpenRC est l'init d'Aphrody Alpine ; PID 1 Bun = `initramfs-init.ts` | **reste aphrody** (sous-système MCP du produit) ; recoupement seulement signalé | — | — | — |
| `crates/os/kernel/core` (hors systemd et coreutils), `kernel/client`, `ostd/{proc,guard,secrets,subsystem,backend}`, `kernel/libs/{capture,fsindex}` | ~20 000 | `d027032d8b` 2026-10-09 (core) | `aphrody-proc` : `aphrody-command`, `ai/train`, `ai/llama-server`, `a2a-coord`, `winclean` ; `aphrody-guard` : `ai/agent-tools`, `infra/aphrody` ; `aphrody-kernel` : `aphrody-command`, `diagnostics`, `ai/mcp`, `ui/drive`, `ui/app` | userspace, aucun équivalent apk | **reste aphrody** | — | — | — |
| `crates/os/kernel/comps/{a2a-*,cron,jobs,re,telemetry,task-runner,diagnostics,winclean}`, `comps/drive` (espace de travail Spacedrive exclu, 488 303 l.) | ~66 000 + 488 303 | `c3dd3d3fd6` / `292badfb21` 2026-10-09 | produit (IA, A2A, RE, Windows) | — | **reste aphrody** (pas OS). Signalés sans dépendant Cargo : `aphrody-telemetry`, `aphrody-task-runner`, `aphrody-a2a-grpc` (rg → leurs propres fichiers seulement) | — | — | hors périmètre |
| `crates/infra/aphrody-command/src/wsl/**` (`aphrody wsl` : kernel, mainline, wslg, wsl, distro) | 1059 (4 f.) | `3c70e77d37` 2026-10-09 | `aphrody-command/src/lib.rs:84`, `multicall.rs:45` | voir table 2 | **réduire** : `Target::Distro` → import du `.wsl` Aphrody Alpine (A4) ; le reste suit la décision WSL | ~−100 l. | Gate : tests `aphrody-command` (`wsl`) | **nouveau** (A4) |
| `crates/shell/{aphrody-term,terminal-backend,terminal-core,tauri,nu,session}` | 1391 + 2437 + 258 + 580 + 366 + 405 | `efdb7cd643` 2026-10-09 | `aphrody-term` : `ai/agent-tools`, `aphrody-command` ; `terminal-backend` : `aphrody-command`, `shell/tauri`, `sandbox-host` ; `nu` : `kernel/core` | `Bun.Terminal` (PTY, `src/runtime/api/bun/Terminal.rs`) existe mais tous les consommateurs sont en Rust ; `community/nushell` dans 3.24 | **reste aphrody** | — | — | — |
| `crates/shell/{vfs,web,aphrody-shell-sandbox-host}` | 794 + 2064 + 1317 | `5bde43dade` / `b75ef5abc1` / `efdb7cd643` | `crates/web/webos-wasm` (vfs, web) ; sandbox-host : aucun dépendant (`Cargo.toml:122` seulement) | — | relève de X (WebOS) | — | — | **X** |
| `crates/infra/{ssh,vpn,wireguard,remote-desktop}` | 4081 + 447 + 1553 + 3197 | `92464108be` / `5bde43dade` / `ae46d052f3` / `ae46d052f3` | `infra/infra`, `aphrody-command`, `ai/mcp`, `ai/agent-tools` | Système déjà fourni par Alpine : `main/wireguard-tools`, `community/wireguard-go`, `CONFIG_WIREGUARD=m` (lts:958), `CONFIG_HYPERV_VSOCKETS=m` (lts:536) | **reste aphrody** (opérateur produit) | — | — | — |
| `packages/os/{a2a,drive-client,kernel-client (@aphrody/os),winclean}` | 6700 + 12288 + 710 + 7686 | `7b4d5f0cda` / `c62cf98a05` / `f7c4900727` / `c3dd3d3fd6` | `@aphrody/a2a` : `packages/infra/workspace/src/agent-home-drive-reconcile.ts` ; `@aphrody/drive-client` : `m3/packages/app-ui/src/**` ; `@aphrody/os` : `packages/infra/workspace/src/{workspace-subsystem,agent-sync,agent-live}.ts` ; `@aphrody/winclean` : aucun import TS | — | **reste aphrody** (clients produit, rien d'OS Linux) | — | — | — |
| `m3/packages/m3-bun/src/targets/linux-image.ts` (initramfs avec init en C statique) — hors liste, troisième initramfs | 215 | `eb071e6696` 2026-10-05 | `m3-bun/src/targets/index.ts`, `compile.ts`, tests `targets`, `system`, `cli` | `scripts/aphrody/initramfs.ts` + `initramfs-init.ts` (bun) | à terme, délègue à `initramfs.ts` (lot A7, optionnel, propriétaire m3) | −~150 l. d'init C | réseau (`m3.ip=` ; `initramfs-init.ts` ne configure pas le réseau). Gate : tests m3-bun | **nouveau** (optionnel) |

## 5. Documentation (`docs/architecture/os/**`)

| source aphrody | LOC | dernier commit | consommateurs | déjà côté cible ? (preuve) | cible proposée | gain | risque + gate | chantier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/architecture/os/{ARCHITECTURE,ARCHITECTURE-GAPS,ARCHITECTURE-GAPS-STATUS}.md` | 478 | `6567868770` 2026-10-09 | `docs/README.md`, index de la doc | — | **reste aphrody** (architecture du produit) | — | — | — |
| `docs/architecture/os/research/RUST-OS-ARCHITECTURE-AND-BAREMETAL-ANALYSIS.md` | 251 | `92d3de5ab9` 2026-10-04 | index de la doc | §5 cite six crates inexistants (preuve en tête de page) ; §3 donne du code `no_std` absent du dépôt | **réduire** : §5 corrigé (crates réels), §3 retiré ou marqué recherche ; renvoi vers U3/V pour le noyau | moins de doc fausse | Gate : `aphrody-ops docs-links --root . --scope repository` | **nouveau** (lot A5) |

## Totaux par cible (37 lignes, cible principale de chaque ligne)

| cible | items |
| --- | --- |
| image (bun `scripts/aphrody/alpine/*`, ghcr) | 3 : runtime (A2), distro `.wsl` (A4), build-linux publié (A8) |
| script bun (`scripts/aphrody/initramfs*.ts`) | 2 : `vm/` (A1), initramfs de m3 (A7) |
| aports `aphrody/*` | 1 : `aphrody-sysctl-server` (A3) |
| supprimer (aphrody) | 4 : `vm/aphrody.config`, `patches/linux/0001`, `Dockerfile.wsl-builder`, `aphrody-sandbox`. S'y ajoutent `vm/` après A1 et les scripts distro après A4 |
| réduire (aphrody) | 2 : `aphrody-command/src/wsl` (A4), doc de recherche (A5) |
| reste aphrody | 18 |
| C1 / C2 / X (propriétaires, sans lot concurrent) | 3 / 3 / 1 |

## Lots de migration (disjoints en fichiers, dans l'ordre)

Aucun lot ne touche `tools/config/container/aphrody-os/Dockerfile`, `rootfs/`, `desktop*/`, `wslg-manager.*`, `aphrody-rust-base` ni `uutils-*` : ce sont les fichiers de C1 et C2.

1. **A1 — PID 1 Bun unique** (bun puis aphrody).
   - Bun : `scripts/aphrody/initramfs.ts` (option `--bin <elf>` qui résout `PT_INTERP` et `DT_NEEDED` dans `--sysroot`) ; `scripts/aphrody/initramfs-init.ts` (`hostname` dans `bun-init.json`, écrit dans `/proc/sys/kernel/hostname`) ; nouveau test `test/internal/aphrody-initramfs.test.ts` (archive newc relue, dépendances résolues sur une fixture ELF).
   - Gates :
     - `bun test test/internal/aphrody-initramfs.test.ts` (script, pas de code natif) ;
     - passe finale V : `bun scripts/aphrody/initramfs.ts --bun build/release/bun --sysroot <rootfs alpine> --bin /usr/bin/coreutils --out build/initramfs.cpio.gz`, puis `qemu-system-x86_64 … -append console=ttyS0`.
   - Allègement aphrody : supprimer `tools/config/container/aphrody-os/vm/**` (398 l., crate `aphrody-init`) et `patches/linux/0001-misc-add-aphrody_runtime-Rust-driver.patch` (225 l.) ; retirer la mention de `docs/reference/workspace/STATE.md`.
   - Statut : ✅ `067e1af57ab` (côté bun : `--bin`, `hostname`, test 5/5 ; initramfs construit dans `alpine:3.24` et amorcé sous qemu avec `rdinit=/bin/sh`). ✅ réseau `f1292cd1e55` : `initramfs-net.ts` (lien et adresse par rtnetlink, client DHCP RFC 2131, route par défaut, `/etc/resolv.conf`, `/etc/hosts`), options `--ip dhcp|<cidr>`, `--gateway`, `--dns`, `--interface`, `--module` (modules `.ko`, `.ko.gz` ou `.ko.zst` chargés par `/init`) ; test 8/8 ; bail DHCP obtenu sous qemu (Alpine linux-virt 6.18, virtio-net en module, slirp : 10.0.2.15/24 via 10.0.2.2, DNS 10.0.2.3, HTTP 200). ✅ preuve réduite du 2026-10-09 : QEMU a exécuté Alpine 3.24.2, puis Bun 1.4.3 comme PID 1 ; `bun -e` a démarré un service HTTP qui répond 200 depuis l'hôte. Cette passe n'emploie pas le générateur ni `/init` de production : la release ne fournit pas `bun:linux`, donc l'initramfs Bun de `initramfs-init.ts` reste bloqué. Suppression de `vm/` et du patch `aphrody_runtime` : ✅ aphrody `8a06065c9b` (G1, 10 fichiers, −615 l.).
2. **A2 — image runtime minimale** (bun).
   - Nouveau `scripts/aphrody/alpine/runtime.Dockerfile` : minirootfs 3.24.2 aux sha256 épinglés, comme `aphrody-alpine.Dockerfile` ; dépôt du fork ; `apk add bun ca-certificates tzdata` ; utilisateur `agent` 1000.
   - Nouveau workflow `.github/workflows/aphrody-alpine-runtime.yml` → `ghcr.io/aphrody-labs/alpine:3.24-runtime` (amd64 + arm64).
   - Gates : `docker buildx build --platform linux/amd64,linux/arm64 -f scripts/aphrody/alpine/runtime.Dockerfile scripts/aphrody/alpine` ; `docker run --rm … bun --version` ; `docker run --rm … bun -e 'console.log(1)'`.
   - Allègement aphrody (fait par **C2**, propriétaire du fichier) : stages `bun` et `runtime` de `aphrody-os/Dockerfile` → `FROM ghcr.io/aphrody-labs/alpine:3.24-runtime AS runtime` (−~30 l.).
   - Statut : ✅ `7e86bccc862`. Aucun paquet `bun` apk publié (la release `aphrody-3.24-x86_64` d'aports ne porte que cosmic) : l'image prend le Bun musl de la release du fork (sha256 épinglés) et `apk add libstdc++ libgcc`. Gate locale amd64 : `bun --version`, `bun -e`, uid 1000, fetch https, app m3 compilée exécutée. ⏳ publication : `workflow_dispatch` de `aphrody-alpine-runtime.yml` avec `push=true` (non déclenché).
3. **A3 — sysctl serveur** (aports, avec l'accord d'U3).
   - Fichiers : `aphrody/aphrody-sysctl/APKBUILD` (sous-paquet `-server`, `pkgrel` +1) et nouveau `aphrody-server.sysctl.conf` (seulement les écarts du VPS : `somaxconn`, `tcp_max_syn_backlog`, `swappiness`, `bpf_jit_harden`, `vfs_cache_pressure`, `dirty_*`).
   - Gates : `abuild checksum && abuild -r` dans `alpine:3.24` ; `sysctl -e -p /etc/sysctl.d/91-aphrody-server.conf` en conteneur ; `bun aphrody/kernel/check-config.ts --sysctl` sur VM.
   - Allègement aphrody : §1 de `tools/config/host/aphrody-os/VPS-TUNING.md` (~100 l.) remplacé par un renvoi au fichier du paquet.
   - Statut : ✅ aports `c9bbb25934f` (`3.24-stable`, `abuild -r` + `sysctl -e -p` en conteneur, code 0) + aphrody `b32e48e339` (renvoi). ⏳ `check-config.ts --sysctl` sur VM ; `docs/reference/workspace/documentation.json` à regénérer (`yolo ops docs generate`).
4. **A4 — distro WSL depuis Aphrody Alpine** (conditionnel : seulement si l'utilisateur garde la WSL).
   - Bun : nouveaux `scripts/aphrody/alpine/wsl.ts` (rootfs `aphrody-alpine-rootfs-<arch>.tar.gz` + `wsl.conf` + `wsl-distribution.conf` → `.wsl`) et `.github/workflows/aphrody-alpine-wsl.yml`.
   - Gates : `wsl --install --from-file aphrody-alpine-x86_64.wsl --name AphrodyAlpine` ; `wsl -d AphrodyAlpine -- bun --version` ; `wsl -d AphrodyAlpine -- bunsh -c 'exit 0'`.
   - Allègement aphrody :
     - supprimer `scripts/build/os/build-wsl-distro.sh`, `test-wsl-distro.sh` et `tools/config/container/aphrody-os/Dockerfile.wsl-builder` (−298 l.) ;
     - retirer la section distro de `tools/config/os/wsl-build.json` ;
     - `crates/infra/aphrody-command/src/wsl/recipes.rs` : `Target::Distro` → import ; tests `aphrody-command` (`wsl`).
   - Kernel, WSLg et WSL : suppression à décider après la validation Windows.
5. **A5 — allègement de `crates/os` et de la doc** (aphrody seul).
   - Supprimer `crates/os/kernel/comps/sandbox` et la ligne `aphrody-sandbox` de `Cargo.toml:301`.
   - Corriger le §5 de `docs/architecture/os/research/RUST-OS-ARCHITECTURE-AND-BAREMETAL-ANALYSIS.md`.
   - Gates : `scripts/build/rust/cargo-serial.sh check --workspace` ; `cargo deny check` ; `aphrody-ops docs-links --root . --scope repository`.
   - Statut (G1, 2026-10-09) : ✅ aphrody `f224c3a04c` : `crates/os/kernel/comps/sandbox` retiré (−1 154 l.), lock 2074 → 2073 ; références corrigées (YOLO-AUTHORITY, ARCHITECTURE-GAPS, sandbox-host, wasm-stack-definitive, shell/README, BEST-AI-STACK, commentaires de `aphrody-shell-sandbox-host`) ; §5 de RUST-OS réécrit avec les emplacements réels, §3 marqué recherche. Gates : `cargo check -p aphrody-shell-sandbox-host` ; `yolo ops docs-links --scope repository` 0 lien cassé ; `cargo deny --locked check` vert après `6f1c53e908` (échecs préexistants : exceptions de licence par crate, `unmaintained = "workspace"`, RUSTSEC-2023-0071 ignoré, sans version corrigée). Gate `W` complète : en cours sur le VPS (chargé, load ≈ 90), non conclue à cette date ; checks et tests ciblés verts ci-dessous.
6. **A6 — adaptateur coreutils sur apk** (aphrody, après publication des `uutils-*` par C2).
   - Fichiers : `crates/os/kernel/core/src/coreutils.rs` (sous Linux : `/usr/bin/{find,xargs,diff,cmp}` d'apk avant `target/aphrody-uutils`) ; `scripts/build/os/scripts/build-uutils-coreutils.ps1` limité à Windows.
   - Gates : tests `aphrody-kernel` (`coreutils`) ; `docker run --rm aphrody/rust-bun aphrody-selftest`.
7. **A7 (optionnel, propriétaire m3)** — `m3/packages/m3-bun/src/targets/linux-image.ts` délègue à `scripts/aphrody/initramfs.ts`.
   - Prérequis : réseau minimal dans `initramfs-init.ts`.
   - Gate : tests `m3/packages/m3-bun` (`targets`, `system`).
   - Statut : ✅ code. Bun `5ff0a620cb3` : `--env K=V` et `--argv0 nom` ; l'exécutable compilé sert de `/bin/bun` pour `/init` (le fork traite un exécutable compilé nommé `bun` comme le moteur) et `/init` le relance sous le nom de l'app. Aphrody `fad1493c9f` : `linux-image.ts` ne génère plus d'init C ; `build-image.sh` vérifie `bun:linux` dans l'exécutable, prend `scripts/aphrody/initramfs*.ts` dans `BUN_SRC` ou sur `aphrody-labs/bun@BUN_REF`, et charge les modules virtio-net du noyau hôte ; `rootfs.tar` disparaît (la cible docker couvre ce cas) ; tests `targets` 24/24 (2 ignorés). ⏳ amorçage qemu avec un bun à `bun:linux` (même attente que A1) ; aucune release publiée n'a encore `bun:linux`.

## Preuve de boot

État constaté le 2026-10-09 sur le VPS partagé. Les images `alpine:3.24` et `aphrody/bun-alpine:latest` étaient déjà en cache ; la seconde contient Alpine 3.24.2 et Bun `1.4.3-aphrody.2`. Le noyau disponible dans `/home/ubuntu/wx/kernel/out/x86_64/bzImage` est `6.18.54.1-microsoft-standard-WSL2`, construit depuis les commits consignés dans `/home/ubuntu/wx/kernel/commits.txt` (dernier : `47f637c546bf4bb274c7149815ed66d748e4f325`). C'est un noyau de la série linux Aphrody, mais sa configuration est WSL2 et ne remplace pas la recette `linux-aphrody` 6.18.55.

Rootfs exporté de l'image Alpine/Bun, initramfs `newc` gzip créé avec `cpio`, puis démarrage headless dans la session `tmux` dédiée `codex-osboot` :

```sh
OSBOOT="$HOME/.aphrody/workspace/codex-fleet-20261009/target-osboot"
docker create --name codex-osboot-rootfs aphrody/bun-alpine:latest
docker export codex-osboot-rootfs -o "$OSBOOT/alpine-3.24.2-rootfs.tar"
docker rm codex-osboot-rootfs
mkdir -p "$OSBOOT/rootfs"
tar --numeric-owner -xf "$OSBOOT/alpine-3.24.2-rootfs.tar" -C "$OSBOOT/rootfs"
sudo rm "$OSBOOT/rootfs/dev/console" "$OSBOOT/rootfs/dev/null"
sudo mknod -m 600 "$OSBOOT/rootfs/dev/console" c 5 1
sudo mknod -m 666 "$OSBOOT/rootfs/dev/null" c 1 3
# /init monte proc/sysfs/devtmpfs, configure eth0 en 10.0.2.15/24 et fait exec bun -e '…'
cd "$OSBOOT/rootfs"
find . -print0 | cpio --create --format=newc --null | gzip -1 > "$OSBOOT/initramfs.cpio.gz"
tmux new-session -d -s codex-osboot \
  'docker run --rm --network host --device /dev/kvm \
    -v "$HOME/.aphrody/workspace/codex-fleet-20261009/target-osboot:/osboot" \
    osi/qemu:latest qemu-system-x86_64 -accel kvm -cpu host -m 2G -nographic -no-reboot \
    -kernel /osboot/bzImage -initrd /osboot/initramfs.cpio.gz \
    -append "console=ttyS0 rdinit=/init" \
    -nic user,model=virtio-net-pci,hostfwd=tcp::18080-:8080'
curl --max-time 4 -i http://127.0.0.1:18080/
```

Extrait de console (`[console complète](proof-osboot-2026-10-09.txt)`) :

```text
[    1.388034] Run /init as init process
OSBOOT: init shell PID=1
OSBOOT: Alpine 3.24.2
    inet 10.0.2.15/24 scope global eth0
default via 10.0.2.2 dev eth0
OSBOOT: Bun PID=1 version=1.4.3
OSBOOT: bun -e executed
OSBOOT: service listening 0.0.0.0:8080
```

Réponse observée depuis l'hôte : `HTTP/1.1 200 OK`, corps `aphrody-bun-ok`. La sortie complète reste aussi dans `/home/ubuntu/.aphrody/workspace/codex-fleet-20261009/target-osboot/qemu-console.log` et la VM reste attachée à `codex-osboot`.

Restes : le dépôt courant n'implémente pas `bun:linux` (aucune entrée de résolution trouvée dans `src/`), donc `scripts/aphrody/initramfs-init.ts` n'a pas été exécuté ; `bunsh` n'a pas été validé. Aucun arbre/noyau `linux-aphrody` prêt ni `apk` `linux-aphrody` n'existait dans `~/yolo/src`, `~/yolo/w` ou `~/yolo/jobs`. Cette preuve valide le démarrage Alpine + Bun PID 1 + réseau QEMU, pas le démarrage par l'initramfs de production ni la configuration noyau finale.
8. **A8 (optionnel)** — image de build Ubuntu partagée.
   - Bun : publier `scripts/aphrody/linux.Dockerfile` (nouveau workflow `aphrody-build-linux-image.yml`).
   - Aphrody : `tools/config/container/build/Dockerfile` repart de cette image et ne garde que cargo-xwin, wasm-bindgen et uv.
   - Gates : `bun scripts/build/container/aphrody-build.ts image` ; build `-p aphrody` dans l'image.
   - Statut (G3, 2026-10-09) : ⏸ non fait, le recouvrement est plus faible que prévu. Les deux images ne partagent que la couche apt d'Ubuntu 26.04 et LLVM 22. Rust diffère : fork `nightly-2026-09-15` dans `/root/.cargo`, rustup inscriptible ; aphrody `1.98.1` dans `/opt/rust`, en lecture seule, avec toutes les cibles de son `rust-toolchain.toml` (Windows MSVC, wasm32). Bun diffère aussi : fork `bun.sh/install` `1.4.2` ; aphrody `install.sh` du fork, version épinglée. L'image aphrody tourne en `USER 65534:1500` avec ses caches `/cache`, alors que l'image du fork tourne en root avec un `PATH` sous `/root`. Un `FROM ghcr.io/aphrody-labs/build-linux:26.04` réinstallerait donc Rust et Bun, ajouterait LLVM 23 (≈ 1 Go) inutile à aphrody et ferait dépendre la construction d'une image encore jamais publiée. À reprendre seulement si les deux dépôts alignent leur canal Rust.
   - Statut (G4) : ✅ côté bun, nouveau `.github/workflows/aphrody-build-linux-image.yml` : `linux.Dockerfile` construit pour amd64 et arm64, avec le `RUST_CHANNEL` de `rust-toolchain.toml` ; smoke test `clang-23`, `clang-22`, `rustc`, `cargo`, `bun`, `cmake` et `bun -e`, passé sur l'image locale `aphrody/build-linux:26.04`. ⏳ publication de `ghcr.io/aphrody-labs/build-linux:26.04` par `workflow_dispatch` avec `push=true` (non déclenché). Côté aphrody, rien n'est changé : le constat ⏸ ci-dessus reste valable.

Points signalés à C2, sans lot concurrent :
- `rootfs/etc/sudoers.d/agent` fait doublon avec `aphrody-sudoers`.
- Le shell de root est `nu` dans l'image cli et `/bin/bunsh` dans `ghcr.io/aphrody-labs/alpine`.
- Versions uutils : 0.12.0 dans aphrody, 0.11.0 dans Alpine 3.24.

Rien n'a été construit ni testé : gains et risques sont des estimations, non mesurées.
