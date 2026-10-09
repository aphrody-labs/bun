# Plan Alpine + Bun — runtime, distribution, release

Cœur du fork Bun et distribution Aphrody Alpine : runtime, libc, root/noyau, release du binaire, perf, WebKit,
outillage (oxc, n2b), Windows. Propriétaire : main et ses agents.

Règles communes, cible et vérification : [PLAN.md](PLAN.md) (à lire en entier avant de commencer).

## 3. Chantiers

Statut : ✅ fait · 🔄 en cours · ⏳ à faire. Un chantier = un propriétaire ; hors de ton périmètre, coordonne
par `git pull --rebase` et ne réécris pas le travail d'un autre.

### N. Alpine d'abord, Ubuntu 26.04 garanti (🔄)

Décision utilisateur (2026-10-09) : le fork est **pensé d'abord pour la dernière Alpine** (3.24.x, musl) et doit
**aussi compiler sur Ubuntu 26.04** (glibc 2.43, = vps/dbfr). Commit `fd278401fca`.

- ✅ Image `aphrody/build-alpine:3.24` (`alpine.Dockerfile`, remplacée par Aphrody Alpine, section U) : LLVM 23.1.3 depuis edge/main (le
  build n'accepte que `pins.llvm` 23.1.x ; apk 3.24 n'a que 22), nightly `rust-toolchain.toml` (rustup hôte musl),
  cmake 4.2, samurai, mold, go, nasm, perl, python3, nodejs (act), bun 1.4.2. Construite et vérifiée localement.
- ✅ `aphrody/build-linux:26.04` : + LLVM 23 apt.llvm.org (contournement SHA-1 sqv), nightly épinglée, go, nodejs.
- ✅ Runner `tmux.ts` : `--linux` = `--alpine`, `--ubuntu` ; `--sync`/`--sync-head` (volume `aphrody-src-<distro>`),
  `--cpus`/`--memory` (6/6g, plafond 10g), cache `aphrody-build-cache-<distro>` ; test `test/internal/aphrody-tmux.test.ts`.
- ✅ `scripts/build/config.ts` : ASAN forcé off sur musl (compiler-rt sans ASAN musl, pas de prébuilt WebKit
  `-musl-*-asan`) ; sans sysroot, `detectLinuxAbi()` (`/etc/alpine-release`) donne un build natif musl.
- ✅ `alpineRelease` → 3.24 (`ci-images/spec.ts`), conteneurs musl de `build-host.ts` sur `alpine:3.24`.
- ✅ CI `aphrody-linux-build.yml` : alpine-3.24 + ubuntu-26.04 × x64 + arm64 (`ubuntu-24.04-arm`), build natif,
  `scripts/aphrody/linux-smoke.sh` (version, `-e`, `node:path`/`node:fs`, `Bun.serve` port 0, `bun install`
  hors-ligne d'un `file:`), puis which/require/fetch en `bun bd test`. `.actrc` : `-P alpine-3.24`.
- ✅ Release : les assets `-musl` sont l'artefact Linux principal (`aphrody-release.yml` échoue si un `-musl`
  demandé manque) ; `@aphrody/bun-runtime` (`isMusl()`) et `install.sh` choisissent déjà musl sur Alpine, glibc sinon.
- ✅ Audit statique glibc dans `src/**` : `gnu_get_libc_version` (BunProcess.cpp, crash_handler), c-ares, sqlite
  `backtrace_symbols_fd` sont tous gardés `__GNU_LIBRARY__`/`target_env = "gnu"` ; `getauxval` existe dans musl.
- ⏳ Builds natifs debug/release Alpine puis Ubuntu 26.04, via le runner :
  `bun scripts/aphrody/tmux.ts run bd-alpine-N --alpine --sync-head --cpus 8 --memory 10g -- 'bun install && bun run build'`,
  puis `bash scripts/aphrody/linux-smoke.sh build/debug/bun-debug` et `bun bd test` which/require/fetch : suspendus
  par la directive « aucun build » du 2026-10-09, à lancer dans la passe unique de main.

### U. Aphrody Alpine — fork d'Alpine 3.24 + apk-tools (🔄 démarré le 2026-10-09)

- **U1** : paquets, `bunsh`, apk complété par bun, image. **U2** : libc Rust (section suivante). **U3** (section U3) : sudo-rs,
  `elevate.rs`, `bun:linux`, noyau `linux-aphrody`, sysctl (fragment `scripts/aphrody/alpine/u3.Dockerfile.fragment`).
- Builds et tests : passe finale unique (§2 règle 13), conteneurs Docker locaux uniquement.

**Forks** (synchro amont toutes les 6 h, `.github/workflows/aphrody-upstream-sync.yml`, secret `APHRODY_SYNC_TOKEN`) :

- [aphrody-labs/aports](https://github.com/aphrody-labs/aports), branche par défaut `3.24-stable` (C:aports, sparse
  `aphrody/` + `.github/`) ; tout l'ajout est sous `aphrody/`, détail dans son `PLAN.md`. Commit `15e5fcd2686`.
