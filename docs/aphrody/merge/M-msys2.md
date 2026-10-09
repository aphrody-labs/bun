# M-msys2 — remplacer MSYS2 par Aphrody Alpine + le fork Bun

Agent MS, 2026-10-09. Demande : « fork tout MSYS2 et ses dépendances et extrais ce qui est vraiment nécessaire pour que
Aphrody Alpine et le fork Bun combinés remplacent tout MSYS2 et fassent encore mieux ».
« Mieux » veut dire : pas d'émulation POSIX (`msys-2.0.dll`), que des binaires Windows natifs, un seul gestionnaire de
paquets (apk), et un installeur, un lanceur et une action CI écrits en Bun.

Frontière avec MX (C:/tmp/board.md) :
- MX fait l'inventaire fichier par fichier de `C:\msys64` (`msys2-inventory.json`, `M-msys2-mirror.md`, recettes aports
  Linux manquantes).
- MS fait les forks, les remplaçants et cette matrice. Ici, on part de l'usage réel ; l'inventaire fichier par fichier est dans `M-msys2-mirror.md` et `msys2-inventory.json` (`bun scripts/aphrody/msys2-mirror.ts verify`).

État au moment de la rédaction : `C:\msys64` et Git Bash restent installés (d'autres agents en dépendent). La bascule
est une décision finale. Aucune ligne ci-dessous ne les désinstalle.

## 1. Forks (org aphrody-labs, compte aphrody-dev, 2026-10-09)

Clones partiels (`--filter=blob:none`) dans `C:\forks\msys2\<nom>`, HEAD au clonage entre parenthèses.

| Origine | Fork |
| --- | --- |
| msys2/MINGW-packages (a70671f32), MSYS2-packages (baea8f4c), msys2-runtime (3ea87a506), msys2-pacman (612777d1) | même nom |
| msys2/msys2-installer, msys2-launcher, setup-msys2, msys2-docker, MSYS2-keyring, msys2-devtools, pacdb, pactoys | même nom |
| msys2/msys2-autobuild, msys2-autobuild-controller, msys2-web, msys2-main-server, msys2-tests, msys2-texlive, MINGW-packages-dev, aas-sign-build, package-grokker | même nom |
| cygwin/cygwin (miroir GitHub de sourceware, 06add56f7) | `cygwin` |
| mingw-w64/mingw-w64 (2bcf06ab) | `mingw-w64` |
| git-for-windows/git (cc4dbf752a), build-extra, msys2-runtime | `git-for-windows-git`, `gfw-build-extra`, `gfw-msys2-runtime` |
| mstorsjo/llvm-mingw (247e65c) | `llvm-mingw` |
| uutils/coreutils, findutils, diffutils | `uutils-coreutils`, `uutils-findutils`, `uutils-diffutils` |

Dépôts non forkés :
- `git-for-windows/MSYS2-packages` : c'est un fork de msys2/MSYS2-packages, et GitHub refuse deux forks du même réseau
  dans une même org. Le fork `MSYS2-packages` en tient lieu ; ajouter la branche gfw en remote si besoin.
- pacman : il n'a aucun miroir GitHub (`archlinux/pacman` → 404, la source est sur gitlab.archlinux.org) ;
  `msys2-pacman` porte son historique.
- Écartés car sans code utile : `.github`, `finances`, `twitter-export`, `sourceforge-export`, `msys2-archive`,
  `MSYS2-packages-dev` (2021), `adbwinapi`.

## 2. Ce que la machine a vraiment (mesuré le 2026-10-09)

- `C:\msys64` (winget `MSYS2.MSYS2` du 2026-10-09 05:14, `InstallationLog.txt`) : 191 paquets (`pacman -Q`), 90 côté
  msys et 101 côté `mingw-w64-ucrt-x86_64-*`.
  - Paquets explicites (`pacman -Qe`) : `base`, `filesystem`, `msys2-runtime`, et 5 paquets ucrt64 de l'agent UI : `gcc` 16.2,
    `gtk4` 4.24.1, `pkgconf`, `qt6-base` et `qt6-declarative` 6.11.2.
  - Taille : `ucrt64` 2011 Mo, `usr` 297 Mo, `var` 329 Mo.
- Git for Windows 2.55.0.windows.5 (357 Mo) :
  - `usr\bin` : 367 fichiers, dont `bash` 5.3 x86_64-pc-cygwin et `msys-2.0.dll`.
  - `mingw64\bin` : 157 fichiers, dont `git.exe` natif et `zlib1.dll` 1.3.2.
  - C'est le Bash de l'outil Bash des agents.
- Déjà natif dans Windows : `C:\Windows\System32\tar.exe` (bsdtar 3.8.4, libarchive + zlib/xz/bz2/zstd) et `curl.exe`.

## 3. Usage réel (rg sur C:\bun, C:\aphrody, C:\aports + graphes)

Les graphes ne remontent aucun nœud MSYS2 : `aphrody graph --source graph:aphrody query "msys2 mingw cygwin"` ne renvoie
rien, `graph:bun` ne renvoie que du bruit (PipeWriter). `query "perl create_hash_table"` donne `requirePerl()`
(`scripts/build/configure.ts`). Les consommateurs viennent donc tous de rg :

| Consommateur (preuve) | Ce qu'il prend à MSYS2 / Git Bash |
| --- | --- |
| Build Bun Windows : `scripts/build/configure.ts` `requirePerl()`, `src/codegen/create-hash-table.ts` → `perl create_hash_table` ; `scripts/aphrody/tmux.ts:148` ajoutait `Git\usr\bin` au PATH pour perl | `perl` de Git (msys) |
| Image CI Windows `scripts/build/ci-images/spec.ts:326-331,1369-1371` | scoop `git` (son `usr\bin` dans le PATH : sh, tar, perl), `cygwin`, `mingw` (x64) ; `mingw` sert de `cc`/`gcc` à `test/harness.ts:2324` et `test/napi/napi-value-ffi.test.ts:111` |
| `docs/project/building-windows.mdx:72` | `scoop install make cygwin python` pour un WebKit local (optionnel) |
| `src/runtime/cli/install.sh:7,73-76` | détection `MINGW64*` (installeur lancé depuis Git Bash) : à garder pour les utilisateurs |
| Fixtures fenêtres de l'agent UI, non suivies (`test/js/bun/ffi/gtk-window.fixture.ts:10-62`, `qt-window-shim.ts:7-48`) | DLL GTK4 et `g++` + `pkg-config` + qt6-base de `C:\msys64\ucrt64\bin` (surchargeables par `BUN_GTK4_DIR` / `BUN_QT_BIN_DIR`) |
| `C:\aphrody\tools\config\host\toolchain.json:161,196-206` + `scripts\tools\toolchain-sync.ps1:41-64` | winget `MSYS2.MSYS2` pour `rsync` (shim `~/.local/bin/rsync.cmd`, ssh msys) et `pigz` 2.8 compilé par ucrt64 gcc `-static` |
| `C:\aphrody\packages\infra\workspace\src\canonical-tar.ts:40-43` | `zlib1.dll` de `Git\mingw64\bin` (zlib de référence, pas zlib-ng, pour des tar.gz canoniques) |
| `C:\aphrody\docs\reference\workspace\TOOLS.md:29,40` | `git` et `ssh` de Git for Windows |
| Agents (outil Bash de Claude Code) et scripts `.sh` lancés sous Windows | bash + coreutils/sed/grep/awk/find/tar… de Git Bash. Inventaire par binaire : `scripts/aphrody/win/shell/inventory.json` (sous-agent MS-a) |
| `C:\aphrody\docs\reference\web\web\BUILD-WINDOWS.md:3,44,73` | rien : interdit déjà MSYS2 et Cygwin |

## 4. Matrice composant MSYS2 → remplaçant

| Composant MSYS2 / Git Bash | Usage réel (§3) | Remplaçant | Lot | Statut |
| --- | --- | --- | --- | --- |
| `perl` (msys) | LUT codegen du build Bun | `src/codegen/create-hash-table.ts` porté en TS : sortie identique octet pour octet au perl de JSC sur les 12 sources LUT et les 25 tables, sous win32, linux et darwin (`C:/tmp/ms/lutdiff.ts`) ; `test/internal/create-hash-table.test.ts` | MS1 | ✅ b1f11fc9637 |
| `mingw-w64-ucrt-x86_64-{gcc,binutils,crt,headers,winpthreads}` | pigz d'aphrody, `cc` des tests, g++ du shim Qt | llvm-mingw 20261006 ucrt (clang 23.1.3, fork `aphrody-labs/llvm-mingw`) dans `C:\tools\llvm-mingw` (`gcc`, `g++`, `windres`, `dlltool` en alias) ; clang-cl/MSVC pour Bun | MS2 | ✅ 91276e15c03 : `bun scripts/aphrody/win/toolchain/prove.ts` → 5/5, aucun import msys/cygwin/gcc |
| pigz construit avec gcc ucrt64 | `toolchain.json` windowsTools.sourceBuilds | pigz 2.8 statique par llvm-mingw (aller-retour `-11`/`-d`, relu par `Bun.gunzipSync`) | MS2 | ✅ preuve ; ⏳ bascule de `toolchain-sync.ps1` (réservé par `windows-native-context`) |
| `zlib1.dll` de `Git\mingw64` | `canonical-tar.ts` | zlib 1.3.2 (madler) en `zlib1.dll` par llvm-mingw : même sortie `compress2 -9` que le zlib de Git | MS2 | ✅ preuve ; ⏳ livrer la DLL (paquet apk Windows `zlib`, MS4) et l'ajouter au chemin de recherche de canonical-tar.ts |
| `rsync` (msys) | `toolchain.json`, shim rsync.cmd | rclone 1.75.1 natif (remotes vps/dbfr déjà configurés) ; delta rsync en Rust dans `C:\aphrody\crates\infra\ssh\src\rsync.rs` (`aphrody infra ssh`) | MS2 | ✅ preuve (`rsync-rclone`) ; ⏳ bascule toolchain-sync |
| Rust `windows-gnu` | — | `x86_64-pc-windows-gnullvm` + llvm-mingw + `crt-static` : uutils diffutils construit et testé | MS2 | ✅ |
| `msys2-runtime` (`msys-2.0.dll`, fork Cygwin) | tout `usr\bin` de Git Bash et de `C:\msys64` | aucun : les remplaçants sont des PE natifs (`api-ms-win-crt-*`, `kernel32`) | — | objectif |
| bash, dash, coreutils, sed, grep, gawk, findutils, diffutils, which, less, file, time | agents et scripts `.sh` | Bun Shell (`Bun.$`), `bunsh` (`src/runtime/cli/bunsh.rs`, b4c195bb7b8), uutils coreutils/findutils/diffutils natifs, rg/fd/sd | MS3 | ✅ ad86cf5a84e : `scripts/aphrody/win/shell/prove.ts` → 59/82 cas prouvés (head…xargs, sed/awk/find/diff/cmp, sha256sum, grep→rg), aucun des 102 exe vérifiés n'importe msys-2.0.dll ; builtins `test`, `[`, `:` et `basename` à suffixe ajoutés au fork. Manquent à Bun Shell : `for`, `while`, `case`, fonctions, `{ }`, here-doc, `${V:-x}`, `$((…))`, `set -e`, `read`, `command -v`, `!`, `source` (MS10) |
| tar, gzip, bsdtar, xz, zstd, bzip2 | scripts, archives | `tar.exe` de Windows (bsdtar 3.8.4) ; `Bun.Archive`, `Bun.gzipSync`, `Bun.zstdCompressSync` | MS3 | ✅ ad86cf5a84e (`tar.exe` lit aussi les zip) ; `Bun.gunzipSync` décode désormais les gzip multi-membres comme node:zlib (4319ce598b2) |
| curl, wget | scripts | `curl.exe` de Windows, `fetch` Bun, `xh` | MS3 | natif (rien à faire) |
| nano, vim, mintty | édition et terminal interactifs | `hx` (Helix, déjà là), Windows Terminal | MS4 | ⏳ |
| `pacman`, `pacman-contrib`, `pacman-mirrors`, `MSYS2-keyring`, gnupg | gestion de paquets | apk : client Bun `scripts/aphrody/win/apk/apk.ts` (APKINDEX v2 signé, résolution, extraction, base installée, scripts bun/bunsh), arch apk `windows-x86_64` ; apk-tools natif : pas de port (15 à 20 jours, `C:\apk-tools\PLAN.md` e2e497fe915) | MS4/MS5 | ✅ 61b00191448 ; ⏳ publier la release `aphrody-3.24-windows-x86_64` |
| `msys2-installer` (Qt IFW) | installation | `scripts/aphrody/win/install.ts`, compilé par `bun build --compile` (clé du dépôt embarquée, PATH utilisateur par bun:ffi) | MS4 | ✅ 475b16db106 |
| `msys2-launcher` (mintty + MSYSTEM) | lanceurs ucrt64/clang64 | profil Windows Terminal → `bunsh` (`install.ts --terminal-profile`) | MS4 | ✅ 475b16db106 |
| `setup-msys2` (action CI) | aucun workflow ne l'utilise (rg `.github`) | `.github/actions/setup-aphrody-win` | MS4 | ✅ 475b16db106 (simulée en local) |
| `mingw-w64-ucrt-x86_64-gtk4` et ~60 dépendances (glib2, cairo, pango, harfbuzz…) | fixtures GTK de l'agent UI | recette `aphrody/llvm-mingw` (toolchain croisée sur clang23/lld23 d'Alpine) puis `aphrody/mingw-w64-gtk4` (GTK 4.24.1 et ses dépendances en sous-projets meson, `CARCH=windows-x86_64`), installée par le client apk et pointée par `BUN_GTK4_DIR` | MS6 | en cours (build VPS `~/ms`) |
| `qt6-base`, `qt6-declarative`, `pkgconf` | shim Qt et KDE de l'agent UI | idem, Qt6 refait avec llvm-mingw (libc++ : on ne mélange pas avec le libstdc++ de MSYS2), `BUN_QT_BIN_DIR` | MS7 | ⏳ |
| `mingw-w64-ucrt-x86_64-python`, tcl/tk | tirés par les dépendances | uv (Python 3.13 natif, déjà là) | — | non utilisé |
| scoop `mingw` et `cygwin` de l'image CI Windows | `cc` des tests napi/ffi ; scripts des tests | clang de LLVM (déjà dans l'image) pour `cc` ; bunsh et uutils pour les scripts | MS8 | ⏳ demande une reconstruction de l'image CI |
| `make cygwin python` pour le WebKit local | optionnel | WebKit précompilé (`aphrody-labs/WebKit`, `scripts/aphrody/webkit-prebuilt.ts`) | — | déjà le chemin par défaut |
| Git for Windows (`git.exe` mingw64 natif ; hooks et `git-sh-setup` via `sh.exe`) | git partout | `git.exe` reste (natif, sans msys-2.0) ; lecture par gix (`aphrody git inspect`) ; hooks sous bunsh, à évaluer (MinGit sans `usr\bin` + `core.hooksPath`) | MS9 | ⏳ |
| Outil Bash des agents (Claude Code exige un `bash.exe` de type Git Bash) | toutes les sessions agents | l'outil PowerShell existe déjà ; bunsh n'est pas compatible bash (fonctions, `[[ ]]`, here-docs…, voir le rapport MS-a) ; WSL Alpine pour le POSIX pur | MS9 | ⏳ décision finale, Git Bash conservé |
| msys2-autobuild(+controller), msys2-devtools, msys2-web, pacdb, pactoys, msys2-main-server, msys2-docker, msys2-tests, aas-sign-build | infrastructure de dépôt | aports + abuild + `C:\aports\aphrody\scripts\publish.ts` + CI (`aphrody-linux-build.yml`) ; dépôt apk « mingw » à ajouter au publish (MS6) | — | existant, extension en MS6 |
| msys2-texlive, MINGW-packages-dev | — | non utilisés | — | forkés seulement |

