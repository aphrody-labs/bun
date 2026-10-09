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
  `aphrody/` + `.github/`) ; tout l'ajout est sous `aphrody/`, détail dans son `PLAN.md`. Commits `15e5fcd2686` (U1), `c3ffb089c93` + `a74fe8ed9a3` (U3), `63902135c72`
  (jobs par noyau).
- [aphrody-labs/apk-tools](https://github.com/aphrody-labs/apk-tools), `master` = 3.0.8 (C:apk-tools) : **aucun
  patch** (justifié dans son `PLAN.md`). Commit `6e1261b`.

**Paquets `aphrody/`** : `bun` 1.4.3_p2 (+ `bun-shell` : `/bin/bunsh`, `/etc/shells` ; + `bun-apk`), `n2b` 0.7.1
(release `n2b-v0.7.1` de ce dépôt), `aphrody` (tarball du dépôt privé, `b70bfdf4446`), `aphrody-libc` 0.1.0 (U2 :
`-dev` = `/usr/lib/libaphrody_libc.a` pour `--aphrody-libc=`, `-preload`), `llvm23`/`clang23`/`lld23`/`llvm-runtimes`
23.1.3 (rétroportés d'aports master `6f2f659847f`), `rust-nightly` 2026-09-15 (`/usr/lib/rust-nightly`, =
`rust-toolchain.toml`), `rust-stable` 1.98.1 (3.24 n'a que 1.96, aphrody/n2b veulent ≥ 1.97), méta
`aphrody-bun-build-deps` ; U3 : `sudo-rs` (+ `-su`, `aphrody-sudoers`), `aphrody-sysctl`, `linux-aphrody` et
`linux-aphrody-v3` (hôtes VM/metal, jamais dans l'image).

**Dépôt signé** : `aphrody-packages.yml` (`aphrody/scripts/publish.ts build|index`, abuild dans `alpine:3.24`,
x86_64 + aarch64) publie chaque `.apk` dans la release `aphrody-3.24-<arch>`. Un job par plafond de 6 h :
`build <arch>` (userland, `ORDER` : toolchains, `aphrody-libc`, `sudo-rs`, `aphrody-sysctl`, bun, n2b, aphrody,
méta), un job `kernel` par saveur × arch (`APHRODY_KERNEL_FLAVOR=aphrody|aphrody-v3`, l'APKBUILD ne construit
que celle-là), puis `index <arch>` seul à signer `APKINDEX.tar.gz` (secret `APHRODY_ABUILD_KEY`) sur tous les
`.apk` publiés. Paquets déjà publiés sautés (reprise après le plafond). apk 3 lit
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
`export` persistants entre lignes (`ShellSession`) ; erreur de syntaxe = 2, script introuvable = 127 ; `--root` passe par
`crate::elevate` : déjà root/Administrateur → exécution sur place, sinon ré-exécution du fichier `bunsh` (argv0 ou
`PATH`) via `sudo -n` (`execv`, Unix) ou sudo Windows/UAC (code de sortie relayé), échec d'élévation = 126. Tests :
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
bunsh, aphrody, n2b, `aphrody-bun-build-deps` (LLVM 23, rust nightly via `BUN_TOOLCHAIN_RUST`), nodejs (act),
fragment U3 intégré (`sudo-rs`, `sudo-rs-su`, `aphrody-sudoers`, `aphrody-sysctl`, utilisateur `builder` du groupe
`aphrody`, vérifié par `sudo -n` et `bunsh --root`) ; `OPTIONAL_PACKAGES` (`aphrody-libc-dev`,
`aphrody-libc-preload`). Remplace `aphrody/build-alpine:3.24`
(`alpine.Dockerfile` supprimé) dans `tmux.ts`, `.actrc`, `aphrody-linux-build.yml`. `aphrody-alpine-image.yml` publie
`ghcr.io/aphrody-labs/alpine:3.24` (amd64 + arm64) et `aphrody-alpine-rootfs-<arch>.tar.gz` (release `alpine-3.24`).

⏳ Reste (passe finale) : `abuild checksum` d'`aphrody`, `rust-nightly`, `rust-stable` ; release du fork Bun
contenant bunsh puis bump du paquet `bun` (l'image vérifie `bunsh -c 'exit 0'`) ; premier run complet
d'`aphrody-packages.yml` (dont les 4 jobs noyau) puis d'`aphrody-alpine-image.yml` ; builtins POSIX manquants de
bunsh ; `bun bd test test/js/bun/shell/exec.test.ts` en root (le test `--root` est sauté hors root).

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

**Demandé par V** (2026-10-09) :

- `_fork_commit` : `aphrody-bun` est publiée, HEAD `47f637c546bf4bb274c7149815ed66d748e4f325` (3 commits sur
  linux-lts 6.18.55).
- `bun.config` : `CONFIG_BUN_ACCEL=m` (dépend de `RUST=y`, déjà demandé). Pour l'initramfs de V (c), vérifier que
  `BINFMT_SCRIPT=y`, `DEVTMPFS=y`, `BLK_DEV_INITRD=y` et `RD_GZIP=y` restent actifs (valeurs de lts).
- `aphrody-sysctl` : `bun_accel` dans `/etc/modules-load.d/aphrody.conf`, et une règle mdev
  `bun_accel root:root 0666` (`/etc/mdev.conf` ou `/lib/mdev/`). Le 0666 est sûr, revue de sécurité de V (ci-dessous) :
  le pilote n'agit qu'avec les droits de l'appelant.
- `check-config.ts` : ajouter `BUN_ACCEL` à la liste contrôlée.

### V. bun:ffi, TinyCC et noyau `aphrody-labs/linux` (🔄 code écrit le 2026-10-09, ni build ni test)

**1. bun:ffi et C** (`fd9f482740d`). Limites relevées et corrigées dans le cœur :

| Limite                                                                 | Correctif                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Trampolines `cc()` sans contrôle de type ; argument manquant lu hors du cadre | chaque argument est vérifié, absent = `undefined`, sinon `ERR_INVALID_ARG_TYPE`                    |
| `ptr` n'acceptait que des nombres                                      | TypedArray, ArrayBuffer, `CString`/`JSCallback` (`.ptr`), number, bigint, null                     |
| `cc()` sans source en ligne, `flags` remplaçait les défauts            | option `code`, les flags chaîne s'ajoutent aux défauts                                             |
| Pas de `<stdatomic.h>` ni de `<float.h>`                               | en-têtes livrés (`ffi-stdatomic.h`, `ffi-float.h`) + helpers `__atomic_*` façon libatomic          |
| libc introuvable sur musl                                              | recherche dans `/usr/lib`                                                                          |
| Diagnostics C perdus                                                   | `error.errors` = `{ file, line, severity, message }`                                               |
| `dlopen()` sans struct/union par valeur, sans variadiques ni `long double` | shim TinyCC compilé avec le prototype exact ; structs imbriquées, champs tableau, `fixedArgs`, layouts exposés |

Tests ajoutés dans `test/js/bun/ffi/cc.test.ts`, `ffi.test.js` (+ `ffi-abi-fixture.c`) et la fixture bun-types.

**2. TinyCC** (`efde885acc9`) :

- `patches/tinycc/c23-std.patch` : `-std=c99/c17/c23` (et `gnu*`) règlent `__STDC_VERSION__` ; macros C23
  (`bool`, `nullptr`, `static_assert`…) ; `__STDC_NO_ATOMICS__` n'est plus prédéfini.
- aarch64 : déjà construit (`arm64-gen/link/asm.c`). En-têtes musl : ceux du système, libc trouvée dans `/usr/lib`.
- **Pas de fork tinycc** : deux patches courts sur `oven-sh/tinycc`, appliqués par `scripts/build/deps/tinycc.ts`.
- Cache d'objets : non implémenté. Conception retenue : clé = wyhash(source + flags + symboles + version tinycc +
  arch), image relogée `tcc_relocate` stockée sous `$BUN_INSTALL/cache/cc/<clé>` ; à reprendre si `cc()` au
  démarrage pèse dans la garde O.

**3. Noyau** — fork `aphrody-labs/linux`, branche `aphrody-bun` (`C:\linux`), sur linux-lts 6.18.55 d'Alpine
(`1d842f9dd`). checkpatch : 0 erreur, 0 avertissement sur les 3 commits ; `Signed-off-by: aphrody-dev`.

- (a) API utilisateur, dans `bun:linux` sans doublon avec l'existant (`7a14aa1f99a`, `14ade19f275`) :
  - `seccomp` : `filter({ deny, errno, action, mismatch })` produit le cBPF (contrôle d'arch, garde x32),
    `setFilter`, `actionAvailable`.
  - `perfEvent` : `open(options)` (perf_event_attr de 128 octets), `ioctl`, `read`.
  - `bpf` : maps (create/lookup/update/delete/nextKey), `progLoad` avec journal du vérifieur, `pin`/`get`.
  - `netlink` : `encode`, `parse`, `request` (dump avec `NLM_F_DUMP`, erreurs en errno).
  - `reapOrphans(exclude?)` : attend les zombies hérités par un subreaper ou PID 1.
  - io_uring et landlock étaient déjà là (U3).
- (b) Module Rust `drivers/misc/bun_accel.rs` (`/dev/bun_accel`, `CONFIG_BUN_ACCEL`, ioctl `0xB9`) :
  `BUN_ACCEL_IOC_COPY_BATCH` copie jusqu'à 1024 fichiers par appel. Résolution sous le répertoire (`file_open_root`,
  `..` ne sort pas), destination `O_EXCL|O_NOFOLLOW`, `vfs_copy_file_range` (reflink sur le même FS), repli
  `COPY_FILE_SPLICE` en `EXDEV`, résultat par entrée, arrêt sur signal. Selftests
  `tools/testing/selftests/bun_accel`. Côté Bun (`1e76474491a`) : `bun_sys::bun_accel` et `FileCopier`
  (install isolée, backend copyfile) regroupent les fichiers ; une entrée refusée repasse par le chemin par fichier.
  Gain attendu : ~7 syscalls par fichier → 1 ioctl par 1024 fichiers. Non mesuré.
- **Revue de sécurité** (périphérique en 0666, 2026-10-09) : pas d'élévation de privilèges, le mode 0666 reste.
  - Ouvertures : `file_open_root` → `path_openat` dans le contexte de l'appelant (`current_cred()`) : droit de
    recherche sur chaque répertoire, `may_open`, LSM `security_file_open`, protections des répertoires sticky,
    umask. Détenir un fd de répertoire ou du périphérique ouvert par root ne donne aucun droit.
  - Copie : `vfs_copy_file_range` / `vfs_clone_file_range` seulement ; `generic_file_rw_checks` exige
    FMODE_READ (source `O_RDONLY`) et FMODE_WRITE (destination `O_WRONLY`) ; `rw_verify_area` (LSM),
    RLIMIT_FSIZE, `file_start_write` ; quotas imputés par le système de fichiers.
  - Bornes : au plus 1024 entrées, chaque structure lue à sa taille exacte, noms copiés dans un tampon PATH_MAX
    (`ENAMETOOLONG` si tronqué), adresses calculées en `checked_*`.
  - Liens : `O_NOFOLLOW` sur le dernier composant ; `..` et liens absolus s'arrêtent au répertoire. Contrairement
    à `RESOLVE_IN_ROOT`, un renommage concurrent peut faire sortir la résolution ; ce confinement n'est donc pas une
    frontière de sécurité, la résolution n'atteint que ce que l'appelant peut ouvrir.
  - Corrigé pendant la revue : source ouverte en `O_NONBLOCK` et limitée aux fichiers réguliers (FIFO, périphériques
    → `EINVAL`), vérification des signaux dans la boucle de copie, additions d'adresses vérifiées.
  - Selftests ajoutés : `unprivileged_user_cannot_write_root_files` (enfant passé en nobody, fds hérités de root :
    source 0600 → `EACCES`, répertoire root → `EACCES`, fichier root existant → `EEXIST`, rien d'écrit) et
    `special_files_are_rejected`.
- (c) `scripts/aphrody/initramfs.ts` : initramfs newc gzip avec `/bin/bun`, son interpréteur ELF et ses
  `DT_NEEDED` (pris dans `--sysroot`), `/init` = `initramfs-init.ts` transpilé derrière `#!/bin/bun` : monte
  proc/sys/devtmpfs/devpts/run/tmp, lance la charge de `/etc/bun-init.json`, récolte les orphelins, puis
  `reboot(RB_POWER_OFF)`. Usermode helper : rien à patcher, `core_pattern=|/bin/bun …` ou `modprobe` pointent déjà
  vers n'importe quel exécutable.
- (d) Patchs ciblés : seul `rust: helpers: add file_user_path()`. Config et sysctl relèvent de U3 (demandes
  ci-dessus). Candidat suivant : `uring_cmd` pour `bun_accel` (lots asynchrones via io_uring).

**Passe finale** (Docker local, pas le VPS) :

```sh
bun bd test test/js/bun/ffi/cc.test.ts
bun bd test test/js/bun/ffi/ffi.test.js
bun bd test test/js/bun/linux/linux.test.ts
bun bd test test/cli/install/isolated-install.test.ts
bun test test/integration/bun-types/bun-types.test.ts
bun run rust:check-all
# C:\linux, conteneur Alpine 3.24 (clang/lld/rust 1.96.1, rust-bindgen) :
make LLVM=1 rustavailable && make LLVM=1 defconfig && scripts/config -e RUST -m BUN_ACCEL && make LLVM=1 olddefconfig
make LLVM=1 -j12 && make LLVM=1 headers_install
make LLVM=1 -C tools/testing/selftests TARGETS=bun_accel run_tests   # sur une VM avec bun_accel chargé
# initramfs, sur une VM qemu :
bun scripts/aphrody/initramfs.ts --bun build/release/bun --sysroot <rootfs alpine> --out build/initramfs.cpio.gz
qemu-system-x86_64 -kernel arch/x86/boot/bzImage -initrd build/initramfs.cpio.gz -append console=ttyS0 -nographic
```

⏳ Reste : passe finale ; mesure de `bun install --linker isolated` avec et sans `/dev/bun_accel` ; cache d'objets
`cc()` ; `uring_cmd`. Points à risque à la compilation : signatures JSC des nouvelles fns, bindings Rust noyau
(`bindings::file_user_path`, accès `f_inode->i_mode`, `COPY_FILE_SPLICE`), emprunts dans `FileCopier`.

### X. WebOS en WebAssembly : Bun, Aphrody et Aphrody Alpine dans le navigateur (🔄 code écrit le 2026-10-09, ni build ni test)

Cible : `aphrody webos` (C:\aphrody\apps\web), sans xterm, sans couche shell et sans émulation d'OS (ni qemu-wasm, ni
container2wasm). Les apps appellent des modules wasm par des API typées. Le build wasm (`bun build --target=wasm`,
loader `.rs`/Cargo.toml) est le chantier Y. X rend les crates compilables et fait l'intégration WebOS.

**Décisions**

| Question | Choix | Raison (sources : recherche du 2026-10-09, liens dans « Existant réutilisé ») |
| --- | --- | --- |
| JS de Bun dans la page | API Bun (`Bun.*`, puis `node:*` et `bun:test`) **sur le moteur JS de la page**. La logique vient des crates Rust de Bun compilées en wasm. | JSC.js, le seul JSC compilé en wasm, est abandonné depuis 2021 et pèse ~4 Mo compressé. CLoop n'a pas de JIT et obligerait à recompiler toutes les liaisons C++, avec deux moteurs dans la page. Edge.js (Wasmer, 2026) montre qu'une API Node posée sur un moteur hôte suffit (3592/3626 tests Node, chiffre de seconde main). JSC CLoop en wasm est reporté. |
| Cible des crates Bun | `wasm32-wasip1-threads` (C ABI, réacteur WASI) | bun_core et bun_threading supposent des threads. mimalloc, simdutf et highway ont des backends wasm. Côté page, le shim WASI est browser_wasi_shim, qui ne gère pas les threads : `thread-spawn` renvoie -1, ce qui suffit tant qu'aucun appel ne crée de thread. |
| Cible des crates Aphrody | `wasm32-unknown-unknown` + wasm-bindgen | Déjà en place (aphrody-command-wasm, shell-web, dragon-pixel-wasm), avec `[profile.wasm-release]` et `wasm-package.ts`. |
| Alpine, phase 1 | Seed de rootfs Aphrody Alpine 3.24 dans l'image APFS1 sur OPFS. Outils en modules wasm, arch apk `wasm32`. | Pas besoin de noyau pour avoir des fichiers, des processus (Workers) et des apps. Les apk x86_64 ne tournent pas en WASI : il faut un dépôt `aphrody-3.24-wasm32`. |
| Alpine, phase 2 | Noyau Linux wasm : tombl/linux, puis le rebase 7.0 et le wasm64 de joelseverin/linux-wasm | tombl/linux est le plus actif (SMP sur Workers, virtio-blk). Les deux sont NOMMU et expérimentaux. Partir de la branche aphrody-bun de C:\linux (6.18) serait un retour en arrière : il faut suivre 7.0. busybox et sudo-rs n'ont de sens qu'au-dessus de ce noyau. |
| Réseau | Relais par le serveur Bun d'Aphrody : `/api/webos/fetch` et WebSocket vers TCP `/api/webos/tcp`. Boucle locale seule par défaut (`WEBOS_NET_ALLOW`). | Une page ne peut pas ouvrir de socket. Étape suivante : parler WISP (spec ouverte, `wisp-mux` MIT) pour être compatible avec @wasmer/sdk et epoxy-tls. |
| Stockage | Image APFS1 existante (`opfs.rs` de crates/shell/web, 80 Mio) sur deux slots OPFS, via sync access handle | `createSyncAccessHandle` est standard (Chrome 102, Firefox 111, Safari 15.2) et s'utilise dans un Worker. SQLite viendra plus tard via sqlite-wasm-rs `sahpool`. |

**Existant réutilisé**

| Besoin | Brique retenue | Lien | Licence | État 2026 | Reste pour nous |
| --- | --- | --- | --- | --- | --- |
| Shim WASI pour le navigateur | browser_wasi_shim 0.4.2 (dans le lockfile) | github.com/bjorn3/browser_wasi_shim | MIT OR Apache-2.0 | Utilisable. preview1 partiel, sans threads (#46), OPFS fichier par fichier (#32). | Glue `bun-wasm.ts` : mémoire partagée importée, `thread-spawn` factice |
| Sandbox WASIX complète (option) | @wasmer/sdk 0.19.1 | github.com/wasmerio/wasmer-js | MIT modifiée : mention Wasmer obligatoire au-delà de 1 M MAU | Actif | À évaluer si les threads WASI deviennent nécessaires |
| Composants WASI P2 (option) | jco 1.37 + preview2-shim | github.com/bytecodealliance/jco | Apache-2.0 WITH LLVM-exception | Partiel dans le navigateur | Rien tant qu'on reste en wasm-bindgen / preview1 |
| Polyfills `node:*` | unenv (utilisé par Nitro et Cloudflare) | github.com/unjs/unenv | MIT | Actif | Brancher sur `bun-api.ts` |
| Coreutils WASI | uutils/coreutils (CI officielle wasip1/wasip2, `feat_wasm`). Aussi `wasmer/coreutils` 1.0.27 dans le registre Wasmer. | github.com/uutils/coreutils | MIT | Actif | Empaqueter en apk `wasm32` |
| Noyau Linux wasm | tombl/linux (branche `wasm`) + joelseverin/linux-wasm (7.0, wasm64) | github.com/tombl/linux · github.com/joelseverin/linux-wasm | GPL-2.0 | Expérimental | Phase 2 : fork aphrody-labs, initramfs Aphrody |
| busybox / musl wasm | Ports de tombl et de linux-wasm (musl 1.2.5, busybox 1.36.1) | idem | GPL-2.0 / MIT | Expérimental, liés au noyau wasm | Phase 2 |
| libc WASI | wasi-libc (musl 1.2.6), wasi-sdk 34 | github.com/WebAssembly/wasi-libc | MIT/Apache | Production | build.rs des crates `-sys` de Bun, gardés par `target_family = "wasm"` |
| Persistance | OPFS sync access handles + image APFS1 d'Aphrody | MDN | Standard | Standard | Rien : réutilisé tel quel |
| SQLite | rusqlite ≥ 0.38 (wasm32-unknown via sqlite-wasm-rs, VFS `sahpool`) | crates.io/crates/sqlite-wasm-rs | MIT | Actif, mono-thread | Features wasm pour aphrody-store, memory et fsindex |
| HTTP Rust | reqwest 0.13 (fetch sur wasm32-unknown) | docs.rs/reqwest | MIT/Apache | Production, mais sans blocking, cookies ni timeout | Crates Aphrody « à adapter » : `default-features = false` côté wasm |
| tokio | tokio 1.53, seulement `rt`, `sync`, `time`, `macros` et `io-util` | docs.rs/tokio | MIT | Expérimental sur wasm | cfg par crate : `net`, `process`, `fs` et `signal` hors wasm |
| Git | Sous-crates gix testées en CI wasm (gix-pack, gix-url…). `gix` complet n'est pas testé. | github.com/GitoxideLabs/gitoxide | MIT/Apache | Partiel | aphrody-git en lecture seule via les sous-crates |
| TLS | rustls 0.23 + `ring`. rustls-rustcrypto est marqué « do not use in production ». | github.com/rustls/rustls | Apache/ISC/MIT | Production. ring sur wasm32-unknown non vérifié. | TLS terminé côté serveur Bun tant que ring wasm n'est pas vérifié |
| Relais réseau | WISP (`wisp-mux` 6.0, epoxy-server). wstcp sert de modèle simple. | github.com/MercuryWorkshop/epoxy-tls | MIT | Actif | Relais Bun écrit (`server-routes.ts`) ; WISP à suivre |
| Écartés | WebContainers (licence commerciale), Nodebox (Sustainable Use License, abandonné), JSC.js (abandonné), LKL (aucun port wasm), container2wasm et qemu-wasm (émulation, hors cible), warg (archivé), websockify (LGPL), wisp-server-node (AGPL) | — | — | — | — |

**Matrice crates/packages → wasm**

Premier passage statique de `scripts/webos/wasm-inventory.ts`, à confirmer par `cargo check --target`. Aphrody : 189
crates (48 OK, 110 à adapter, 31 impossibles) et 30 packages (10 OK, 13 à adapter, 7 impossibles). Pour la matrice
complète : `bun scripts/webos/wasm-inventory.ts --md <fichier>` dans C:\aphrody.

| Groupe | Statut | Crates / packages | Raison, action |
| --- | --- | --- | --- |
| Aphrody pur Rust | OK | agent-home, config, models, patch, prompts, providers, rag-core, toolcall(-repair), tools, translate-core, command-pure, command-wasm, re, sandbox, proc, capture, guard, shell-vfs, shell-web, shell-session, terminal-core, a2a-ui, gui-core, identity, m3-tokens, softraster, sprite-sheet, svg, taffy, dragon-pixel-*, obscura-dom, obscura-ssrf, web-extract | Exposés via wasm-bindgen. `aphrody-webos-wasm` agrège vfs, re et patch. |
| Aphrody réseau/async | À adapter | mcp-client, model-client, firefly, mcp-oauth, engine, llm-infra, rollout, ocr-vlm, gateway, jev… Dépendances en cause : tokio (61 crates), reqwest (34), chrono (22), rustls (14), uuid (14), dirs (12). | Features wasm : reqwest via fetch, tokio réduit, `chrono/wasmbind`, `uuid/js`, chemins injectés au lieu de `dirs` |
| Aphrody données | À adapter | memory, store, fsindex, code-graph, embed, context, bun-docs, git, kernel | rusqlite → sqlite-wasm-rs `sahpool`. tree-sitter → wasi-sdk ou web-tree-sitter. tokenizers avec `unstable_wasm`. gix en sous-crates. |
| Aphrody hôte natif | Impossible | agent-runtime, agent-tools, app-server, mcp (tokio-postgres, serveur), rag et rag-eval (Postgres), ocr et ocr-onnx (ort), aphrody-rust et yolo-pyo3 (pyo3), diffusion, llama, torch et ml-runtime (libloading, C++), term et terminal-backend (PTY), shell-tauri, tauri-cli, tauri-bundler, create-app, aphrody-app, obscura-browser, obscura-cdp, obscura-js (deno_core), obscura-mcp, web-engine, web-index (memmap2), web-service | Restent côté serveur. Le WebOS les appelle par le relais du serveur Bun. |
| Packages Bun | OK | cli-wasm, shell-web, inference, plugins, paths, winclean, web-test, fuzzy, http, qr | Importables dans la page |
| Packages Bun | À adapter ou impossible | rag-core, yolo-core, runtime-sdk, workspace, @aphrody/bun, a2a, os (bun:ffi, napi, Bun.spawn, Bun.serve, bun:sqlite) | n2b : napi-rs → `wasm32-wasip1-threads` + @napi-rs/wasm-runtime (oxc le fait déjà) |

Bun (C:\bun, 103 crates). Le passage statique sous-estime les blocages, ceux-ci ont été relevés à la main :

| Crate(s) | Statut | Raison, action |
| --- | --- | --- |
| bun_semver, bun_shell_parser, bun_md | OK via `bun_wasm` | Exposés dès maintenant par `src/wasm` |
| bun_core, bun_alloc | À adapter | Trois dépendances C/C++ : `bun_mimalloc_sys` (mimalloc gère WASI), `bun_simdutf_sys` (simdutf a un backend wasm SIMD128) et `bun_highway` (71 fonctions extern, C++ dans `highway_*.cpp` ; Highway a une cible WASM). Soit build.rs avec wasi-sdk sous `target_family = "wasm"`, soit un repli scalaire en Rust. |
| bun_sys, bun_paths | À adapter | `bun_windows_sys` tire libuv : à garder sous `cfg(windows)`. Des reliquats de l'époque Zig existent déjà : Futex `wasm_impl`, `MAX_PATH_BYTES` à 1024, OS Wasm dans `env.rs`. |
| bun_js_parser, bun_js_printer, bun_transpiler | À adapter | Tirent uws_sys, boringssl_sys, io, crash_handler et zlib. Ajouter des features pour couper ces dépendances, puis exposer `bun_wasm_transpile` (W2). |
| bun_css, bun_sourcemap, bun_resolver | À adapter | Mêmes dépendances bun_core/bun_sys. Le resolver travaillera sur la VFS du WebOS. |
| bun_bundler, bun_install | À adapter (tard) | event_loop, uws, http : threads WASI + relais réseau |
| bun_jsc, bun_runtime, uws, boringssl, http, sql | Impossible (par choix) | Moteur JSC et I/O natifs, remplacés par le moteur de la page et le relais serveur |

**Fait (commits)**

- C:\bun `c4d7ca9c410` : crate `bun_wasm` (`src/wasm`). C ABI `bun_wasm_alloc/free/version/semver_order/semver_satisfies/shell_parse/markdown_html`, résultats packés `ptr << 32 | len` avec un octet de statut. Profil `[profile.wasm]`, script `rust:check-wasm`, tests Rust dans `lib.rs`.
- C:\aphrody `0d6c3444b8` : crate `aphrody-webos-wasm` (VFS APFS1/OPFS, `triage`, `strings`, `applyPatch`, `unifiedDiff`).
  apps/web `src/os/wasm/` : protocole, worker fichiers à deux slots OPFS, table de processus, loader bun_wasm, API `Bun` sur le moteur de la page, worker REPL, relais réseau.
  Apps Fichiers, Processus, Bun REPL et Outils Aphrody. Seed rootfs (`scripts/webos/rootfs-seed.ts`), inventaire (`scripts/webos/wasm-inventory.ts`) et test (`scripts/webos/webos.test.ts`).
- C:\aphrody `09de3ab719` : `@bjorn3/browser_wasi_shim` ajouté au lockfile.

**Étapes ordonnées**

1. ⏳ Brancher les apps dans le bureau. `server.ts`, `DesktopOS.tsx`, `Dock.tsx` et `types.ts` appartiennent à agy et n'étaient pas commités au moment du lot : le diff à appliquer est noté ici.
   - Importer `WASM_APPS` et l'ajouter à `AppId`, à `DOCK_ITEMS` et au rendu.
   - Appliquer `withIsolation()` à chaque réponse.
   - Appeler `handleWebOsNet()` avant les autres routes.
   - Ajouter `webosTcpSocket` dans `websocket`.
2. ⏳ Passe finale (commandes ci-dessous) et corrections de compilation de `bun_wasm` et `aphrody-webos-wasm`.
3. ⏳ Couper les dépendances C de bun_core pour wasm (mimalloc, simdutf, highway via wasi-sdk ou repli). Puis `bun_js_parser` + `bun_transpiler` → `bun_wasm_transpile`, et `Bun.Transpiler` dans `bun-api.ts`.
4. ⏳ Adapter les crates Aphrody « à adapter » par lots de domaine : memory et store via sqlite-wasm-rs, mcp-client et model-client via reqwest fetch. Les exposer dans `aphrody-webos-wasm` (scan, docs, memory, parse, rename).
5. ⏳ n2b : napi-rs → `wasm32-wasip1-threads` + @napi-rs/wasm-runtime.
6. ⏳ aports :
   - arch `wasm32` et release `aphrody-3.24-wasm32` (uutils coreutils, modules WebOS) ;
   - lien `aphrody-mcp` ;
   - apk en wasm limité à `noarch` + `wasm32`.
7. ⏳ `node:*` via unenv dans `bun-api.ts` ; relais WISP.
8. ⏳ Phase 2 : fork de tombl/linux chez aphrody-labs, avec le rebase 7.0 de linux-wasm. initramfs Aphrody avec busybox, et sudo-rs sur le noyau wasm.

**Commandes de passe finale**

```sh
# Bun (C:\bun)
cargo test -p bun_wasm
bun run rust:check-wasm
cargo build --target wasm32-wasip1-threads -p bun_wasm --profile wasm
#   -> target/wasm32-wasip1-threads/wasm/bun_wasm.wasm, à copier dans C:\aphrody\apps\web\dist\wasm\bun\

# Aphrody (C:\aphrody)
cargo test -p aphrody-webos-wasm
bun build --target=wasm crates/web/webos-wasm/Cargo.toml --outdir apps/web/dist/wasm/webos
bun build --target=wasm crates/infra/aphrody-command-wasm/Cargo.toml --outdir apps/web/dist/wasm/cli
#   repli tant que Y n'a pas fini :
bun scripts/build/rust/wasm-package.ts --crate aphrody-webos-wasm --out apps/web/dist/wasm/webos
bun scripts/build/rust/wasm-package.ts --crate aphrody-command-wasm --out apps/web/dist/wasm/cli
bun scripts/webos/rootfs-seed.ts
bun test scripts/webos/webos.test.ts
bun run --cwd apps/web build

# Noyau wasm (phase 2, Docker local)
git clone https://github.com/joelseverin/linux-wasm && cd linux-wasm && ./linux-wasm.sh all

# Scénario WebOS de bout en bout
aphrody webos            # http://localhost:3000 ; dans la console, crossOriginIsolated === true
# Fichiers : /home/aphrody/README.md présent ; créer, renommer, supprimer ; recharger la page -> persistant (OPFS)
# Fichiers : « Analyser » sur un binaire déposé -> rapport triage JSON
# Bun REPL : Bun.version ; Bun.semver.satisfies("1.4.0", "^1.2") -> true ; Bun.markdown.html("# a") ;
#            Bun.shellParse("echo hi | wc -c") ; await Bun.write("x.txt", "hi") puis Fichiers montre x.txt
# Processus : files et bun-repl listés ; kill bun-repl -> le worker disparaît
# Outils Aphrody : « text --help » -> sortie de aphrody pure
```

**Risques**

- `bun_wasm` tire `bun_core`, donc mimalloc, simdutf et highway en C. `rust:check-wasm` échouera tant que l'étape 3 n'est pas faite : c'est le premier blocage attendu.
- La mémoire partagée importée (512 pages initiales, 1 Gio max) doit correspondre à celle que déclare le module.
- `thread-spawn` est factice.
- `bun build --target=wasm` (chantier Y) n'est pas encore livré.
- Le Cargo.lock d'Aphrody est à régénérer : un autre agent l'avait modifié sans le commiter au moment du commit.
- Rien n'a été compilé ni testé.

### W. Arène reproductible et écarts du cœur JSC (🔄 code écrit le 2026-10-09, ni build, ni test, ni banc)

Objectif : mesurer le fork contre l'amont (bloquant) et contre Deno 2.9.7 épinglé (informatif) selon la méthode du banc
(`C:/aphrody/docs/plans/fusion/bench/METHOD.md`, C1 à C14), et fermer dans le cœur les écarts JSC relevés par ce banc.

**1. Arène** (`e97cab02b3f`) : `bench/aphrody/arena/`.

- `shared/*.mjs` : charges identiques octet pour octet sous Bun et Deno, PRNG à graine fixe, sommes de contrôle.
  Voie moteur : `startup` (S1), `compute` (nbody, fannkuch, collections, texte, tri ; E1), `json` (E2). Voie runtime
  (R1, jamais décisive pour #8) : `realm` (S3, S4 avec et sans `cachedData`), `serve`, `fetch` (pair fixe lancé avec le
  fork), `sqlite` (`bun:sqlite` / `node:sqlite`), `gzip` (`CompressionStream`), `ffi` (`abs` de la libc).
- `arena.ts` : processus frais entrelacés (A, B, C puis C, B, A), `nice -n 10`, 1 appel à froid rapporté à part,
  ≥ 10 échauffements, VmHWM lu dans l'enfant, verrous testés par `flock -n`, sha256 des binaires et des sources avant
  et après, Deno vérifié contre `deno.pin.json`, sondes P1 à P5, statistique par processus (test exact de somme des
  rangs), verdict `valide`/`indicatif`/`invalide`/`à reproduire`, JSON brut au format §6 dans `results/`.
  `--profiles` ajoute des cibles `fork@<profil>` (`profiles.json`, variables `BUN_JSC_*`). `--container alpine|ubuntu`
  relance la même commande dans le conteneur local de `scripts/aphrody/tmux.ts` et rapatrie le JSON (jamais le VPS).
- `scripts/aphrody/perf-gate.ts --arena` : fork contre amont bloquant (seuils `arena` de `thresholds.json` : ratio
  1,05, différence réelle §3.4, p ≤ 0,05 ; RSS crête + 4 Mio), fork contre Deno en lignes `info`. Tests purs ajoutés à
  `test/internal/aphrody-perf-gate.test.ts`.

**2. Écarts du cœur** (un test chacun, dans le fichier existant) :

| Écart | Commit | Correctif | Test |
| --- | --- | --- | --- |
| a. Locale par défaut (P3) | `efc1be764f0` | Unix : la locale ICU de LC_ALL / LC_MESSAGES / LANG passe à `WTF::overrideUserPreferredLanguages` | `test/js/web/intl/intl.test.ts` |
| b. Limite de tas avec rappel (P1) | `046736e6c49` | `--max-old-space-size` (`HeapLimitObserver`) : sortie fatale 134 sur le fil principal, arrêt du Worker ; `v8.setHeapSnapshotNearHeapLimit`, `heap_size_limit` réel | `test/js/node/v8/v8-module.test.ts` |
| c. Cache de bytecode `vm` (S4) | `1ae176a457e` | `vm.Script` adopte le `cachedData` accepté au lieu de compiler la source d'abord | `test/js/node/vm/vm.test.ts` |
| d. Démarrage, modules internes (C11) | `010b4bcf97d` | `BUN_COMPILE_CACHE_BUILTINS=1` : bytecode des modules internes dans le compile cache | `test/js/node/module/node-module-module.test.js` |
| e. Réglages de calcul | — | aucun défaut changé ; profils candidats dans `profiles.json`, à départager par l'arène | arène `--profiles all` |

Propositions restantes :

- d : un vrai snapshot de démarrage (tas JSC sérialisé, équivalent de `create_snapshot` V8) n'existe pas dans JSC ;
  il demande un patch du chantier P. D'ici là, activer `BUN_COMPILE_CACHE_BUILTINS` par défaut seulement si l'arène
  montre un gain S1 sans perte de RSS (règle O).
- e : un profil `BUN_JSC_*` ne devient défaut que s'il gagne sur E1 sans dégrader `startup.wall` ni `startup.hwm`
  (règle O) ; sinon il reste documenté comme réglage par charge.
- b : P1 au sens strict (le processus survit, le contexte suivant évalue `1+1`) demande un rappel de limite par realm
  côté hôte Obscura, hors CLI.

**Passe finale** (dans cet ordre ; rien n'a encore tourné) :

```sh
bun bd
bun bd test test/js/node/vm/vm.test.ts -t "cachedData"
bun bd test test/js/web/intl/intl.test.ts
bun bd test test/js/node/v8/v8-module.test.ts
bun bd test test/js/node/module/node-module-module.test.js -t "BUN_COMPILE_CACHE_BUILTINS"
bun bd test/js/node/test/parallel/test-compile-cache-api-success.js
bun bd test/js/node/test/parallel/test-compile-cache-success.js
bun test test/internal/aphrody-perf-gate.test.ts
bun run rust:check-all
# arène, conteneur Ubuntu 26.04 local (glibc des hôtes, binaire Deno gnu) ; volume aphrody-src-ubuntu
bun scripts/aphrody/tmux.ts run arena-prep --ubuntu --sync -- "bun run build:release && mkdir -p tmp/arena && cd tmp/arena && curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip && unzip -oq bun-linux-x64.zip && curl -fsSLO https://github.com/denoland/deno/releases/download/v2.9.7/deno-x86_64-unknown-linux-gnu.zip && unzip -oq deno-x86_64-unknown-linux-gnu.zip"
bun scripts/aphrody/tmux.ts wait arena-prep
bun bench/aphrody/arena/arena.ts --container ubuntu --bun build/release/bun --upstream tmp/arena/bun-linux-x64/bun --deno tmp/arena/deno --gate
bun bench/aphrody/arena/arena.ts --container ubuntu --bun build/release/bun --only startup,compute,json --profiles all --no-probes --name profiles-e
```

Risques : test `vm` temporel (`fromCache < fresh/2`) ; tests supposant `en-US` sur une machine où `LANG` n'est pas
anglais (`bunEnv` garde `LANG`) ; rappel « proche de la limite » servi à la reprise de la boucle, pas pendant une boucle
synchrone, et limite dure vérifiée après une collection complète seulement ; offset d'entrée 0 supposé pour le bytecode
interne ; `postTaskTo` depuis le fil du GC. Arène : `ffi` et `sqlite` sous Deno dépendent de `node:sqlite` et de
`Deno.dlopen` (`-A`) ; la release `bun-v1.4.3` amont doit exister (sinon prendre la dernière et le noter, C1).

### Z1. yolo rename, parse, docs, bench dans le cœur de Bun (🔄 code écrit le 2026-10-09, ni build ni test)

Bun `ce6bf79b619` : `bun rename`, `bun docs`, `bun parse`, `bun bench` = `src/js/eval/devtools.ts`, démarré comme
`bun -e` par `ToolchainCommand` (`src/runtime/cli/devtools_command.rs`, routage dans `cli/mod.rs`). Un fichier
`<nom>.{ts,js,…}`, `<nom>/index.*` ou un script `package.json` du même nom garde la priorité (`bun bench` = `bun run bench`).
Test : `test/cli/devtools/devtools.test.ts`. Aphrody `90f5899e4d` : yolo appelle `bun <cmd>` (`yolo/src/bun-tools.ts`).

| yolo | Bun | Reste dans yolo (Z2) |
| --- | --- | --- |
| `rename` (core `curation/rename.ts`, supprimé) | `bun rename --from/--to/--rules/--paths/--include/--exclude/--apply/--restore`, journal JSONL v2 identique | préréglage `aphrody`, cible `crates/tauri`, `.cache/rename`, exclusions `audits/`, `.changes/` |
| `parse` | `bun parse <fichiers> [--json] [--md]` (schéma `bun.parse/1`, `Bun.Transpiler.scan`) | `vfs/parse.ts` (NativeTooling) garde l'outil MCP du registre et l'API |
| `docs` | `bun docs [requête] [--dir] [--content] [--print]` : `docs/` local, `$BUN_DOCS_DIR`, sinon l'index `bun.com/docs/llms.txt` | `--dir docs/reference/upstream-bun` |
| `bench` | `bun bench [--iterations]` (schéma `bun.bench/1`) | `--supervisor` ; `sys/benchmark.ts` garde `/api/bench` |

Reste à Z2 dans yolo : status, generate, web/desktop/tauri, version/doctor, train, ai/tool, mcp, api/serve,
runtime/upgrade/uninstall/desktop-runtime, awesome, import, plugin, vu, py/python/uv, infra/workflow/git/ssh/ship/hooks,
ops/workspace/optimize/update/google/doc-ai/browser/forge/m3, host, n2b (scan/verify/create : Y).
Passe finale : `bun bd test test/cli/devtools/devtools.test.ts` ; côté Aphrody, avec le Bun du fork sur PATH,
`bun test packages/engine/yolo/test/rename.test.ts packages/engine/yolo/test/cli_app.test.ts` et
`bun scripts/tools/cli-help-sync.ts` (aide `yolo rename -h` changée). Risque : un Bun amont sur PATH lit `bun rename`
comme un script introuvable.

### Z2. yolo fusionné dans un CLI et une FFI Aphrody uniques (🔄 code écrit le 2026-10-09, ni build ni test)

Dépôt `C:\aphrody` (aphrody-labs/aphrody). Z1 garde rename, parse, docs Bun, bench (et L/Y : lint, scan, verify, create).
Commits : `be449b3975` (aphrody.h unique), `7862f46c00` (pont Bun du binaire), `936b263411` et `16543f2fd6`
(lanceur `bin/aphrody.ts` réduit). `multicall/bun_bridge.rs` est entré dans `8925b0edaf` (commit d'agy).

**FFI** : `crates/interop/ffi/include/aphrody.h` est le seul en-tête de `aphrody_ffi` (`aphrody_*`, `yolo_*`,
`bun_rs_*`), `APHRODY_HEADER_VERSION 2u`. `yolo_runtime.h` est supprimé ; l'artefact de release garde un
`yolo_runtime.h` qui inclut `aphrody.h`. Gardes : `header-drift.test.ts`, `runtime-ffi.test.ts` (arité SDK = en-tête),
`yolo-runtime` (`include_str!` sur aphrody.h), loader Python (accepte les deux noms).

**CLI** : le binaire Rust `aphrody` sert tout. Les commandes à propriétaire Bun passent par `bun_bridge` :
`bun <checkout>/packages/engine/yolo/src/index.ts <cmd>` (checkout : `APHRODY_ROOT`, ancêtres de l'exe ou du cwd,
`~/aphrody`, `C:\aphrody`), avec `APHRODY_BIN` = l'exe courant. Invoqué sous le nom `yolo`, le binaire se comporte
comme `aphrody`.

Arbre cible, premier niveau (clap + multi-call) :

```
aphrody  ai shell(sh) tui voice native os web(webos) term search google translate n2b ssh git mcp discord
         ingest docs awesome re forensics index memory model infer job ocr rag gateway config codex
         package runtime scan winclean auto self completions version doctor
         infra ovh kernel wsl backend mcp-server web-engine x embed home graph tauri identity canvas app-server workflow
         # propriétaire Bun (bun_bridge)
         status generate desktop desktop-runtime ffi import plugin py uv vu ship hooks ops workspace optimize
         update browser forge m3 host api tool
aphrody ai  rag model infer voice ocr translate memory gateway train agent status   (agy)
            + doc-ai, tools (à brancher par agy : AiAction -> bun_bridge::dispatch("doc-ai"|"tool", args))
```

Matrice (commande `yolo` → destination → statut) :

| yolo | Destination | Statut |
|---|---|---|
| infra, workflow, ssh | `aphrody infra`, `aphrody workflow`, `aphrody ssh` (Rust) | ✅ code |
| git | `aphrody infra git` (`aphrody git` = git_cmd Rust) | ✅ code |
| mcp | `aphrody mcp` sans argument = serveur `aphrody-mcp` ; avec sous-commande = config clap | ✅ code |
| doctor, version, n2b, awesome, scan, web, tauri, train, ai | Rust du même nom (`train` → `aphrody ai train`, agy) ; `awesome` Rust n'a pas stats/github/check | ✅ Rust gagne |
| google drive\|fonts | `aphrody google drive\|fonts` → bun ; le reste de `google` = Gemini Rust | ✅ code |
| runtime (artefacts FFI) | `aphrody ffi` → bun (`aphrody runtime` reste uv/Python) | ✅ code |
| status, generate, desktop, desktop-runtime, import, plugin, py, uv, vu, ship, hooks, ops, workspace, optimize, update, browser, forge, m3, host, api, tool | même nom → bun (propriétaires TS : Bun.serve, runners en process, tmux/ssh de la fabrique, host.ts 2 700 lignes) | ✅ code |
| python, serve, doc-ai | alias dépréciés (stderr) → `aphrody py`, `aphrody api`, `aphrody ai doc-ai` | ✅ code ; `ai doc-ai` à brancher (agy) |
| ai list\|call | `aphrody tool list\|call` ; `aphrody ai tools` à brancher (agy) | ⏳ |
| upgrade, uninstall | retirés avec la distribution yolo autonome : `aphrody self install-path`, `aphrody package uninstall` | ⏳ suppression TS à la bascule |
| rename, parse, docs, bench | Z1 (fork Bun) ; relais transitoire dans `bin/aphrody.ts` (`Z1_PENDING_COMMANDS`, + create, verify) | ⏳ Z1 |

**Plugin Claude** : `yolo` 2.2.2 fusionné dans `aphrody` 2.3.0 (`C:\Users\aphro\.aphrody\plugins\aphrody`) : 39 skills,
22 agents, hooks (sortie `[aphrody]`), serveurs LSP, reçus amont bun/typescript-go, README → `docs/yolo-toolkit.md`,
licence MIT → `LICENSE-MIT-yolo`. `yolo <cmd>` → `aphrody <cmd>` dans skills et docs. Marketplace `aphrody-user` mise à
jour, plugin installé en 2.3.0. Fin : `claude plugin uninstall yolo@aphrody-user`.

Bascule finale (bloquée par Z1) : `bin/yolo(.cmd)` et `~/.bun/bin/yolo(.cmd)` (aujourd'hui
`bun C:/aphrody/packages/engine/yolo/src/index.ts`) appellent `aphrody` ; `"yolo"` entre dans les liens de
`aphrody self install-path` ; les branches Rust de `index.ts` (infra, workflow, git, ssh, mcp, train, ai, n2b, doctor,
version, upgrade, uninstall) sont supprimées ; les tests qui lancent `./bin/yolo` (scan, ai-adapters, web-command,
workspace_profiles) et `scripts/release/factory-current.sh` (`./bin/yolo verify`) migrent.

Passe finale :

```sh
cd C:/aphrody
cargo check -p aphrody-command -p aphrody -p aphrody-ffi -p yolo-runtime
cargo test -p aphrody-command multicall
cargo test -p yolo-runtime
bun test packages/interop/native/test/header-drift.test.ts packages/interop/native/test/ffi-drift.test.ts packages/engine/runtime/test/runtime-ffi.test.ts scripts/release/runtime-artifact-info.test.ts packages/engine/yolo/test/aphrody-launcher.test.ts
uv run pytest py/packages/aphrody/tests/test_yolo_runtime.py
cargo build --release -p aphrody
target/release/aphrody status ; target/release/aphrody ffi list ; target/release/aphrody google drive --help
target/release/aphrody workflow --help ; target/release/aphrody serve --help ; target/release/aphrody mcp --help
cp target/release/aphrody.exe target/release/yolo.exe && target/release/yolo.exe status
bun bin/aphrody.ts rename --help
```

Risques : `bun_bridge` exige un checkout (binaire installé hors dépôt sans `APHRODY_ROOT` → 127) ; `aphrody awesome`
Rust ≠ yolo awesome ; `ai doc-ai`/`ai tools` annoncés mais pas branchés ; `workflow` et `ssh` doublés (`aphrody infra
workflow`) ; hooks yolo et aphrody actifs deux fois tant que yolo n'est pas désinstallé.

### Y. Bun outil ultime : lint, fmt, n2b/migrate, wasm, create (🔄 code écrit le 2026-10-09, ni build ni test)

Bun : `5d71825be6b` (CLI), `05258490fbe` (tests), `4ba861b7c8b` (create aphrody/), `90482ce997c` (bun:wasm package/artifact),
`7a30918cd08` (docs). Aphrody : `19823fc04e` (verify), `4ff21550d7` (create), `31b72597e9` (wasm-package), `27cfae4196` (renvois docs).

**Cœur** : `src/runtime/cli/toolchain_command.rs` (routage) + script embarqué `src/js/eval/toolchain.ts` (exécuté comme
`bun -e`) + module `bun:wasm` (`src/js/bun/wasm.ts`, types `packages/bun-types/wasm-build.d.ts`). `which()` envoie
lint, fmt, n2b, migrate, wasm vers `Tag::ToolchainCommand` ; `bun build --target=wasm` et `bun create aphrody/…` aussi.

Matrice (source → destination → statut) :

| Source | Destination | Statut |
|---|---|---|
| oxlint / yolo verify (gate lint) | `bun lint` : oxlint + règles n2b, `--fix`, `--format=json\|sarif\|…`, `--since`, `--workspaces/--filter`, `[lint]` bunfig, `.oxlintrc.json` | ✅ code + test |
| oxfmt / yolo verify (gate fmt) | `bun fmt` : `--check`, `--since`, workspaces, `[fmt]` bunfig, `.oxfmtrc.json` | ✅ code + test |
| `aphrody n2b`, bun-plugin-n2b | `bun n2b` (relais), `bun migrate` = `n2b --migrate` | ✅ code + test |
| wasm-pack, `scripts/build/rust/wasm-package.ts` (bindgen, opt, staging) | `bun wasm build`, `bun build --target=wasm`, `bun:wasm` `build/optimize/plugin` (import `Cargo.toml`/`.rs`), WASI p1 (`node:wasi`) et p2 (jco) | ✅ code + test ; wasm-package.ts garde seulement le routage cargo (cloud/Windows/VPS) |
| `packages/engine/core/src/scaffold/create.ts` (compositeur) | `bun create aphrody/<a>+<b>` lit `m3/templates/stack.toml` (required, exclusive, deps) ; create.ts n'est plus qu'un appel | ✅ code + test |
| docs wasm Aphrody (wasm-stack-api-reference, RELEASE-CHECKLIST, CONTAINER, TROUBLESHOOTING, wgpu-webgpu) | renvois vers `docs/bundler/wasm.mdx` ; le reste est propre à Aphrody et y reste | ✅ |
| yolo scan | non repris : scanner VFS, pas un lint | ⏸ décision |
| yolo rename, parse, docs, bench | Z1 | — |

Décisions :
- oxlint/oxfmt **non liés** au binaire (≈ +20 Mo, `oxc_linter` absent de crates.io, > garde de +3 %) : téléchargés à la
  première utilisation par `bun x --bun oxlint@1.87.0` / `oxfmt@0.72.0` (versions de la section L, oxc 0.153.0),
  `node_modules/.bin` prioritaire, `version` surchargeable dans bunfig. Variables de test `BUN_OXLINT/BUN_OXFMT/BUN_N2B`.
- Un script `package.json` du même nom garde la priorité (`bun lint` = `bun run lint`, comme avant) ; à l'intérieur du
  script (`npm_lifecycle_event` = nom) c'est la commande. Les gates d'Aphrody posent `npm_lifecycle_event`.
- Templates : source unique dans Aphrody (`m3/templates`, liés au SDK via `__YOLO__`) ; la composition est dans Bun.
- binaryen (wasm-opt) et wasm-bindgen viennent de PATH ou sont installés une fois dans `$BUN_INSTALL/tools` ; jco par `bun x`.

Risques : aucun build ni test lancé ; Aphrody (verify, create, wasm-package) exige le Bun du fork (Bun 1.4.3 système
n'a pas ces commandes) ; versions oxc suivies à la main (L/Z1) ; licences : binaryen Apache-2.0, jco Apache-2.0 WITH
LLVM-exception, oxc MIT (outils téléchargés, non redistribués) ; premier `bun lint` hors ligne échoue sans cache.

Passe finale :

```sh
cd C:/bun
bun bd --version
bun bd test test/cli/lint/toolchain.test.ts
bun test test/integration/bun-types/bun-types.test.ts
bun run rust:check-all
bun bd lint --help ; bun bd fmt --check docs ; bun bd wasm build --help ; bun bd create aphrody --list
cd C:/aphrody   # avec le bun du fork sur PATH
bun test scripts/build/rust/wasm-package.test.ts packages/engine/yolo/test/stack.test.ts packages/engine/yolo/test/verify.test.ts
```

### C2. Stack Rust 2026 : userland Alpine et bonnes pratiques Cargo de Bun (🔄 code écrit le 2026-10-09, ni build ni test)

Commits : bun `b7b4699725f` (Cargo), aports `e435b369e27` (paquets + CI), aphrody `4d343ff71e` (cible `cli`).
Sous-lot image U1 et plan : voir le log de `scripts/aphrody/aphrody-alpine.Dockerfile`.

**Veille (2026-10-09).** Maturité, musl, présence dans Alpine 3.24 et décision :

| Brique | Version | État | Alpine 3.24 | Décision |
| --- | --- | --- | --- | --- |
| [uutils coreutils](https://github.com/uutils/coreutils/releases/tag/0.12.0) | 0.12.0 | 96,9 % des tests GNU ; défaut d'Ubuntu 26.04 sauf cp/mv/rm (8 courses TOCTOU, audit Zellic : [discourse](https://discourse.ubuntu.com/t/an-update-on-rust-coreutils/80773), [guide](https://computingforgeeks.com/ubuntu-2604-rust-coreutils-guide/)) | community 0.11.0 | amont, base |
| [uutils findutils](https://github.com/uutils/findutils/releases/tag/0.10.0) | 0.10.0 | beta, 84 % des tests GNU de find, archives musl | absent | **aphrody/** |
| [uutils diffutils](https://github.com/uutils/diffutils) | 0.5.0 | diff + cmp seulement | absent | **aphrody/** |
| [uutils procps](https://github.com/uutils/procps), [util-linux](https://github.com/uutils/util-linux) | — | aucune release | absent | écarté |
| [oxidizr](https://github.com/jnsgruk/oxidizr) | 1.1.0 | remplacé par `coreutils-from-uutils` (Ubuntu) | — | sans objet (apk : replaces) |
| [sudo-rs](https://github.com/trifectatechfoundation/sudo-rs/releases) | 0.2.15 | audité, défaut Ubuntu 26.04 ([doc](https://ubuntu.com/server/docs/reference/other-tools/sudo-rs/)) | community 0.2.15 | déjà dans aphrody/ (U3) |
| [ntpd-rs](https://github.com/pendulum-project/ntpd-rs/releases) | 1.9.0 | NTS ; 2.0 en alpha | testing (hors 3.24) | **aphrody/** (depuis edge) |
| [zlib-rs](https://github.com/trifectatechfoundation/zlib-rs/tree/main/libz-rs-sys-cdylib) | 0.6.8 | API zlib 1.3.2, Firefox ≥ 151 ([blog](https://trifectatech.org/blog/zlib-rs-in-firefox/)), ≈ zlib-ng ([bancs](https://trifectatech.org/blog/zlib-rs-is-faster-than-c/)) | absent | **aphrody/**, opt-in |
| [rustls](https://github.com/rustls/rustls) / [rustls-openssl-compat](https://github.com/rustls/rustls-openssl-compat) | 0.23.45 / 0.2.1 | compat expérimental, glibc, garde libcrypto d'OpenSSL | rustls-ffi 0.15.3 | compat écarté |
| Sequoia [sq](https://gitlab.com/sequoia-pgp/sequoia-sq) / sqv / chameleon | 1.5 / 1.5 / 0.13.1 | sqv dans apt Debian ([wiki](https://wiki.debian.org/OpenPGP/Sequoia)), rpm-sequoia Fedora ([blog](https://sequoia-pgp.org/blog/2024/12/13/202412-sequoia-fedora/)) ; chameleon beta | sq 1.3.1, sqv 1.3.0, chameleon 0.13.1 | sq + sqv en base, chameleon écarté |
| [rav1d](https://github.com/memorysafety/rav1d) | 1.1.0 | ≈ 5 % plus lent que dav1d ([blog](https://www.memorysafety.org/blog/rav1d-performance-optimization/)) | absent | écarté |
| [fish](https://github.com/fish-shell/fish-shell/releases), ripgrep, fd, eza | 4.9.3, 15.2, 10.5, 0.23.5 | stables | 4.6.0, 15.1.0, 10.2.0, 0.23.4 | amont, base |
| uv, [mold](https://github.com/rui314/mold/releases/tag/v3.0.0), [wild](https://github.com/wild-linker/wild), sccache | 0.12.24, 3.0.0, 0.10.0 ([notes](https://www.phoronix.com/news/Wild-Linker-0.10)), 0.18.0 | mold 3.0 réécrit en Rust ; wild sans LTO plugin | 0.11.19, 2.39.1, 0.8.0, 0.15.0 | amont, `aphrody-rust-tools` |
| cargo-auditable, [cargo-deny](https://github.com/EmbarkStudios/cargo-deny/blob/main/CHANGELOG.md), cargo-nextest, cargo-binstall | 0.7.7, 0.20.2, 0.9.148, 1.25.2 | stables | 0.7.5, 0.18.6, 0.9.110, absent | amont ; binstall écarté (télécharge des binaires non vérifiés par apk) |
| Rust for Linux | 7.1+ | expérimental terminé ([LWN](https://lwn.net/Articles/1049831/)), rustc ≥ 1.85 ([politique](https://rust-for-linux.com/rust-version-policy)), Binder C retiré en 7.4 ([Phoronix](https://www.phoronix.com/news/Google-Binder-C-Goodbye)), Nova/Tyr en cours | — | `linux-aphrody` (U3, V) |

**Alpine (`C:\aports\aphrody`).** Nouveaux : `uutils-findutils` (find, xargs), `uutils-diffutils` (diff, cmp),
`zlib-rs` (`/usr/lib/zlib-rs/libz.so.1`, `LD_LIBRARY_PATH`, `somask`, jamais `so:libz.so.1`) ; `ntpd-rs` 1.9.0 repris
d'edge testing. Pas de rétroportage de ce qui est déjà en amont (uutils-coreutils 0.11, sequoia, fish…).
Conflits : `replaces="findutils"`/`"diffutils"` + `replaces_priority=100`, sans `provides` (fonctions GNU absentes) :
nos fichiers gagnent quel que soit l'ordre d'installation (`apk_pkg_replaces_file`), GNU garde locate, diff3, sdiff ;
les liens busybox n'appartiennent à aucun paquet et son trigger les recrée si un remplaçant part ; `busybox-binsh`
reste `/bin/sh`. Méta `aphrody-rust-base` = la liste unique (celle de la cible `cli` d'aphrody-os + uutils
findutils/diffutils, ntpd-rs, sq, sqv, fish) ; `aphrody-rust-tools` = cargo-auditable/deny/nextest, sccache, mold,
wild, uv. Toolchain : `default.conf` d'abuild impose déjà `codegen-units=1`, `lto=true` (fat, ≥ thin),
`opt-level=s`, `panic=abort`, et seule `/etc/abuild.conf` passe après ; `aphrody/scripts/abuild-rust.conf` y ajoute
mold (`-fuse-ld=mold`) et sccache (`SCCACHE_DIR`) pour `publish.ts build @rust-base`, et `APHRODY_RUST_CPU=x86-64-v3`
(flavor optimisée, builds locaux seulement : la publication le refuse). zlib-rs passe en `opt-level=3`.
cargo-auditable : `makedepends` de chaque APKBUILD. CI : job `rust-base <arch>` (cache sccache) avant `index`.

**Images.** aphrody-os cible `cli` : `apk add aphrody-rust-base` (dépôt Aphrody) au lieu de la liste ; selftest
30 vérifications (find, xargs, diff, cmp, ntp-ctl, sq, fish ajoutés). `desktop` (C1) inchangée : son ajout de clé et de
dépôt est désormais redondant. `ghcr.io/aphrody-labs/alpine:3.24-rust` = `--build-arg USERLAND=rust` (méta à la place
de GNU coreutils, vérifie que ls/find/diff sont uutils) ; workflow `aphrody-alpine-image.yml` : matrice arch × userland.

**Bun.** Existant vérifié et conservé : edition 2024, `[workspace.lints]` hérités partout, `clippy.toml`, release
`lto="off"` + ThinLTO cross-langage au link (lld `-C linker-plugin-lto`), `codegen-units=1`, `panic="abort"`,
`-Zshare-generics=y` (hors ASAN) et `-Zthreads=8` dans `scripts/build/rust.ts`, clang + lld. Ajouts : `resolver = "3"`
(résolution MSRV, unification inchangée) ; `deny.toml` (13 cibles, licences, RustSec, `openssl`/`native-tls` bannis,
crates.io seul) + `bun run rust:deny` + job CI ; `.config/nextest.toml` + `bun run rust:nextest` (crates de
`rust:miri`) + job CI ; `publish = false` sur 102 crates ; bcrypt 0.19.2 (RUSTSEC-2026-0199, dépendance runtime) et
crossbeam-epoch 0.9.21 ; `BUN_TOOLCHAIN_LD=wild` (Linux sans LTO, refusé sinon). Écartés : LTO fat rustc (casse le
ThinLTO cross-langage), cranelift ([nightly](https://rust-lang.github.io/rust-project-goals/2025h2/production-ready-cranelift.html),
intrinsics), zlib-rs dans Bun (zlib-ng déjà vendorisé, compat `node:zlib`), rustls (BoringSSL), MSRV (nightly
épinglé), rust-lld par défaut ([1.90](https://blog.rust-lang.org/2025/09/01/rust-lld-on-1.90.0-stable), gnu
seulement). Candidats vieillissants non changés (gain non prouvé) : rustix 0.38 → 1.x, strum 0.26, hashbrown 0.15,
criterion 0.5 / itertools 0.10 (dev), paste (non maintenu, RUSTSEC-2024-0436 ignoré ; remplaçant direct pastey).
Reste : `bun_md` et `bun_wasm` sans `publish = false` (exclus de `rust:deny` jusqu'à leurs propriétaires).

Vérification (passe finale) :

```sh
# Bun (C:\bun)
bun run rust:deny
bun run build --configure-only && bun run build --target=codegen --target=clone-lolhtml --target=clone-rust-argon2
bun run rust:nextest
cargo check --workspace --all-targets --keep-going
bun bd test test/js/bun/util/password.test.ts          # bcrypt 0.19.2
# Alpine (C:\aports, conteneur alpine:3.24 avec alpine-sdk, mold, sccache, abuild-rust.conf dans /etc/abuild.conf)
for p in uutils-findutils uutils-diffutils ntpd-rs zlib-rs aphrody-rust-base; do (cd aphrody/$p && abuild -F checksum && abuild -F -r); done
# Images
docker build -t ghcr.io/aphrody-labs/alpine:3.24-rust --build-arg USERLAND=rust -f scripts/aphrody/aphrody-alpine.Dockerfile scripts/aphrody
docker build -t aphrody/rust-bun C:/aphrody/tools/config/container/aphrody-os && docker run --rm aphrody/rust-bun aphrody-selftest
```

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

### L. oxc et n2b dans le fork (✅ ; n2b 0.7.1 monorepo en cours ; bun-oxc 0.3.0 en cours, Z1)

> **Version oxc retenue (propriétaire : Z1 ; `bun lint` / `bun fmt` de Y s'alignent dessus)** : crates Oxc
> **0.153.0** (crates.io, dernière publiée au 2026-10-09), **oxlint 1.87.0**, **oxfmt 0.72.0**, `oxc_resolver` **11.24.3**,
> `oxc_sourcemap` **9.0.0**. Source : fork `aphrody-labs/oxc` (C:\oxc), branche `aphrody` = tag `oxlint_v1.87.0`
> (`2bd08ebe8f36`) + patch oxfmt (API `core` publique sans napi) = **`b25696441c80fd580c35d671797f1940c642a624`**.
> `oxc_linter`/`oxfmt` ne sont pas sur crates.io : `git = "https://github.com/aphrody-labs/oxc", rev = "b25696441c80…"`
> et `[patch.crates-io]` de tous les `oxc_*` sur ce même `rev` (une seule copie de l'AST).

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
- 🔄 bun-oxc 0.3.0 (Z1, `6922c5edba7`, ni compilé ni testé) : l'addon lie `oxc_parser_napi`, `oxc_transform_napi`,
  `oxc_minify_napi` (`extern crate … as _`, exports `#[napi]` enregistrés par leurs ctors) ; API pont `bridgeTransform`,
  `bridgeMinify`, `bridgeParse`, `analyze`, `check`, `isolatedDeclarationText`, `resolve`, `format` et `lint` en
  processus (config, fix), `lintRules`, `createTransformOptions` → hook natif `oxc_transform_with` ; sous-chemins
  `./parser` (JS d'oxc-parser vendu par `scripts/sync-oxc-js.ts`, 40 fichiers), `./transform`, `./minify`, `./oxlint` ;
  plugin (minify options, lint + fix, dts) ; CLI `bun-oxc`. Raw transfer d'oxc-parser indisponible sous Bun (JSC plafonne
  les ArrayBuffer à 4 Gio ; `supported.js` renvoie déjà `false`) : voir P. jsPlugins seulement via la CLI oxlint ;
  configs JS d'oxfmt et formatage Prettier embarqué non pris en charge.
  Passe finale : `cd packages/bun-oxc && cargo generate-lockfile && cargo test --workspace && cargo clippy --workspace
  --all-targets` (le `Cargo.lock` est périmé, la publication utilise `--locked`) ; `bun scripts/aphrody/build-napi.ts
  packages/bun-oxc` ; `bun bd test test/integration/bun-plugin-oxc/` ; puis `gh workflow run aphrody-publish-crates.yml`
  et `gh workflow run aphrody-publish-native.yml` (essai à blanc d'abord) pour `aphrody-oxc-bridge` et
  `@aphrody/bun-plugin-oxc` 0.3.0.

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
  matrice de 42 lanes (run 37861845867, 2026-10-09) : 51 jobs verts en ~4 h 50 de mur, release `autobuild-0c06faad…`
  publiée avec les 42 archives, mêmes noms que oven-sh, tailles à ±0,003 %.
- ✅ `scripts/build/deps/webkit.ts` : source par archive. Défaut `aphrody-labs/WebKit` pour les
  42 archives listées dans `APHRODY_WEBKIT_PREBUILTS[0c06faad…]` (écrites par `webkit-prebuilt.ts record`), `oven-sh/WebKit`
  pour tout sha/archive non listé ; `BUN_WEBKIT_REPO=aphrody|oven|<owner>/<repo>` force la
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