- [aphrody-labs/apk-tools](https://github.com/aphrody-labs/apk-tools), `master` = 3.0.8 (C:apk-tools) : **aucun
  patch** (justifié dans son `PLAN.md`). Commit `6e1261b`.

**Paquets `aphrody/`** : `bun` 1.4.3_p2 (+ `bun-shell` : `/bin/bunsh`, `/etc/shells` ; + `bun-apk`), `n2b` 0.7.1
(release `n2b-v0.7.1` de ce dépôt), `aphrody` (tarball du dépôt privé, `b70bfdf4446`), `aphrody-libc` 0.1.0 (U2 :
`-dev` = `/usr/lib/libaphrody_libc.a` pour `--aphrody-libc=`, `-preload`), `llvm23`/`clang23`/`lld23`/`llvm-runtimes`
23.1.3 (rétroportés d'aports master `6f2f659847f`), `rust-nightly` 2026-09-15 (`/usr/lib/rust-nightly`, =
`rust-toolchain.toml`), `rust-stable` 1.98.1 (3.24 n'a que 1.96, aphrody/n2b veulent ≥ 1.97), méta
`aphrody-bun-build-deps`.

**Dépôt signé** : `aphrody-packages.yml` (`aphrody/scripts/publish.ts`, abuild dans `alpine:3.24`, x86_64 +
aarch64) publie chaque `.apk` + `APKINDEX.tar.gz` signé (secret `APHRODY_ABUILD_KEY`) dans la release
`aphrody-3.24-<arch>` ; paquets déjà publiés sautés (reprise après le plafond de 6 h, LLVM est long). apk 3 lit
une ligne qui finit par `/APKINDEX.tar.gz` comme un dépôt NDX (paquets relatifs à l'index, `${APK_ARCH}` substitué) :
`https://github.com/aphrody-labs/aports/releases/download/aphrody-3.24-${APK_ARCH}/APKINDEX.tar.gz`. Pages écarté
(site ≤ 1 Go, fichier ≤ 100 Mo). Clé publique `aphrody/keys/aphrody-labs.rsa.pub` (copie privée :
`~/.aphrody/keys/`).

**apk complété par bun (option la plus simple)** : aucun patch apk, aucune sous-commande dupliquée. apk 3 lance
scripts, triggers et hooks par `execve()` (shebang respecté) : `#!/usr/bin/bun` et `#!/bin/bunsh` marchent tels
quels. Modules npm empaquetés dans `/usr/lib/bun/node_modules` (à apk) ; le trigger `bun-apk` (script bun) lie
leurs `bin` dans `/usr/lib/bun/bin`. `bun add -g` écrit dans `/usr/local/lib/bun` (exclu de `apk audit` par
`/etc/apk/protected_paths.d/bun-global.list`). Cache partagé `/var/cache/bun/install` (`/etc/profile.d/bun.sh`).

**bunsh** (cœur du fork, `src/runtime/cli/bunsh.rs`) : dispatch argv0 `bunsh`/`-bunsh` ; `-c`, script, stdin (`-s`),
interactif (`-i`, éditeur de ligne et historique de la REPL, `~/.bunsh_history`, Ctrl-C n'arrête pas la session) ;
`exit` termine le script (absorbé par sous-shell, `$(…)` et pipeline comme POSIX), `$?`, `$0`/`$N`, env et
`export` persistants entre lignes (`ShellSession`) ; erreur de syntaxe = 2, script introuvable = 127. Tests :
`describe("bunsh")` de `test/js/bun/shell/exec.test.ts`. Dans l'image, `bunsh` est le login shell de root
(`/etc/passwd`) et figure dans `/etc/shells`.

**Critère de bascule `/bin/sh` → bunsh** : `/bin/sh` reste busybox ash tant que bunsh n'exécute pas les scripts
apk réels. Test de conformité `describe("bunsh runs apk install scripts")` (même fichier, fixtures
`test/js/bun/shell/fixtures/apk-scripts/`, extraits de scripts d'aports, PATH vide, `ROOT` en répertoire temporaire) :
passent `nginx.pre-install`, `chrony.pre-install`, `state-dir.post-install` ; en `test.todo` : `[`/`test`, `for`,
`case`, fonctions, `set -e`/`:`. Bascule quand `bun bd test test/js/bun/shell/exec.test.ts --todo` passe sans todo
restant, chaque builtin ajouté au cœur avec son test, puis 1 semaine d'image avec `/bin/sh` → bunsh sans échec
de `apk add` sur `aphrody-bun-build-deps`.

**Image** `scripts/aphrody/aphrody-alpine.Dockerfile` : minirootfs 3.24.2 (sha256 épinglés) + dépôt du fork + bun,
bunsh, aphrody, n2b, `aphrody-bun-build-deps` (LLVM 23, rust nightly via `BUN_TOOLCHAIN_RUST`), nodejs (act) ;
`OPTIONAL_PACKAGES` (`aphrody-libc-dev`, `aphrody-libc-preload`, paquets U3). Remplace `aphrody/build-alpine:3.24`
(`alpine.Dockerfile` supprimé) dans `tmux.ts`, `.actrc`, `aphrody-linux-build.yml`. `aphrody-alpine-image.yml` publie
`ghcr.io/aphrody-labs/alpine:3.24` (amd64 + arm64) et `aphrody-alpine-rootfs-<arch>.tar.gz` (release `alpine-3.24`).

⏳ Reste (passe finale) : `abuild checksum` d'`aphrody`, `rust-nightly`, `rust-stable` ; release du fork Bun
contenant bunsh puis bump du paquet `bun` (l'image vérifie `bunsh -c 'exit 0'`) ; premier run complet
d'`aphrody-packages.yml` puis d'`aphrody-alpine-image.yml` ; builtins POSIX manquants de bunsh.

### U2. libc Rust en complément de musl — `aphrody-labs/c-ward` (🔄)

**Décision : musl reste la libc et l'ABI ; une surcouche Rust, `aphrody-libc`, remplace les fonctions feuilles où musl
est lent.** Aucune libc Rust n'est aujourd'hui compatible ABI musl ni assez complète pour LLVM, git et busybox.

Preuves (2026-10-09, sources lues dans les dépôts) :

| Candidat                                                        | ABI                                                                                                    | Couverture                                                                                                                                                                             | Perf. des points faibles musl                                                                                                             | Licence                                           | Activité                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| **c-ward** (c-scape `no_std` + c-gull `std`, sur rustix/origin) | \*-linux-**gnu** seulement (README) ; modes `take-charge` et `coexist-with-libc`                       | fs, io, process, pthread (mutex/rwlock/key/once), signal, stdio, printf, strtod, regex, qsort ; stubs `todo/` : dlopen, locale, wchar, fenv, long double, aio, pthread_cancel, catgets | str*/mem* octet par octet (`mem/ntbs.rs`) ; `getaddrinfo` lance `getent` (`c-gull/src/resolve.rs`) ; malloc = dlmalloc ou allocateur Rust | Apache-2.0 WITH LLVM-exception / Apache-2.0 / MIT | v0.22.3 (2026-02-21), dernier commit 2026-06-15                  |
| **relibc** (Redox)                                              | en-têtes cbindgen et dispositions propres (pthread, FILE…) : **pas** l'ABI musl, binaires à recompiler | large (ld.so, pthread, stdio, locale partielle), Linux secondaire via `sc`                                                                                                             | non orienté SIMD                                                                                                                          | MIT                                               | très active (2026-09-27), tags 0.5/0.6                           |
| rusl, mustang, eyra, tinyrlibc, tz-rs                           | —                                                                                                      | rusl abandonné (2018, « DONT USE ») ; mustang/eyra = c-ward pour programmes Rust seulement (eyra figé 2025-04) ; tinyrlibc embarqué ; tz-rs = localtime                                | —                                                                                                                                         | —                                                 | aucune alternative sérieuse 2025-2026 trouvée (recherche GitHub) |

Retenu : **c-ward**, forké (`aphrody-labs/c-ward`, clone `C:\c-ward`, `origin` = fork, `upstream` =
`sunfishcode/c-ward`) : Rust, rustix, licence permissive, conçu pour coexister avec une libc, base d'une bascule
complète plus tard. Son code n'est pas exporté tel quel (il exporterait des centaines de symboles d'ABI glibc et ses
str*/mem* sont plus lents que musl) : la crate `aphrody-libc/` du fork n'exporte que des fonctions sans état, sans
verrou, sans appel à la libc, dont la signature est identique en ABI musl.

- ✅ `aphrody-libc` 0.1.0 (c-ward `5649d96`, `3ff7142`, `d7034d0`, tag `aphrody-libc-v0.1.0`) : `memcmp`, `bcmp`,
  `strlen`, `strnlen`, `strchr`, `strchrnul`, `strrchr`, `strcmp`, `strncmp`, `memchr`, `memrchr` (SSE2 sur x86_64,
  NEON sur aarch64, 16 o par pas, lectures alignées ou bornées à la page : jamais de faute après le terminateur, même
  avec `memchr(p, c, SIZE_MAX)`), `memmem`/`strstr` (crate `memchr`, Two-Way + SIMD), `qsort`/`qsort_r` (introsort
  sans allocation, ninther, heapsort au-delà de 2·log2 n, échanges par mots de 8 o ; musl = smoothsort à échanges
  octet par octet). `#![no_builtins]` : LLVM ne retransforme pas les boucles en appels récursifs. Liste des exports :
  `aphrody-libc/exports.txt`. Tests unitaires différentiels (toutes alignements, page de garde PROT_NONE, comparateur
  incohérent qui reste dans les bornes).
- ✅ Paquet apk `aphrody-libc` (fichier à transmettre à U1 : `C:\c-ward\aphrody\aports\aphrody-libc\` →
  `aphrody-labs/aports` `aphrody/aphrody-libc/`, sha512 épinglés) : `libaphrody_libc.so.0` ;
  `-dev` = `libaphrody_libc.a` **lié partiellement** (`ld -r` + `objcopy --keep-global-symbol` des exports : ni core,
  ni compiler_builtins, ni panic handler visibles, donc aucune collision avec le Rust d'un programme hôte comme Bun) ;
  `-preload` = `/etc/profile.d/aphrody-libc.sh` (`LD_PRELOAD`). Méthodes de link : `.a` avant `-lc` (statique),
  `-laphrody_libc` avant `-lc` (DT_NEEDED en tête), ou `LD_PRELOAD` pour les binaires musl existants. Les appels
  internes de musl (printf, getaddrinfo…) restent liés dans `libc.so` et gardent les versions musl.
- ✅ Conformité : `aphrody/conformance/libc-test.ts` (libc-test de musl trois fois : musl seul, overlay lié
  statiquement via `LDLIBS`, overlay en `LD_PRELOAD` ; échec si l'overlay ajoute un échec que musl n'a pas) ;
  `aphrody/conformance/bun-smoke.ts` (`/proc/self/maps` contient l'overlay, `--version`, `-e` chaînes/tri/JSON/regex/
  Buffer, `bun install` hors ligne d'un `file:`, `Bun.serve` port 0 + fetch). CI manuelle
  `.github/workflows/aphrody-libc.yml` (Alpine 3.24 x86_64 + aarch64).
- ✅ Lien avec Bun (non compilé) : option `--aphrody-libc=<chemin>` / `APHRODY_LIBC` (`scripts/build/config.ts`,
  `scripts/build.ts`), linux-musl seulement, archive placée juste avant `-lc` dans `systemLibs` et entrée implicite du
  link (`scripts/build/bun.ts`), libellé `aphrody-libc` dans le résumé de configuration ; test
  `test/internal/aphrody-libc-config.test.ts`. Gain attendu : `memcmp`/`bcmp` des comparaisons de slices Rust (parseur,
  résolveur, lockfile), `strlen`/`strchr`/`memchr` des dépendances C/C++ (sqlite, libarchive, c-ares, BoringSSL,
  zlib), `qsort`. Désactivé par défaut tant que le banc O (`perf-gate.ts`, musl) ne montre pas de gain. Pas de malloc
  (Bun a déjà mimalloc, JSC libpas) ni de DNS (Bun utilise c-ares sur Linux, `src/dns/lib.rs`).
- ⏳ Passe finale (aucune commande lancée pendant le lot) :
  ```sh
  # Alpine 3.24 (conteneur local, ou workflow aphrody-libc.yml : gh workflow run aphrody-libc.yml -R aphrody-labs/c-ward)
  cd /work/c-ward/aphrody-libc && cargo test --release
  cargo rustc --release --lib -- -C link-arg=-Wl,-soname,libaphrody_libc.so.0
  bun ../aphrody/conformance/libc-test.ts --archive target/release/libaphrody_libc.a --preload target/release/libaphrody_libc.so
  bun ../aphrody/conformance/bun-smoke.ts --bun "$(command -v bun)" --preload target/release/libaphrody_libc.so
  abuild -r   # dans aphrody-labs/aports/aphrody/aphrody-libc, une fois copié par U1
  # Fork Bun
  bun test test/internal/aphrody-libc-config.test.ts
  bun run build:release --aphrody-libc=/usr/lib/libaphrody_libc.a   # Alpine, aphrody-libc-dev installé
  bun ../c-ward/aphrody/conformance/bun-smoke.ts --bun build/release/bun --static
  bun scripts/aphrody/perf-gate.ts --fork build/release/bun --upstream <bun musl sans overlay>
  ```
  Si la compilation échoue, corriger puis publier `aphrody-libc-v0.1.1` (le tag 0.1.0 et la somme du tarball sont figés).

Reste en musl, et critères de bascule :

- Restent musl : ld.so, démarrage, pthread, stdio, malloc (mallocng ; `mimalloc2` d'Alpine en `LD_PRELOAD` pour les
  services qui allouent beaucoup), résolveur DNS (celui de c-gull, via `getent`, est pire), locale/iconv, libm.
- Étape suivante (⏳) : AVX2 à détection CPUID pour les mêmes fonctions ; puis intégrer `aphrody_libc.o` dans
  `libc.so` de musl (APKBUILD musl du fork aports : retirer `src/string/{memcmp,bcmp,strlen,…}.c` et
  `src/stdlib/qsort*.c`) pour que les appels internes de musl en profitent, si libc-test ne régresse pas et si l'image
  tourne deux semaines avec `-preload` sans incident. Candidats suivants : `getaddrinfo` sur `hickory-proto`
  (EDNS, TCP, `rotate`) et `iconv` sur `encoding_rs`, chacun avec le même protocole libc-test + banc.
- Bascule vers une libc Rust complète seulement si : une cible ABI musl existe (dispositions x86_64/aarch64 musl,
  `ld-musl` ou chargeur compatible), libc-test au moins au niveau de musl, dlopen/locale/wchar/iconv/pthread_cancel
  implémentés, suites de busybox, git et LLVM vertes, et banc O sans régression de démarrage ni de RSS.

### U3. Root et noyau (🔄 code écrit le 2026-10-09, ni build ni test)

**Root natif dans Bun** (`src/runtime/elevate.rs`) :

- `Bun.spawn/spawnSync({ elevate: true })` (`js_bun_spawn_bindings.rs`). Déjà root ou élevé : exécution directe.
  - Linux/macOS : `sudo -n VAR=val… /abs/cmd args`, sans `--` (sudo-rs n'accepte `VAR=val` qu'avant `--`, sudo
    seulement après). La commande est résolue dans le `PATH` de l'appelant. La sonde `sudo -n true` est en cache.
  - Windows : `sudo.exe` inbox s'il est activé (clé `HKLM\…\Sudo` `Enabled`), sinon un assistant `bun -e`
    (`ShellExecuteExW "runas"`) qui attend le processus et renvoie son code. `env` est alors refusé.
  - Erreurs : `ERR_ACCESS_DENIED` (pas de sudo, mot de passe requis) ; `elevate` refusé avec `argv0`, `uid` ou `gid`.
  - `bun_sys::windows::is_elevated()` lit TokenElevation.
- Bun Shell : `sudo cmd …` (`states/Cmd.rs`) passe par le même plan ; s'il est déjà root, `sudo` est retiré et les
  builtins s'exécutent. `sudo -u …` et les autres formes lancent le sudo système tel quel.
- **`bunsh --root` (à faire par U1, propriétaire de `bunsh.rs`)** : si `!crate::elevate::is_elevated()`, appeler
  `crate::elevate::plan(PATH, cwd)` puis ré-exécuter `préfixe ++ [self_exe] ++ argv sans --root` et propager le code
  de sortie ; sinon continuer. En cas d'`Err(e)`, `e.message()` sur stderr et exit 1.
- Types (`bun.d.ts`), docs (`child-process.mdx` « Running as root », `shell.mdx`). Tests : `describe("elevate")`
  de `spawn.test.ts` et `describe("sudo")` de `bunshell.test.ts`, en skip sans root ni sudo NOPASSWD.

**`bun:linux`** (paresseux, `src/js/bun/linux.ts` + `src/runtime/linux/*.rs`, un fichier par domaine) :
namespaces, mount/pivot_root, cgroup v2, capabilities/prctl, pidfd, memfd, landlock, sysctl, kmod, power
(reboot/kexec), `ioUring.probe()` (Bun n'utilise pas io_uring sous Linux, pas de doublon). Numéros de syscall par
architecture ; hors Linux : `ERR_BUN_LINUX_UNSUPPORTED`. Types `packages/bun-types/linux.d.ts`, doc
`docs/runtime/linux.mdx`, test `test/js/bun/linux/linux.test.ts`. À vérifier à la compilation : chemins js2native,
`#[bun_jsc::host_fn]` sur des fns `pub(crate)`, let-chains d'`io_uring.rs`, `PathBeneathAttr` packed.

**Paquets** (fork aports, `aphrody/`, commits `c3ffb089c93` et `a74fe8ed9a3` sur `3.24-stable`) :

- `sudo-rs` 0.2.15-r1 : repris de 3.24 community (`8b25d8295f3f`), `provides=sudo`, `replaces="sudo doas"`.
  Sous-paquet `aphrody-sudoers` : groupe `aphrody` et `/etc/sudoers.d/aphrody` (`%aphrody ALL=(ALL:ALL) NOPASSWD: ALL`,
  0440).
- `aphrody-sysctl` 1.1 :
  - `/etc/sysctl.d/90-aphrody-bun.conf` : `vm.max_map_count=1048576`, `vm.overcommit_memory=1`,
    `fs.inotify.max_user_watches=1048576` et `max_user_instances=1024`, `fs.file-max`, `net.core.somaxconn=8192`,
    `tcp_fastopen=3`, `default_qdisc=fq`, `bbr`, `rmem_max`/`wmem_max` à 16 Mio (QUIC), `perf_event_paranoid=1`,
    `io_uring_disabled=0`.
  - `/etc/security/limits.d/90-aphrody-bun.conf` : nofile 1048576 (pam_limits ; services OpenRC : `rc_ulimit`).
  - `/etc/modules-load.d/aphrody.conf`.
- `linux-aphrody` / `linux-aphrody-v3` 6.18.55, d'après linux-lts 3.24 (`52fae6d7d56f`), x86_64 et aarch64 :
  - Build en `LLVM=1` (clang, lld et llvm 22). `make LLVM=1 rustavailable` avant `olddefconfig`.
  - Config : `lts.<arch>.config` + `config-aphrody.fragment` (système et Rust) + `bun.config` (options utiles à Bun et
    JSC, une ligne de commentaire par option), fusionnés par `merge_config.sh`.
  - Contrôle : les options refusées par Kconfig sont signalées (fatales avec `APHRODY_STRICT_CONFIG=1`) ;
    « is not set » est satisfait par un symbole absent.
  - `-v3` : `KCFLAGS=-march=x86-64-v3 KRUSTFLAGS=-Ctarget-cpu=x86-64-v3` (aarch64 : `armv8.2-a`). Même voie
    que `X86_NATIVE_CPU` en amont ; `X86_64_VERSION` n'existe pas en 6.18 (patch hors arbre).
  - Source `_kernel_source=fork` : `aphrody-labs/linux`, branche `aphrody-bun` (chantier V), épinglée par
    `_fork_commit`, suivie d'`abuild checksum`.
- Vérification : `bun aphrody/kernel/check-config.ts [--sysctl] [--json]` (fork aports) lit `/proc/config.gz`
  (`IKCONFIG=y` dans `bun.config`) et compare chaque option des fragments, avec `@arch` ; la dernière valeur l'emporte.
- Dockerfile : lignes pour U1 dans `scripts/aphrody/alpine/u3.Dockerfile.fragment`, qui retire sudo/doas et installe
  `sudo-rs sudo-rs-su aphrody-sudoers aphrody-sysctl` ; l'utilisateur de build entre dans le groupe `aphrody`. Le
  noyau ne va pas dans l'image. U1 doit aussi ajouter `sudo-rs` et `aphrody-sysctl` à `ORDER` (`publish.ts`) ; le
  noyau doit tourner dans un job à part (deux noyaux, plafond de 6 h).

**Config noyau** (6.18, symboles vérifiés sur les Kconfig de v6.18.5) :

- Rust, minima de `scripts/min-tool-version.sh` : rustc 1.78.0, bindgen 0.65.1, LLVM 15.0.0. Alpine 3.24 fournit
  rust 1.96.1 (LLVM 22) + rust-src, rust-bindgen 0.72.1, clang/lld/llvm 22, pahole 1.30.
  - `RUST=y`, `GENDWARFKSYMS=y` (lts garde `MODVERSIONS=y`), `RANDSTRUCT_NONE=y`, sans overflow checks ni debug
    assertions.
  - Modules Rust : `RUST_FW_LOADER_ABSTRACTIONS`, `RUST_PHYLIB_ABSTRACTIONS`, `DRM_PANIC` +
    `DRM_PANIC_SCREEN_QR_CODE`, `NOVA_CORE=m`, `DRM_NOVA=m` (x86_64 seulement : il faut `DRM=y`), `BLK_DEV_RUST_NULL=m`,
    `CPUFREQ_DT_RUST=m` (aarch64).
  - Écartés : `ANDROID_BINDER_IPC_RUST`, `DRM_TYR` (`DRM=m` en aarch64), `AX88796B_RUST_PHY`.
- Compilation : `CC_OPTIMIZE_FOR_PERFORMANCE`. Désactivés : PROVE_LOCKING/LOCKDEP, DEBUG_PREEMPT, KASAN,
  SLUB_DEBUG_ON, PAGE_POISONING, PAGE_TABLE_CHECK. Désactivés aussi, sans perte de sécurité utile :
  HARDENED_USERCOPY, INIT_ON_ALLOC/FREE_DEFAULT_ON. `CPU_MITIGATIONS=y` reste.
- **ThinLTO hors des images par défaut.** En 6.18, `RUST` exige `!DEBUG_INFO_BTF || !LTO` et `GENDWARFKSYMS` exige
  `!LTO` : LTO + Rust coûterait BTF, sched_ext, CO-RE et MODVERSIONS. L'option reste disponible :
  `APHRODY_KERNEL_LTO=1` fusionne `lto.config`, que check-config applique si `LTO_CLANG_THIN=y`.
- Ordonnanceur : `PREEMPT_DYNAMIC` + `PREEMPT` (full par défaut), `HZ_1000`, `NO_HZ_FULL`, `SCHED_CLASS_EXT` (BTF
  requis), `SCHED_AUTOGROUP`.
- E/S : `IO_URING`, `FUTEX`(+`FUTEX_PI`, `futex_waitv`), `EVENTFD`, `TIMERFD`, `SIGNALFD`, `EPOLL`, `AIO`.
- Mémoire : `TRANSPARENT_HUGEPAGE_MADVISE`, `LRU_GEN(_ENABLED)`, `ZSWAP_DEFAULT_ON` + zstd, `USERFAULTFD`,
  `MEMFD_CREATE`, `SECRETMEM` (memfd_secret), `CMA`, `NUMA_BALANCING_DEFAULT_ENABLED`, `KSM=y` (inactif au démarrage).
- Processus : `CHECKPOINT_RESTORE` (sans coût hors usage), tous les namespaces, cgroup v2 (memory, cpu, io, pids,
  cpuset), `SECCOMP_FILTER`, `LANDLOCK`, `BPF_SYSCALL`, `BPF_JIT_ALWAYS_ON`.
- Réseau : `TCP_CONG_BBR=y` + `DEFAULT_BBR`, `NET_SCH_FQ=y` + `DEFAULT_FQ`, `TLS=m` + `TLS_DEVICE`, `XDP_SOCKETS`,
  `NET_RX_BUSY_POLL`, `IPV6`.
- Fichiers : `INOTIFY_USER`, `FANOTIFY`, `OVERLAY_FS`, `BTRFS_FS`, `XFS_FS` (reflink), `EXT4_FS`, `FS_VERITY`,
  `FUSE_FS`.
- Profilage : `PERF_EVENTS`, `KALLSYMS_ALL`, `UPROBES`, `KPROBES`, `DEBUG_INFO_BTF`, `UNWINDER_ORC` (x86_64),
  `FRAME_POINTER` (arm64).
- Sans symbole Kconfig en 6.18 : pidfd et clone3, futex_waitv, TCP Fast Open, SO_REUSEPORT, UDP GSO/GRO,
  copy_file_range, FICLONE, perf map de JSC (`/tmp/perf-<pid>.map`).

**Code noyau** : aucun écrit en U3. Tout patch noyau passe par V (`aphrody-labs/linux`, `aphrody-bun`), en Rust sur
les abstractions `rust/kernel`, sinon en C. Règles de docs.kernel.org/process : un patch par sujet, chaque patch
compile (bisect), `scripts/checkpatch.pl`, `Signed-off-by`. Les options demandées par V s'ajoutent ci-dessous avec
la mention « demandé par V ».

**Passe finale** (Docker local, Alpine 3.24) :

```sh
bun run rust:check-all
bun bd test test/js/bun/spawn/spawn.test.ts -t elevate
bun bd test test/js/bun/shell/bunshell.test.ts -t sudo
bun bd test test/js/bun/linux/linux.test.ts
bun test test/integration/bun-types/bun-types.test.ts
# en root puis en utilisateur du groupe aphrody, dans le conteneur Aphrody Alpine :
bun scripts/aphrody/tmux.ts run bd-U3 --alpine --sync-head -- bun bd test test/js/bun/linux/linux.test.ts
# fork aports (C:\aports), dans alpine:3.24 avec abuild :
cd aphrody/sudo-rs && abuild checksum && abuild -r
cd aphrody/aphrody-sysctl && abuild -r
cd aphrody/linux-aphrody && abuild checksum && abuild unpack prepare && abuild prepareconfigs   # rustavailable + config
APHRODY_STRICT_CONFIG=1 abuild -r
# sur une VM démarrée sur linux-aphrody :
bun aphrody/kernel/check-config.ts --sysctl
```

⏳ Reste : `bunsh --root` (U1) ; `ORDER` de `publish.ts` (U1) ; épingler `_fork_commit` quand V publie `aphrody-bun`.
Placeholder : `APHRODY_APK_REPO` du fragment Dockerfile (le dépôt NDX de U1 le remplacera).

### A. Publication (✅ base)

- ✅ crates.io : `aphrody-bun-macro` 0.1.0, `aphrody-bun-native-plugin` 0.2.0.
- ✅ npm : `@aphrody/bun-types`, `bun-inspector-protocol`, `bun-debug-adapter-protocol`, `bun-plugin-svelte`,
  `bun-plugin-yaml` (`scripts/aphrody/publish-npm.ts`, `aphrody-publish-npm.yml`).
- ✅ Release `aphrody-v1.4.3-aphrody.1` (4 cibles) + `@aphrody/bun-runtime` (`aphrody-release.yml`,
  `scripts/aphrody/publish-runtime.ts`).

### B. Release du binaire — limites (✅)

Fichiers : `.github/workflows/aphrody-release.yml`, `scripts/aphrody/{build-host,publish-runtime,npm-placeholder,publish-mdx-rs,publish-web-inspector}.ts`,
`scripts/build/**` (version), `test/internal/aphrody-{build-host,publish-mdx-rs,publish-runtime}.test.ts`.

- ✅ Build host d'upstream (debian:13 sur ubuntu-24.04-arm, cross-compilation) : linux-gnu contre le sysroot glibc 2.31
  (symbole max GLIBC_2.17 sur aarch64), musl contre Alpine, Windows via xwin CRT 14.44.17.14, macOS SDK ; LTO on. 6afd1932d3e
- ✅ 8 cibles : linux-x64/aarch64 (+musl), darwin-aarch64/x64, windows-x64/aarch64 ; alias `-baseline` x64 comme upstream. 6afd1932d3e
- ✅ `bun --version` = `1.4.3-aphrody.N` (`--version-tag`), `Bun.version` reste `1.4.3`. 04fd2e85af5
- ✅ `0.0.0-stage` = placeholder du staged publishing npm au 1er publish (unpublish E403) → déprécié par chaque script de
  publication après visibilité de la version, workflow `aphrody-npm-placeholder.yml` à la demande ; `latest` correct. 806a3c32885
- ✅ `@aphrody/bun-mdx-rs` 1.4.3-aphrody.1 + 8 paquets plateforme (CI native) et `@aphrody/web-inspector-bun` 1.4.3-aphrody.1
  (sources WebKit à WEBKIT_VERSION). 2cfc2ef28c6, 4e98faf1742, 7d1b86718c3
- ✅ Smoke par cible bloquant (marqueur par cible, `node:fs`, `node:path` + `execFileSync`, musl avec libstdc++/libgcc,
  glibc aussi sur ubuntu:26.04). 5360ad1c11a, f7a7086b602
- ✅ Release `aphrody-v1.4.3-aphrody.2` verte (run 37856453908) : 24 zips + SHA256SUMS.txt ; npm `@aphrody/bun-runtime`
  et ses 8 plateformes en 1.4.3-aphrody.2 (`latest`) ; `bunx @aphrody/bun-runtime@1.4.3-aphrody.2 --version` OK sous Windows ;
  installée dans ~/.bun/bin (secours `bun-upstream-1.4.2.exe`) ; Shenron passé en .2 (ea184935).

### E. Bugs Bun sous Windows (✅)

Fichiers : `src/**`, tests dans les fichiers existants.

- ✅ Segfault du debug build sur `-e` et `test` : STL MSVC 14.51 (VS 2026) incompatible ABI avec le WebKit
  prébuilt (14.44) — `std::partial_ordering` renvoyé par sret au lieu d'un registre, écriture via un pointeur
  invalide dans `JSRunLoopTimer::Manager::scheduleTimer`. `scripts/vs-shell.ps1` choisit le toolset épinglé,
  configure refuse un toolset plus récent, l'identité de toolchain inclut `VCToolsVersion` (`41a9c254070`).
  Même cause pour le crash de la release `aphrody-v1.4.3-aphrody.1` (build Windows natif sur `windows-2025`,
  MSVC 14.51.36231) ; la release croisée xwin (CRT 14.44) de `6afd1932d3e` l'évite.
- ✅ (rouvert puis refermé) Le build release local `1.4.3-aphrody.2+4e187a0e8` segfaultait encore sur
  `await import("node:fs")` : `build/release` datait d'avant `41a9c254070` (identité de toolchain sans ligne
  `msvc`, donc compilé en 14.51). Reconstruit avec `msvc 14.44.35207` (`toolchain-identity/cxx.txt`) :
  `-e 'await import("node:fs")'`, `bun x prettier --version` et `bun test` passent. Test de régression dans
  `builtin-esm-lazy-exports.test.ts`, smoke `bun test` ajouté à `aphrody-release.yml` (le `-e` y était déjà).
- ✅ `require()` d'un chemin absolu mêlant `\` et `/` sans extension → `__dirname` faux et module en double :
  `load_extension` construit le chemin depuis l'entrée (`dbe3387ccf9`), test dans `require.test.ts`.
- ✅ `which.test.ts` : cas `.com` du cwd indépendant de `NoDefaultCurrentDirectoryInExePath` (`e97556dd6c7`).
- ✅ Diagnostic Windows (`.claude/docs/windows-deep.md`) : cdb/WinDbg/procdump/lldb opérationnels, `_NT_SYMBOL_PATH`,
  procédure crash → dump → pile symbolisée testée (`scripts/aphrody/win-crash.ts`). WER LocalDumps ne marche pas pour
  bun (libuv `SEM_NOGPFAULTERRORBOX`, `vendor/libuv/src/win/core.c:181`) : procdump `-e 1`. La stratégie
  `Policies\...\Windows Error Reporting\Disabled=1` désactivait WER sur toute la machine (remise à 0). Exclusions
  Defender étendues à `C:\bun`, `.rustup`, VS/LLVM/SDK.
- ✅ Patch WER (libuv `patches/libuv/win-allow-wer.patch` + `src/crash_handler/lib.rs`) : `SEM_NOGPFAULTERRORBOX` n'est plus
  posé quand `BUN_WER=1` ou qu'une clé `LocalDumps/<exe>` existe ; le crash handler termine alors par
  `RaiseFailFastException` avec l'exception d'origine (WER dumpe la vraie faute). Défaut inchangé (`ExitProcess(3)`).
  Test : `test/cli/run/run-crash-handler.test.ts`.

### F. Fork = noyau d'Aphrody (✅)

Côté Aphrody : `patches/bun`, `vendor.toml`/lock, `tools/config/vendor.json`, `packages/infra/update`,
`docs/operations/infra/update/BUN.md`, `crates/compat/bun-bridge`, `crates/compat/bun-docs`.

- ✅ `APHRODY.md` décrit ce que le fork fournit (fork `4e187a0e8a4`).
- ✅ Patches `patches/bun/0001-0009` : tous déjà présents dans le fork → supprimés, avec
  `scripts/tools/vendor/{bun_upstream_sync,bun_upstream_tracker,packages_upstream_sync}.ts` (suppression partie dans
  Aphrody `e3aa1d730`).
- ✅ Pins et vendoring : entrée `bun` retirée de `tools/config/vendor.json` ; `pins.json` suit les releases
  `aphrody-labs/bun` (`stripTag`) ; fork inscrit dans `tools/config/update/forks.json` ; `UPSTREAMS.md` régénéré ;
  références `vendor/bun` → fork / `APHRODY_BUN_CHECKOUT`. Aphrody `99eda6f67`.
- ✅ `crates/compat/bun-bridge` (réimplémentation Rust de Bun) supprimé, consommateurs migrés (`aphrody shell bun` →
  `bun exec`) ; `aphrody-bun-docs` lit d'abord le checkout du fork puis le miroir `docs/reference/upstream-bun` ;
  `BUN.md` ne cite plus `patches/bun`. Aphrody `71cf2bb22`. Gates : `cargo test` bun-docs et n2b-core, clippy
  `-D warnings` sur ces deux crates, `cargo check` discord/ffi/command.
- ✅ Installateurs du fork `scripts/aphrody/install.{sh,ps1}` (version, tag exact ou latest, SHA256SUMS, musl,
  contrôle d'exécution) : fork `2ecdff0d2a9`, `7c89f8712cc`. Aphrody installe le binaire du fork partout (update
  `tools.install`, `system-packages`, bootstrap/toolchain-sync/bun-hygiene sh+ps1, Dockerfiles, CI) ; pin `1.4.3`
  tenu par `pins.json` : Aphrody `3c70e77d3`, `ecaa5605e`, `866e22453`. Vérifié : Windows (install.ps1 local et
  raw), Docker ubuntu:24.04, `aphrody/build-linux:26.04`, image `tools/config/container` (bun 1.4.3+37edd09a6).
- ✅ `packages/infra/update` 0 échec Windows et Linux (`aa0163461`) ; catalogues générés et mentions bun-bridge
  (`0c4fd6368`) ; `docs:gen`, `docs:check`, `docs:check-links` verts (`866e22453`).
- ✅ yolo : `cli_app` (sources vendor absentes, `doctor --json`) et `workspace_profiles` lent (glob sans
  node_modules/target) : `a7998d168`. kernel-client lancé via `aphrody kernel serve` : `f7c490072`.
- ✅ `packages/engine/core` : 35 → 0 échec Windows (racine hôte = checkout source, wrapper Cargo pwsh/sh, beacon
  `dirname`, état git en un spawn, commandes Cargo légères hors verrou) : `9b40294ed7`. Linux (Ubuntu 26.04) : 4 échecs
  restants avant build de `libaphrody_ffi.so`/oxfmt global, à rejouer dans la passe de tests finale.
- ✅ Hypothèse WSL Ubuntu-24.04 remplacée par `aphrody/build-linux:26.04` (infra cli, inventaire, docs) : `2d3f713f9`.
- Bloquant hors F : le binaire release Windows du fork (`aphrody.1` et build local `aphrody.2`) segfault sur
  `bun -e 'await import("node:fs")'` (debug OK) ; hôte Windows laissé sur l'upstream 1.4.2 en attendant. Linux glibc
  2.36 et Alpine attendent la release glibc 2.31 + musl (chantier B) ; l'image `aphrody-os` en dépend.

### G. Déduplication de la couche JS Bun d'Aphrody (✅)

Côté Aphrody : `m3/packages/m3-bun`, `crates/ui/bun`, `crates/interop/ffi/bun`, `scripts/build/ui/packages/bun`,
paquets `packages/**` qui refont une API Bun (`http`, `fuzzy`, `sql`, `paths`…).

- ✅ Supprimés : wrappers `bun-shell.ts` (doublons de `Bun.$`, `Bun.hash`, `Bun.semver`, `Bun.Glob`) et leurs 10
  symboles FFI, `spawn-sync.ts`, `benchmark.ts`, `crates/interop/ffi/bun` (agent client déplacé dans
  `@aphrody/bun/agent`), `scripts/build/ui/packages/bun`, `@aphrody/bun-forge` (npm déprécié). Aphrody `33a4b79a3`.
- ✅ API Bun natives : `Bun.semver.order` (update), `Bun.Glob` (tauri apps), `Bun.hash.crc32` (canonical-tar,
  mcu-image-fixture). Aphrody `9ad186926`.
- ✅ Types : catalogue `@types/bun` → `npm:@aphrody/bun-types@1.4.3-aphrody.1`. Aphrody `aa4980040`.
- ✅ Migré ici : `@aphrody/webview-page` → `packages/bun-webview-page` (`@aphrody/bun-webview-page`, publié
  `0.1.1-aphrody.2`, ancien nom déprécié). Fork `5a11460837d`, `729caaf440f` ; Aphrody `69ba8ec2b`, `3250f76f6`.
  Cause de l'e2e Windows « Chrome process closed the pipe » : un Chrome lancé en session élevée se relance
  dé-élevé et perd le pipe CDP ; le paquet passe `--do-not-de-elevate` sous Windows (e2e Chrome 154 vert).
  Corrigé aussi dans `Bun.WebView` (`ChromeProcess.rs` ; test `webview-chrome-pipe.test.ts` ; `05743df31f9`) :
  `webview-chrome.test.ts` passe 58/58 avec Chrome réel sous `bun bd` (0/58 avant).
- ✅ Maintenus (spécifiques Aphrody, pas une API Bun) : `@aphrody/bun` (FFI aphrody-ffi, ≠ `@aphrody/bun-runtime`),
  `crates/ui/bun`, `m3-bun`, `@aphrody/http`, `@aphrody/sql` (fabriques sur `Bun.SQL`), `fuzzy`, `qr`.

### H. Docs Bun d'Aphrody (✅)

- ✅ Purge des copies et plans Bun périmés ; page canonique `docs/reference/upstream-bun/APHRODY-FORK.md` ; seule copie de
  la doc : `docs/reference/upstream-bun` (`bun run docs:bun:update|check`). `CLAUDE.md`, `AGENTS.md` à jour ; `TOOLS.md`
  généré, rien de périmé. `yolo docs` lit le miroir (`docs/cli/HELP.md` régénéré) ; `just qualify-bun` qualifie le
  checkout local du fork (`APHRODY_BUN_CHECKOUT`, défaut `../bun` : `scope.ts --check`, retard sur upstream/main, puis
  `yolo forge`). Aphrody `8c13ad714`, `1a87c0fad`, `9d5aaad7c`. `docs:gen`/`docs:check`/`docs:bun:check` verts,
  `docs:check-links` : 0 lien cassé, 0 chemin mort.

### I. Tests Windows d'Aphrody (🔄)

- ✅ `packages/infra/workspace` : 105 échecs → 0 sous Windows (349 pass, 90 skip Linux-only : procfs/flock/sudo, `supervise`, install.sh). Linux (Docker) : aucune régression vs HEAD. Commits aphrody `3c70e77d3` (lot intégré), `1a9b89a40`.
- ✅ `aphrody_ffi.dll` construite (`target/runtime`, profil `runtime`) ; web-test 37/37 dont `sites` + `next-instant`. Commit `df6e5502d`.
- ✅ m3 : scripts 51/0, m3-icons 13/0 (DLL `target/runtime` reconstruite avec polices embarquées), m3-theme 13/0, m3 61/0, m3-config/front/mcp/tailwind/material-design-icons 0 échec (aphrody 099a4fe180). `m3:theme.css` : `@import` à schéma tenu hors du compile Tailwind (fork 4265629bb50) ; m3-bun passe de 21 à 10 échecs avec la source du fork, effectif dans aphrody après publication npm `0.1.0-aphrody.2` (chantier D prévenu).
- ✅ m3-bun Windows : 119 pass / 9 skip / 0 échec avec le plugin Tailwind du fork (aphrody `a7a9f745fa`) — defaultOutfile
  `.exe`, bit exécutable et ldd/`--rootfs` réservés à Linux (erreur explicite), `M3_ICONS_ROOT` résolu, archives écrites
  par Bun (tar.gz et zip, sans `tar`/`zip` externes), smoke via `bun build --compile`, un seul pwsh pour les 3 .ps1.
  Linux (Docker `aphrody/build-linux:26.04`) : 119 pass / 8 skip, aucune régression (HEAD avait 1 échec zip sans `zip`) ;
  `init.c static-linkable` passe à 30 s de délai (link statique ~5 s sous 6 CPU).
- 🔄 Patch cœur §2.11 `Bun.Archive` (fork `5ffed5d5e53`, non construit ni testé — directive « un seul build final ») :
  `format: "zip"` (writer + reader libarchive, `archive_read_support_format_zip` + `ppmd8`, noms UTF-8 flaggés via
  `patches/libarchive/zip-utf8-names.patch`), entrées `{ data, mode, mtime }`, option `mtime` (archives
  reproductibles), `extract` des zip par le lecteur Bun.Archive (le chemin rapide de `bun install` reste tar seul).
  Tests : `bun bd test test/js/bun/archive.test.ts -t "entry modes, mtime and zip"` (doit échouer avec
  `USE_SYSTEM_BUN=1`). Après la release du fork : remplacer l'encodeur tar/zip de `m3/packages/m3-bun/src/package.ts`
  (`archiveEntries`/`tarHeader`/`tarGz`/`zip`) par `Bun.Archive.write(..., { format, mtime: 0 })` et le supprimer.
- ⚠️ `tmux.ts run --ubuntu --sync` : l'image `aphrody/build-linux:26.04` n'a pas `rsync` (Dockerfile modifié par un autre
  agent, image non reconstruite) ; vérification Linux faite par `docker run` direct.

### K. CLI Aphrody (✅)

Côté Aphrody : `crates/ai/code-graph`, `crates/engine/yolo-core`, `crates/infra/{yolo,git,aphrody-command}`,
`crates/os/kernel/core` (cloud), `crates/ai/mcp` ; réinstallation du binaire.

- ✅ graph (points 1-8) : résolution inter-crates, chemin orienté, `explain` `file::symbol`, pas de liaison
  d'homonymes, rapport enrichi, graphe Markdown, causes d'erreur d'extraction, `delete`/`drop` — `8d3109124`.
- ✅ yolo (9-15) : ressources sans `APHRODY_YOLO_ROOT`, tiers verify ignorés proprement, gates réels du source
  Bun, workspaces Cargo/package.json, état dans `~/.aphrody/yolo`, `require()` et enums — `e3aa1d730` ;
  index fs en SQLite (`fsindex.sqlite`, FTS5 trigram, requêtes multi-mots insensibles à la casse, `LIKE` pour
  les mots < 3 caractères, migration automatique de l'ancien `fsindex.tsv`) — `8a35b2e06`. C:\bun : 20 153
  entrées, recherche en ~0,08 s.
- ✅ git (16) : `git inspect` log, hotspots, ahead/behind par remote — `922f9835c`.
- ✅ MCP (17-20) : `github_branches` paginé/filtré (50 par défaut) — `d027032d8` ; `bun` au catalogue upstream
  (`checkout: ../bun`) et `upstream_search` sans jeton → recherche dans le checkout local ; `docs_auto_search`
  WebKit → `/websites/webkit` et sections bornées ; `coding_style_guide` `c++`/`cpp`/`ts`/`bash` — inclus
  dans `3c70e77d3` (commit groupé d'un autre agent).
- ✅ `aphrody scan` (21) : chemin absolu du rapport en fin de sortie, sans `-o` résumé seul, `-o -` JSON seul —
  `3c70e77d3` + `8648e2d0a`.
- ✅ Binaire release réinstallé (`aphrody self install-path`, `aphrody 1.0.0-canary`, aphrody-mcp relié) ;
  `graph:bun` reconstruit (19 783 fichiers, 116 085 nœuds) et `claude-memory-bun` (573 nœuds).

### L. oxc et n2b dans le fork (✅ ; n2b 0.7.1 monorepo en cours)

Fichiers : `packages/bun-n2b/**`, `packages/bun-oxc/**`, `test/integration/bun-plugin-n2b/`,
`test/integration/bun-plugin-oxc/`, `scripts/aphrody/{build-napi,publish-crates,publish-native}.ts`,
`.github/workflows/aphrody-publish-{native,crates}.yml`. Côté Aphrody : `crates/compat/{n2b,n2b-core,n2b-registry,n2b-types,oxc-bridge}`
et `packages/engine/n2b-client` supprimés (2db2b5a973, 132 fichiers, −31 522 lignes).

- ✅ Code déplacé (move from aphrody@09f1288c) : `packages/bun-n2b/` (workspace Cargo séparé, toolchain stable) et
  `packages/bun-oxc/` (Oxc 0.153.0). Addons napi : `bun scripts/aphrody/build-napi.ts packages/bun-{n2b,oxc}`.
- ✅ crates.io : `aphrody-n2b-types`, `-registry`, `-core`, `aphrody-n2b` 0.7.0 ; `aphrody-oxc-bridge` 0.2.0.
- ✅ npm : `@aphrody/bun-plugin-n2b@0.7.0` (plugin, API `scan`/`transform`, CLI `bunx @aphrody/bun-plugin-n2b scan|fix|report|rules…`,
  shims ; absorbe `n2b-client`) et `@aphrody/bun-plugin-oxc@0.2.0`, chacun avec 8 paquets plateforme
  (win32 x64/arm64, darwin x64/arm64, linux x64/arm64 gnu/musl) — workflow `aphrody-publish-native.yml`.
- ✅ Aphrody consomme les crates en version exacte (`aphrody n2b`, MCP `n2b`, ffi `tooling`, bun-docs) ; `oxc_codegen`,
  `oxc_minifier`, `oxc_semantic` retirés, oxc restant aligné sur 0.153 ; docs n2b dans `packages/bun-n2b/docs`, renvoi
  `docs/reference/compat/N2B.md`.
- ✅ Tests : cargo n2b (~97) et oxc (13) ; `bun test test/integration/bun-plugin-{n2b,oxc}` 17 + 16 pass (Windows),
  29 pass / 4 skip oxfmt-oxlint absents (conteneur Linux 26.04) ; Aphrody cargo test --lib des consommateurs 396 pass.
- 🔄 n2b 0.7.1 pour M/Q/R, code poussé (96aa81a7598), ni compilé ni testé (directive : passe unique de main) :
  `--migrate` reporte `pnpm-workspace.yaml`/champ `pnpm` (workspaces, catalog(s), overrides, patchedDependencies,
  onlyBuiltDependencies → trustedDependencies) ; `--migrate --dry-run` → `migration_plan` ; 9 règles `cli/*` (vitest/jest →
  `bun test` en aggressive, tsx/ts-node/`node --loader` → `bun`, `pnpm -r|--filter` → `bun run --filter`) ;
  `test/unsupported-api`, `test/mock-hoisting` ; `--since <ref>` ; `find_manifest` borné à `.git` ; schéma v2.
  À faire après la passe verte : `cd packages/bun-n2b && cargo test --workspace && cargo clippy --workspace --all-targets`,
  `bun packages/bun-n2b/scripts/generate-schema-types.ts --check`, `bun scripts/aphrody/build-napi.ts packages/bun-n2b`,
  `bun test test/integration/bun-plugin-n2b`, puis publier 0.7.1 (crates + native) et passer Aphrody en `=0.7.1`.
  Limites Bun signalées : `bun:test` sans `vi.stubEnv/stubGlobal/importActual/hoisted/doMock/resetModules/waitFor`,
  `vi.mock` non hissé ; overrides pnpm imbriqués (`a>b>c`) sans équivalent.

### O. Garde de performance (🔄)

Le fork ajoute des modules et plugins sans coût au démarrage ni goulot. Fichiers : `bench/aphrody/**`,
`scripts/aphrody/perf-gate.ts`, `.github/workflows/aphrody-perf.yml`, `test/internal/aphrody-perf-gate.test.ts`.

- ✅ Banc `bun scripts/aphrody/perf-gate.ts [--fork <bun>] [--upstream <bun> | --upstream-version X]` (e95716e8b75) :
  `bun --version`, `-e ''`, `run` vide, `test` vide, `build` petit projet, `install` hors-ligne (tarballs `file:` + cache
  chaud), RSS au démarrage et après 11 `node:*`, `require`/`import()` de 31 `node:*` et 4 `bun:*`, `Bun.serve` hello,
  `fetch` local (p50/p99/req/s), taille du binaire. Upstream téléchargé par `gh release download` (repli sur la dernière
  release), hyperfine si présent sinon boucle `Bun.spawnSync` entrelacée ; médiane et p95 ; JSON + Markdown
  (`$GITHUB_STEP_SUMMARY`) ; exit 1 si seuil dépassé, 2 si binaire cassé. Seuils : `bench/aphrody/thresholds.json`
  (ratio ET écart absolu minimal, pour ignorer le bruit de lancement de processus). Taille et RSS ne bloquent pas quand
  les versions de base diffèrent (`--strict` les impose). Reste non couvert : `next-bun build` de la fixture.
- ✅ CI `.github/workflows/aphrody-perf.yml` : pull_request/push main (chemins src, scripts/build, vendor, bench),
  `workflow_run` après « Aphrody release » (artefact de build neuf), dispatch avec `run-id`. Linux x64 bloquant, Windows
  x64 informatif (la release .1 plante, chantier E). Sans `run-id`, PR et push mesurent la dernière release `aphrody-v*`,
  pas le code de la PR : le binaire de la PR n'est mesuré qu'après son build de release.
- ✅ Audit des ajouts du fork sur `merge-base..main` (21 fichiers `src/`, aucun changement de flags de compilation) :
  rien d'eager au démarrage. `display_version`/`VERSION_TAG` sont des `const` ; `picocolors`, `tiny-invariant`, `dotenv`,
  `uuid` sont 5 entrées de table de modules internes évaluées à la demande (`require` des 4 : 4 à 7 ms, fork seul) ;
  `is_plain_bun` évite même `Graph::from_executable` ; `dlopen` global, WebView/Chrome, résolveur (join mis en cache par
  entrée) hors chemin de démarrage. Aucun correctif nécessaire.
- ✅ Mesures (Windows x64, i7-13700F 24 threads, 32 Go, release LTO, MSVC 14.44, 40 runs/5 échauffements, hyperfine,
  médianes). Fork (working tree à 2d27bf316) contre le **même commit de base sans les patchs du fork** (620b50f6a, même
  toolchain, `tmp/perf/r2`) : `--version` 9.70 vs 9.39 ms, `-e ''` 9.70 vs 9.91, `run` vide 25.7 vs 24.1, `test` 27.2 vs
  27.9, `install` 59.5 vs 58.7, RSS démarrage 19.03 vs 19.00 MiB, RSS après builtins 26.55 vs 26.62 MiB, `require` 31
  `node:*` 125 vs 118 ms (bruit : p95 255-278 ms, builds en cours), `import()` 64.8 vs 63.2, `Bun.serve` 8.06 vs 7.93,
  `fetch` p50 0.11 vs 0.11 ms, taille 92.11 vs 92.08 MiB (+32 KiB). `build` petit projet 104 vs 88 ms : médiane bruitée
  (p95 > 780 ms des deux côtés) à refaire sur machine au repos. Fork contre upstream **1.4.2** officiel (`tmp/perf/r1`) :
  démarrage identique à ±0.4 ms, mais taille 92.11 vs 82.11 MiB et RSS 19.6 vs 16.5 MiB : ces écarts sont déjà dans le
  commit de base (le même écart apparaît entre 1.4.2 et 620b50f6a), pas dans les patchs du fork. Aucune régression du
  fork mesurée.
- ✅ Régression d'outillage trouvée : `build/release/bun.exe` (23:57) plantait au hasard (0xC0000409,
  `WTF::operator<=>` dans `TimeWithDynamicClockType.cpp`, thread AutomaticThread) dès qu'un script chargeait `node:fs` :
  même ABI `std::partial_ordering` que le chantier E, binaire compilé avec le STL MSVC 14.51. Reconstruit avec le toolset
  épinglé 14.44 (`build/release-perf`) : 0 crash sur 7 essais. Rien à porter au chantier P (ce n'est pas JSC).
  Piège de mesure : le même binaire pèse 47 MiB de RSS lancé depuis `~/.bun/bin` contre 16 MiB copié ailleurs ; le banc
  doit toujours mesurer des copies hors de `~/.bun/bin`.
- ⏳ À faire : première exécution de la CI (vérifier le téléchargement `gh run download`/zip côté Windows), seuils resserrés
  sur des runs de CI au repos, test d'intégration `next-bun build`, comparaison Linux (musl/glibc) dans le conteneur.
  Les tests `test/internal/aphrody-perf-gate.test.ts` (12 passés avant ajout de `--strict`) sont à rejouer.

### P. Fork WebKit / JavaScriptCore — `aphrody-labs/WebKit` (🔄)

Fichiers : côté fork Bun `scripts/build/deps/webkit.ts` (source des prébuilts, `WEBKIT_VERSION`,
`APHRODY_WEBKIT_PREBUILTS`), `scripts/aphrody/webkit-prebuilt.ts` (flux), `test/internal/webkit-prebuilt-source.test.ts` ;
côté WebKit `.github/workflows/aphrody-prebuilts.yml`, `aphrody-upstream-sync.yml`, `APHRODY.md`.

- ✅ `aphrody-labs/WebKit` resynchronisé sur `oven-sh/WebKit` (2026-10-09, fast-forward des 1999 commits via
  `merge-upstream`, `main` = `0c06faadf65b…` et au-delà). Sync programmé : `aphrody-upstream-sync.yml` (toutes les
  6 h ; fast-forward, ou `git merge` blobless quand `main` porte des patchs ; secret `APHRODY_SYNC_TOKEN` pour les
  fichiers `.github/workflows`).
- ✅ CI de prébuilts : `ci.yml` d'oven-sh (désactivé dans le fork : runners privés `linux-x64-gh`/`linux-arm64-gh`)
  est remplacé par `aphrody-prebuilts.yml`, qui réutilise **tels quels** `.github/scripts/lanes.mjs` et les
  `Dockerfile*` d'upstream (donc mêmes lanes, mêmes noms `bun-webkit-<os>-<arch>[-musl][-debug|-lto][-asan].tar.gz`,
  même contenu, tag `autobuild-<sha>`). Tous les lanes se construisent dans un conteneur linux/amd64 (macOS, Windows,
  FreeBSD, Android et arm64 en cross-compilation) : un seul type de runner. Images de toolchain dans
  `ghcr.io/aphrody-labs/bun-webkit-build-env`. Lanes au choix (`lanes` = regex sur les labels, `all` = les 42).
- ✅ **Mesure** (2026-10-09, runner standard `ubuntu-latest` 4 vCPU/16 Go, dépôt public = gratuit) : image
  `linux-musl` 4 min 18 s ; lane `bun-webkit-linux-amd64-musl-lto` **45 min** (limite d'un job : 6 h). Archive
  223 265 820 o (oven-sh : 223 270 963 o), mêmes 2800 entrées. Pas besoin de runners larges : le disque est
  contourné (data-root Docker sur `/mnt`, ~70 Go), l'unique limite réelle est la concurrence (20 jobs) ; toute la
  matrice tient en quelques heures.
- ✅ `scripts/build/deps/webkit.ts` : source par archive. Défaut `oven-sh/WebKit` tant que
  `APHRODY_WEBKIT_PREBUILTS[sha]` ne liste pas l'archive ; `BUN_WEBKIT_REPO=aphrody|oven|<owner>/<repo>` force la
  source ; le dépôt entre dans l'identité et le répertoire de cache (pas de collision à sha égal). Build Windows
  MSVC 14.44 inchangé (clés de cache identiques par défaut). Test : `bun test test/internal/webkit-prebuilt-source.test.ts`.
- 🔄 Alpine (chantier N) : `Dockerfile.musl` part de `alpine:3.23` + LLVM 23 (edge) ; les `-musl*` sont l'artefact
  Linux principal. Passage de la base à Alpine 3.24 = commit sur le fork WebKit, puis relance du lane musl.

**Flux d'un patch JSC/WebKit** (tout est dans `scripts/aphrody/webkit-prebuilt.ts`) :

1. Patch JSC → commit sur `main` de `aphrody-labs/WebKit` (clone partiel :
   `git clone --filter=blob:none --sparse`, ou PR sur le fork). Le sync upstream fusionne ensuite oven-sh au-dessus.
2. CI prébuilt : `bun scripts/aphrody/webkit-prebuilt.ts build --ref <sha> [--lanes 'regex,…'|all]`
   (= `gh workflow run aphrody-prebuilts.yml -R aphrody-labs/WebKit`) → release `autobuild-<sha>` publiée si tous les lanes passent.
3. Bump dans le fork Bun : `webkit-prebuilt.ts bump --sha <sha>` (met `WEBKIT_VERSION`), puis
   `webkit-prebuilt.ts record` (écrit dans `APHRODY_WEBKIT_PREBUILTS` les archives réellement publiées pour ce sha, ce qui bascule le
   build dessus), prettier, `bun test test/internal/webkit-prebuilt-source.test.ts`, build, commit.
4. `webkit-prebuilt.ts status` : écart au upstream et archives publiées.

Itération avant la CI : `BUN_WEBKIT_PATH` (clone de `aphrody-labs/WebKit`, mode `webkit: local` de `webkit.ts`).

- ⏳ Tout patch JSC/WebKit utile (perf démarrage, musl, fonctionnalités des plugins) suit le flux ci-dessus.