## 5. Lots

| Lot | Contenu | Chemins | Statut |
| --- | --- | --- | --- |
| MS0 | 30 forks + clones partiels | GitHub aphrody-labs, `C:\forks\msys2` | ✅ |
| MS1 | perl retiré du build Bun | `src/codegen/create-hash-table.ts`, `scripts/build/{codegen,configure,config}.ts`, `scripts/aphrody/tmux.ts`, docs Windows | ✅ b1f11fc9637 |
| MS2 | toolchain llvm-mingw, pigz, zlib1, rclone, Rust gnullvm | `scripts/aphrody/win/toolchain/{prove.ts,report.json}` | ✅ 91276e15c03 ; ⏳ `toolchain.json` + `toolchain-sync.ps1` (réservés) |
| MS3 | shell et coreutils : inventaire, preuve Bun Shell/uutils, manques de Bun Shell | `scripts/aphrody/win/shell/**`, `test/internal/aphrody-win-shell.test.ts`, `src/runtime/shell/**` | ✅ ad86cf5a84e |
| MS4 | client apk Windows en Bun, `install.ts`, action `setup-aphrody-win`, profil Windows Terminal | `scripts/aphrody/win/apk/**`, `scripts/aphrody/win/install.ts`, `.github/actions/setup-aphrody-win/**` | ✅ 61b00191448, 475b16db106 |
| MS5 | apk-tools natif Windows (faisabilité) | `C:\apk-tools\PLAN.md` | ✅ e2e497fe915 : pas de port, à rouvrir avec le format v3 |
| MS6 | toolchain `llvm-mingw` en paquet Alpine, puis GTK4 Windows (`mingw-w64-gtk4`) en cross (abuild, VPS) | `C:\aports\aphrody\{llvm-mingw,mingw-w64-*}` | en cours |
| MS7 | Qt6 qtbase/declarative en cross llvm-mingw | idem | ⏳ après MS6 |
| MS8 | image CI Windows sans scoop `mingw`/`cygwin` | `scripts/build/ci-images/spec.ts` | ⏳ reconstruction d'image |
| MS9 | Git Bash des agents, hooks git | — | ⏳ décision finale |
| MS10 | uutils 0.13.0 (fork aphrody-labs/uutils-coreutils@ca3e965d, MIT) vendorisé : crate `bun_coreutils` (66 applets, 13 de plus sous Unix, aucun doublon des builtins de Bun Shell), `bun` lancé sous un nom d'applet (argv0), repli de Bun Shell quand la commande manque au PATH ; patch uucore `lazy-startup` (aucun constructeur `.init_array`) | `src/coreutils/**`, `scripts/build/deps/uutils.ts`, `patches/uutils/**`, `src/runtime/{Cargo.toml,cli/mod.rs,shell/states/Cmd.rs,shell/subproc.rs}`, `test/js/bun/shell/commands/coreutils.test.ts` | ✅ (voir commit) ; feature cargo `coreutils` de `bun_runtime`, **désactivée par défaut** : le multi-call release pèse 10,35 Mo (mesure Windows x64), décision de l'activer pour l'OS Bun à prendre par main |
| MS11 | bunsh à la place de cmd.exe/pwsh : builtins de compatibilité cmd (dir, copy, del, set, where, start), délégation .bat/.cmd/.ps1, ComSpec optionnel avec retour arrière | `src/runtime/shell/builtin/**`, docs | ⏳ (le langage POSIX passe à codex-shellposix) |

## 6. Passe finale (main)

- `bun bd` puis `bun bd test test/internal/create-hash-table.test.ts` : la passe régénère les 12 `.lut.h` sans perl.
  Pour le vérifier, retirer `Git\usr\bin` du PATH de la passe.
- `bun scripts/aphrody/win/toolchain/prove.ts` → `5/5 étapes prouvées`.
- MS3 : `bun bd test test/js/bun/shell/commands/test.test.ts test/js/bun/shell/commands/true.test.ts test/js/bun/shell/commands/basename.test.ts` ; copier le bun-debug sous `bunsh.exe` puis `bun scripts/aphrody/win/shell/prove.ts --bunsh <bunsh.exe>`.
- MS4 : `bun test test/internal/aphrody-win-apk.test.ts` ; `bun build --compile scripts/aphrody/win/install.ts --outfile aphrody-win-setup.exe` puis `aphrody-win-setup.exe --root %TEMP%\aw --no-path --terminal-profile --bun <bunsh.exe>`.
- gzip multi-membres : `bun bd test test/js/bun/util/zstd.test.ts -t concatenated`.
- MS10 : `cargo test -p bun_coreutils` ; avec la feature (`--cargo-features`/profil à câbler par main), `bun bd test test/js/bun/shell/commands/coreutils.test.ts` (ignoré sans la feature : le test sonde `nproc` par argv0) ; démarrage : `hyperfine 'bun -v'` avant/après, aucun coût attendu (pas de constructeur, test argv0 seulement hors `bun`/`bunx`/`node`).
