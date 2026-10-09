# M-msys2-mirror — miroir de C:\msys64 dans Aphrody Alpine et Bun

Agent MX, 2026-10-09. Lecture seule de `C:\msys64` (MSYS2 winget, installeur `20260611`). Matrice des forks et
remplaçants (shell, coreutils, toolchain llvm-mingw, apk Windows) : `M-msys2.md` de l'agent MS (lue, non modifiée).
Ce document couvre l'inventaire fichier par fichier, l'équivalent de chaque paquet et les recettes aports
manquantes côté Linux. Les recettes croisées Windows (`C:\aports\aphrody\mingw-w64\**`) sont celles de MS.

## Commandes

```sh
bun scripts/aphrody/msys2-mirror.ts inventory --re   # relit C:\msys64, regénère msys2-inventory.json (~20 s)
bun scripts/aphrody/msys2-mirror.ts verify           # vérifie chaque équivalent, taux de couverture
bun scripts/aphrody/msys2-mirror.ts report           # regénère le tableau ci-dessous
```

- `msys2-inventory.json` : un objet par fichier (`path`, `env`, `pkg` propriétaire lu dans
  `var/lib/pacman/local/*/files`, `type` pe/script/lib/data, `size`, `sha256`) ; pour les PE : `arch`,
  `subsystem`, `dll`, `dlls` (table d'import + delay-load), `msys` (lié à `msys-2.0.dll`), `maxEntropy`
  (sections, via `aphrody re triage`) ; pour les scripts : `interp` (shebang). Empreinte Windows (`windows`) lue par
  `aphrody winclean call list_registry_key|search_files` : noms des variables d'environnement qui pointent vers
  MSYS2 (jamais leurs valeurs), clé de désinstallation, raccourcis du menu Démarrer, lanceurs à la racine.
- Équivalents : `scripts/aphrody/msys2-mirror-map.ts`. Aports Alpine résolus sur `APKINDEX` v3.24 main/community
  (paquet binaire → origine), revérifiés à chaque `verify` dans `C:\aports` (`git ls-tree origin/3.24-stable`).
- `aphrody re triage` ne donnait ni les DLL importées ni la bonne arch des PE ARM64 : corrigé dans
  `aphrody-re` (aphrody `4712511082`, champs `libraries` et `subsystem`, test sur l'exécutable de test). Le binaire
  `C:\aphrody\target\release\aphrody` installé date d'avant ce commit : `inventory` retombe alors sur son lecteur PE
  (mêmes champs) et garde `aphrody re triage` pour le sha256 (contrôlé égal) et l'entropie.

## Ce que contient C:\msys64 (mesuré le 2026-10-09)

| Environnement | Paquets | Fichiers | Octets | PE |
| --- | ---: | ---: | ---: | ---: |
| msys (`/usr`, `/etc`, `/var`, `/home`) | 90 | 16 271 | 626 Mo | 501 (495 liés à `msys-2.0.dll`) |
| ucrt64 | 117 | 55 046 | 2,05 Go | 908 (tous UCRT `api-ms-win-crt-*`) |
| mingw64, clang64, clangarm64, mingw32 | 0 | 0 | 0 | 0 (lanceurs `.exe/.ini/.ico` seulement) |
| racine (installeur Qt IFW) | — | 27 | 45 Mo | 7 |

- 207 paquets (le chiffre de 91 de la demande date d'avant les installations GTK4/Qt6/KF6 de l'agent UI), 71 344
  fichiers, 1 416 PE (693 exe, 723 dll ; 296 DLL non système distinctes), 4 983 scripts (bash 118, sh 103, perl 44,
  python 41), 1 367 archives `.a`. Explicites : `base filesystem msys2-runtime` et, côté ucrt64, `gcc gtk4 kirigami
  libgomp pkgconf qqc2-desktop-style qt6-base qt6-declarative`.
- 2 112 fichiers sans paquet : `ucrt64/share/mime` (1 104, `update-mime-database`), `var/lib/pacman` (654, bases
  sync), `var/cache/pacman` (318 archives), trousseau `etc/pacman.d/gnupg`, `etc/{hosts,mtab,networks,protocols,
  services}`, `home/aphro/.{bash_profile,bashrc,profile}`, fichiers de l'installeur.
- DLL les plus importées : `msys-2.0.dll` 494, `libstdc++-6.dll` 296, `msys-intl-8.dll` 260, `Qt6Core.dll` 258,
  `Qt6Qml.dll` 163, `libglib-2.0-0.dll` 153. Entropie de section > 7,5 : 16 PE, tous des sections `.rdata`/`.rsrc`
  compressées de Qt/KF6/OpenSSL/nettle (aucun exécutable empaqueté).
- Empreinte Windows : clé `HKCU\...\Uninstall\{2199ec27-6df1-498d-9c44-1dc5a4f34e3e}` (MSYS2 20260611,
  `C:\msys64`), 5 raccourcis `Start Menu\Programs\MSYS2\MSYS2 {MSYS,UCRT64,MINGW64,CLANG64,CLANGARM64}.lnk`,
  variables `HKCU` `C_INCLUDE_PATH CPLUS_INCLUDE_PATH LIBRARY_PATH PKG_CONFIG_PATH` qui pointent vers ucrt64
  (posées après l'installeur, pour les fixtures GTK/Qt), aucune entrée MSYS2 dans `Path`, aucune association de
  fichiers ni service.

## Couverture (`verify`)

Chiffres de `bun scripts/aphrody/msys2-mirror.ts verify` au commit de ce document : voir la section Statut.
Un paquet est couvert s'il a un équivalent vérifié côté Aphrody Alpine (aport 3.24 présent, recette du fork
présente, ou sans objet sous Linux avec la raison) ou côté Bun (fichier source présent). La colonne Windows
mesure à part la reconstruction des PE ucrt64 : toolchain `C:\tools\llvm-mingw` (MS) et aports Alpine
`mingw-w64-*` pour crt/headers/gcc/binutils/winpthreads, recettes croisées `aphrody/mingw-w64/<nom>` (MS) pour le
reste.

## Statut

- ⏳ Recettes Linux du fork pour les paquets absents d'Alpine 3.24 : `directx-headers`, `directxmath`, `jbigkit`,
  `tre` (rétroportage d'edge testing).
- ⏳ Rejeu des scripts shell MSYS2 (`/etc/profile`, `/etc/profile.d/*`, scripts `install` de pacman) sous bunsh et nu.
- ⏳ Recettes croisées Windows : agent MS (`C:\aports\aphrody\mingw-w64\**`).

<!-- msys2-mirror:table:begin -->
| Paquet MSYS2 | Usage | Aphrody Alpine (Linux) | Reconstruction Windows (aport mingw / natif) | Bun | Statut |
| --- | --- | --- | --- | --- | --- |
| `base` 2022.06-1 | méta-paquet de l'installation MSYS2 minimale | ✅ main/alpine-base | — | ✅ src/runtime/cli/bunsh.rs | ✅ |
| `bash` 5.3.020-1 | The GNU Bourne Again shell | ✅ main/bash | ✅ %LOCALAPPDATA%/Microsoft/WindowsApps/pwsh.exe | ✅ src/runtime/cli/bunsh.rs | ✅ |
| `bash-completion` 2.18.0-1 | Programmable completion for the bash shell | ✅ main/bash-completion | — | — | ✅ |
| `brotli` 1.2.0-1 | Brotli compression library | ✅ main/brotli | — | ✅ vendor/brotli | ✅ |
| `bsdtar` 3.8.9-1 | Multi-format archive and compression library | ✅ main/libarchive | ✅ C:/Windows/System32/tar.exe | ✅ src/runtime/api/Archive.rs<br>✅ vendor/libarchive | ✅ |
| `bzip2` 1.0.8-4 | A high-quality data compression program | ✅ main/bzip2 | — | — | ✅ |
| `ca-certificates` 20260816-1 | Common CA certificates | ✅ main/ca-certificates | ✅ C:/Windows/System32/certutil.exe | ✅ src/runtime/socket/bundled_root_certs.rs | ✅ |
| `coreutils` 8.32-5 | The basic file, shell and text manipulation utilities of the GNU operating system | ✅ main/coreutils | — | ✅ Bun Shell : cat, cp, echo, ls, mkdir, mv, pwd, rm, seq, touch, true, false, yes, basename, dirname | ✅ |
| `curl` 8.22.0-1 | Multi-protocol file transfer utility | ✅ main/curl | ✅ C:/Windows/System32/curl.exe | ✅ src/runtime/webcore/fetch.rs | ✅ |
| `dash` 0.5.13.4-1 | A POSIX compliant shell that aims to be as small as possible | ✅ main/dash | ✅ %LOCALAPPDATA%/Microsoft/WindowsApps/pwsh.exe | ✅ src/runtime/cli/bunsh.rs | ✅ |
| `db` 6.2.32-6 | The Berkeley DB embedded database system | ✅ main/db | — | — | ✅ |
| `file` 5.48-1 | File type identification utility | ✅ main/file | — | — | ✅ |
| `filesystem` 2026.03.06-1 | arborescence /etc /usr, profils (/etc/profile, profile.d), fstab, nsswitch | ✅ main/alpine-baselayout | — | ✅ src/runtime/cli/bunsh.rs | ✅ |
| `findutils` 4.11.0-2 | GNU utilities to locate files | ✅ main/findutils | ✅ %USERPROFILE%/.cargo/bin/fd.exe | ✅ src/runtime/api/glob.rs | ✅ |
| `gawk` 5.4.1-1 | GNU version of awk | ✅ main/gawk | ✅ %USERPROFILE%/.cargo/bin/nu.exe | — | ✅ |
| `gcc-libs` 15.3.0-1 | Runtime libraries shipped by GCC | ✅ main/gcc | — | — | ✅ |
| `gdbm` 1.26-1 | GNU database library | ✅ main/gdbm | — | — | ✅ |
| `getent` 2.18.90-6 | Get entries from Name Service Switch libraries | ✅ main/musl | — | — | ✅ |
| `gettext` 0.22.5-1 | GNU internationalization library | ✅ main/gettext | — | — | ✅ |
| `gmp` 6.3.0-2 | A free library for arbitrary precision arithmetic | ✅ main/gmp | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `gnupg` 2.4.9-3 | Complete and free implementation of the OpenPGP standard | ✅ main/gnupg | — | — | ✅ |
| `grep` 1~3.0-7 | A string search utility | ✅ main/grep | ✅ %USERPROFILE%/.cargo/bin/rg.exe<br>✅ C:/Windows/System32/findstr.exe | — | ✅ |
| `gzip` 1.15-1 | GNU compression utility | ✅ main/gzip | — | ✅ src/js/node/zlib.ts | ✅ |
| `inetutils` 2.8-1 | A collection of common network programs. | ✅ community/inetutils-telnet | — | — | ✅ |
| `info` 7.2-3 | Utilities to work with and produce manuals, ASCII text, and on-line documentation from a single source file | ✅ main/texinfo | — | — | ✅ |
| `less` 710-1 | A terminal based program for viewing text files | ✅ main/less | — | — | ✅ |
| `libargp` 20260115-1 | Interface for parsing command-line arguments | ✅ main/argp-standalone | — | — | ✅ |
| `libasprintf` 0.22.5-1 | C-style formatted output in C++ (runtime) | ✅ main/gettext | — | — | ✅ |
| `libassuan` 3.0.2-1 | A IPC library used by some GnuPG related software | ✅ main/libassuan | — | — | ✅ |
| `libbz2` 1.0.8-4 | A high-quality data compression program | ✅ main/bzip2 | — | — | ✅ |
| `libcurl` 8.22.0-1 | Multi-protocol file transfer library (runtime) | ✅ main/curl | ✅ C:/Windows/System32/curl.exe | ✅ src/runtime/webcore/fetch.rs | ✅ |
| `libdb` 6.2.32-6 | The Berkeley DB embedded database system | ✅ main/db | — | — | ✅ |
| `libexpat` 2.9.0-1 | An XML parser library | ✅ main/expat | — | — | ✅ |
| `libffi` 3.8.0-1 | Portable, high level programming interface to various calling conventions | ✅ main/libffi | — | ✅ src/js/bun/ffi.ts<br>✅ vendor/tinycc | ✅ |
| `libgcrypt` 1.12.4-1 | General purpose cryptographic library based on the code from GnuPG | ✅ main/libgcrypt | — | ✅ src/runtime/crypto/EVP.rs | ✅ |
| `libgdbm` 1.26-1 | GNU database library | ✅ main/gdbm | — | — | ✅ |
| `libgettextpo` 0.22.5-1 | GNU Internationalization runtime library | ✅ main/gettext | — | — | ✅ |
| `libgnutls` 3.8.13-2 | A library which provides a secure layer over a reliable transport layer | ✅ main/gnutls | — | ✅ vendor/boringssl | ✅ |
| `libgpg-error` 1.61-1 | Support library for libgcrypt | ✅ main/libgpg-error | — | — | ✅ |
| `libhogweed` 4.0-1 | A low-level cryptographic library | ✅ main/nettle | — | ✅ src/runtime/crypto/EVP.rs | ✅ |
| `libiconv` 1.19-1 | Libiconv is a conversion library | ✅ community/gnu-libiconv | — | ✅ src/runtime/webcore/TextDecoder.rs | ✅ |
| `libidn2` 2.3.8-1 | Implementation of the Stringprep, Punycode and IDNA specifications | ✅ main/libidn2 | — | ✅ src/js/node/url.ts (domainToASCII) | ✅ |
| `libintl` 0.22.5-1 | GNU Internationalization runtime library | ✅ main/gettext | — | — | ✅ |
| `libksba` 1.8.1-1 | A CMS and X.509 access library | ✅ main/libksba | — | — | ✅ |
| `liblz4` 1.10.0-1 | Very fast lossless compression algorithm | ✅ main/lz4 | — | — | ✅ |
| `liblzma` 5.8.4-1 | Library for XZ and LZMA compressed files | ✅ main/xz | — | — | ✅ |
| `libnettle` 4.0-1 | A low-level cryptographic library | ✅ main/nettle | — | ✅ src/runtime/crypto/EVP.rs | ✅ |
| `libnghttp2` 1.70.0-1 | Framing layer of HTTP/2 is implemented as a reusable C library (runtime) | ✅ main/nghttp2 | — | ✅ src/js/node/http2.ts<br>✅ vendor/lshpack | ✅ |
| `libnghttp3` 1.18.0-1 | HTTP/3 library written in C - runtime libraries | ✅ main/nghttp3 | — | ✅ vendor/lsqpack | ✅ |
| `libngtcp2` 1.25.0-1 | An effort to implement IETF QUIC protocol - runtime libraries | ✅ main/ngtcp2 | — | ✅ vendor/lsquic | ✅ |
| `libnpth` 1.8-1 | New portable threads library | ✅ main/npth | — | — | ✅ |
| `libopenssl` 3.6.5-1 | The Open Source toolkit for Secure Sockets Layer and Transport Layer Security | ✅ main/openssl | — | ✅ vendor/boringssl | ✅ |
| `libp11-kit` 0.26.5-1 | Library to work with PKCS#11 modules | ✅ main/p11-kit | — | — | ✅ |
| `libpcre` 8.45-5 | A library that implements Perl 5-style regular expressions | ✅ main/pcre | — | — | ✅ |
| `libpcre2_8` 10.49-1 | A library that implements Perl 5-style regular expressions | ✅ main/pcre2 | — | — | ✅ |
| `libpsl` 0.23.2-1 | Public Suffix List library (runtime) | ✅ main/libpsl | — | — | ✅ |
| `libreadline` 8.3.006-1 | GNU readline library | ✅ main/readline | — | ✅ src/runtime/cli/repl.rs | ✅ |
| `libsqlite` 3.53.4-1 | Sqlite3 library | ✅ main/sqlite | — | ✅ src/js/bun/sqlite.ts | ✅ |
| `libssh2` 1.11.1-1 | Multi-protocol file transfer library (runtime) | ✅ main/libssh2 | — | — | ✅ |
| `libtasn1` 4.21.0-1 | A library for Abstract Syntax Notation One (ASN.1) and Distinguish Encoding Rules (DER) manipulation | ✅ main/libtasn1 | — | — | ✅ |
| `libunistring` 1.4.2-1 | Library for manipulating Unicode strings and C strings. | ✅ main/libunistring | — | ✅ src/runtime/webcore/encoding.rs | ✅ |
| `libutil-linux` 2.40.2-2 | Block device ID and Universally Unique ID libraries | ✅ main/util-linux | — | — | ✅ |
| `libxcrypt` 4.5.2-1 | Modern library for one-way hashing of passwords | ✅ main/musl | — | ✅ src/runtime/crypto/PasswordObject.rs | ✅ |
| `libzstd` 1.5.7-1 | Zstandard - Fast real-time compression algorithm | ✅ main/zstd | — | ✅ vendor/zstd | ✅ |
| `mingw-w64-ucrt-x86_64-adwaita-icon-theme` 51.0-1 | GNOME standard icons (mingw-w64) | ✅ community/adwaita-icon-theme | ⏳ aphrody/mingw-w64/adwaita-icon-theme | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-adwaita-icon-theme-legacy` 46.2-1 | Icon theme that provides fallback icons for old apps relying on global icon themes (mingw-w64) | ✅ community/adwaita-icon-theme | ⏳ aphrody/mingw-w64/adwaita-icon-theme-legacy | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-binutils` 2.47-4 | A set of programs to assemble and manipulate binary and object files (mingw-w64) | ✅ main/binutils | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-breeze-icons` 6.30.0-1 | Breeze icon theme (mingw-w64) | ✅ community/breeze-icons | ⏳ aphrody/mingw-w64/breeze-icons | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-brotli` 1.2.0-1 | Brotli compression library (mingw-w64) | ✅ main/brotli | ⏳ aphrody/mingw-w64/brotli | ✅ vendor/brotli | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-bzip2` 1.0.8-4 | A high-quality data compression program (mingw-w64) | ✅ main/bzip2 | ⏳ aphrody/mingw-w64/bzip2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-cairo` 1.18.6-2 | Cairo vector graphics library (mingw-w64) | ✅ main/cairo | ⏳ aphrody/mingw-w64/cairo | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-cc-libs` 16.2.0-4 | C++ Standard Library (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-crt` 14.0.0.r426.g4564ee4b5-1 | MinGW-w64 CRT for Windows (mingw-w64) | ✅ community/mingw-w64-crt | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-dbus` 1.16.2-4 | Freedesktop.org message bus system (mingw-w64) | ✅ main/dbus | ⏳ aphrody/mingw-w64/dbus | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-directx-headers` 1~1.619.5-1 | Official DirectX headers available under an open source license (mingw-w64) | ⏳ aphrody/directx-headers | ⏳ aphrody/mingw-w64/directx-headers | — | ⏳ |
| `mingw-w64-ucrt-x86_64-directxmath` 3.20.b-1 | DirectXMath is an all inline SIMD C++ linear algebra library for use in games and graphics apps (mingw-w64) | ⏳ aphrody/directxmath | ⏳ aphrody/mingw-w64/directxmath | — | ⏳ |
| `mingw-w64-ucrt-x86_64-double-conversion` 3.4.0-1 | Binary-decimal and decimal-binary routines for IEEE doubles (mingw-w64) | ✅ community/double-conversion | ⏳ aphrody/mingw-w64/double-conversion | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-egl-headers` 1.5.r284.3ae2b7c-1 | EGL header files (mingw-w64) | ✅ main/mesa | ⏳ aphrody/mingw-w64/egl-headers | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-expat` 2.9.0-1 | An XML parser library (mingw-w64) | ✅ main/expat | ⏳ aphrody/mingw-w64/expat | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-fontconfig` 2.18.3-1 | A library for configuring and customizing font access (mingw-w64) | ✅ main/fontconfig | ⏳ aphrody/mingw-w64/fontconfig | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-freetype` 2.14.3-1 | TrueType font rendering library (mingw-w64) | ✅ main/freetype | ⏳ aphrody/mingw-w64/freetype | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-fribidi` 1.0.17-1 | A Free Implementation of the Unicode Bidirectional Algorithm (mingw-w64) | ✅ main/fribidi | ⏳ aphrody/mingw-w64/fribidi | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gcc` 16.2.0-4 | The GNU Compiler Collection - C and C++ frontends (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-gdk-pixbuf2` 2.44.8-1 | An image loading library (mingw-w64) | ✅ community/gdk-pixbuf | ⏳ aphrody/mingw-w64/gdk-pixbuf2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gettext-runtime` 1.0-1 | GNU internationalization runtime library (mingw-w64) | ✅ main/gettext | ⏳ aphrody/mingw-w64/gettext-runtime | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-giflib` 6.1.3-1 | A library for reading and writing gif images (mingw-w64) | ✅ main/giflib | ⏳ aphrody/mingw-w64/giflib | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gles-headers` 3.2.r1065.7fc154c-1 | OpenGL\|ES header files (mingw-w64) | ✅ main/mesa | ⏳ aphrody/mingw-w64/gles-headers | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-glib2` 2.90.1-1 | Common C routines used by GTK+ 3 and other libs (mingw-w64) | ✅ main/glib | ⏳ aphrody/mingw-w64/glib2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gmp` 6.3.0-2 | A free library for arbitrary precision arithmetic (mingw-w64) | ✅ main/gmp | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-gnutls` 3.8.13-3 | A library which provides a secure layer over a reliable transport layer (mingw-w64) | ✅ main/gnutls | ⏳ aphrody/mingw-w64/gnutls | ✅ vendor/boringssl | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-graphene` 1.10.8-3 | A thin layer of graphic data types (mingw-w64) | ✅ main/graphene | ⏳ aphrody/mingw-w64/graphene | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-graphite2` 1.3.15-1 | Font rendering capabilities for complex non-Roman writing systems (mingw-w64) | ✅ main/graphite2 | ⏳ aphrody/mingw-w64/graphite2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gst-plugins-bad-libs` 1.28.7-1 | GStreamer Multimedia Framework Bad Plugins (mingw-w64) | ✅ community/gst-plugins-bad | ⏳ aphrody/mingw-w64/gst-plugins-bad-libs | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gst-plugins-base` 1.28.7-1 | GStreamer Multimedia Framework Base Plugins (mingw-w64) | ✅ main/gst-plugins-base | ⏳ aphrody/mingw-w64/gst-plugins-base | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gstreamer` 1.28.7-1 | GStreamer Multimedia Framework (mingw-w64) | ✅ main/gstreamer | ⏳ aphrody/mingw-w64/gstreamer | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gtk-update-icon-cache` 3.24.52-1 | GTK+ icon cache updater (mingw-w64) | ✅ community/gtk+3.0 | ⏳ aphrody/mingw-w64/gtk-update-icon-cache | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-gtk4` 4.24.1-1 | GTK 4 (fixture test/js/bun/ffi/gtk-window.fixture.ts, agent UI) | ✅ community/gtk4.0 | ⏳ aphrody/mingw-w64/gtk4 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-harfbuzz` 14.6.0-1 | OpenType text shaping engine (mingw-w64) | ✅ main/harfbuzz | ⏳ aphrody/mingw-w64/harfbuzz | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-headers` 14.0.0.r426.g4564ee4b5-1 | MinGW-w64 headers for Windows (mingw-w64) | ✅ community/mingw-w64-headers | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-hicolor-icon-theme` 0.18-1 | Freedesktop.org Hicolor icon theme (mingw-w64) | ✅ main/hicolor-icon-theme | ⏳ aphrody/mingw-w64/hicolor-icon-theme | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-icu` 78.3-4 | International Components for Unicode library (mingw-w64) | ✅ main/icu | ✅ C:/Windows/System32/icu.dll | — | ✅ |
| `mingw-w64-ucrt-x86_64-isl` 0.28-1 | Library for manipulating sets and relations of integer points bounded by linear constraints (mingw-w64) | ✅ main/isl26 | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-iso-codes` 4.20.1-1 | Lists of the country, language, and currency names (mingw-w64) | ✅ main/iso-codes | ⏳ aphrody/mingw-w64/iso-codes | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-jbigkit` 2.1-6 | Data compression library/utilities for bi-level high-resolution images (mingw-w64) | ⏳ aphrody/jbigkit | ⏳ aphrody/mingw-w64/jbigkit | — | ⏳ |
| `mingw-w64-ucrt-x86_64-json-glib` 1.10.8-2 | JSON-GLib implements a full suite of JSON-related tools using GLib and GObject (mingw-w64) | ✅ community/json-glib | ⏳ aphrody/mingw-w64/json-glib | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-karchive` 6.30.0-1 | Qt addon providing access to numerous types of archives (mingw-w64) | ✅ community/karchive | ⏳ aphrody/mingw-w64/karchive | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kcodecs` 6.30.0-1 | Provide a collection of methods to manipulate strings using various encodings (mingw-w64) | ✅ community/kcodecs | ⏳ aphrody/mingw-w64/kcodecs | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kcolorscheme` 6.30.0-1 | Classes to read and interact with KColorScheme (mingw-w64) | ✅ community/kcolorscheme | ⏳ aphrody/mingw-w64/kcolorscheme | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kconfig` 6.30.0-1 | Persistent platform-independent application settings (mingw-w64) | ✅ community/kconfig | ⏳ aphrody/mingw-w64/kconfig | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kconfigwidgets` 6.30.0-1 | Widgets for configuration dialogs (mingw-w64) | ✅ community/kconfigwidgets | ⏳ aphrody/mingw-w64/kconfigwidgets | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kcoreaddons` 6.30.0-1 | Qt addon library with a collection of non-GUI utilities (mingw-w64) | ✅ community/kcoreaddons | ⏳ aphrody/mingw-w64/kcoreaddons | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kguiaddons` 6.30.0-1 | Utilities for graphical user interfaces (mingw-w64) | ✅ community/kguiaddons | ⏳ aphrody/mingw-w64/kguiaddons | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-ki18n` 6.30.0-1 | Advanced internationalization frameworks (mingw-w64) | ✅ community/ki18n | ⏳ aphrody/mingw-w64/ki18n | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kiconthemes` 6.30.0-1 | Support for icon themes (mingw-w64) | ✅ community/kiconthemes | ⏳ aphrody/mingw-w64/kiconthemes | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kirigami` 6.30.0-1 | KDE Kirigami (fixture kde-window, agent UI) | ✅ community/kirigami | ⏳ aphrody/mingw-w64/kirigami | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-kwidgetsaddons` 6.30.0-1 | Addons to QtWidgets (mingw-w64) | ✅ community/kwidgetsaddons | ⏳ aphrody/mingw-w64/kwidgetsaddons | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-lerc` 4.1.1-1 | Limited Error Raster Compression library (mingw-w64) | ✅ community/lerc | ⏳ aphrody/mingw-w64/lerc | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libatomic` 16.2.0-4 | GNU Atomic library shipped by GCC (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-libb2` 0.98.1-3 | C library providing BLAKE2b, BLAKE2s, BLAKE2bp, BLAKE2sp hash functions (mingw-w64) | ✅ community/libb2 | ⏳ aphrody/mingw-w64/libb2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libdatrie` 0.2.14-1 | Implementation of double-array structure for representing trie, as proposed by Junichi Aoe. (mingw-w64) | ✅ community/libdatrie | ⏳ aphrody/mingw-w64/libdatrie | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libdeflate` 1.26-1 | Heavily optimized library for DEFLATE/zlib/gzip compression and decompression (mingw-w64) | ✅ community/libdeflate | ⏳ aphrody/mingw-w64/libdeflate | ✅ vendor/libdeflate | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libepoxy` 1.5.10-7 | A library for handling OpenGL function pointer management for you (mingw-w64) | ✅ main/libepoxy | ⏳ aphrody/mingw-w64/libepoxy | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libffi` 3.8.0-1 | A portable, high level programming interface to various calling conventions (mingw-w64) | ✅ main/libffi | ⏳ aphrody/mingw-w64/libffi | ✅ src/js/bun/ffi.ts<br>✅ vendor/tinycc | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libgcc` 16.2.0-4 | Low-level runtime library shipped by GCC (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-libgomp` 16.2.0-4 | OpenMP library shipped by GCC (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-libiconv` 1.19-1 | Character encoding conversion library (mingw-w64) | ✅ community/gnu-libiconv | ⏳ aphrody/mingw-w64/libiconv | ✅ src/runtime/webcore/TextDecoder.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libidn2` 2.3.8-4 | Implementation of the Stringprep, Punycode and IDNA specifications (mingw-w64) | ✅ main/libidn2 | ⏳ aphrody/mingw-w64/libidn2 | ✅ src/js/node/url.ts (domainToASCII) | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libjpeg-turbo` 3.2.0-1 | JPEG image codec with accelerated baseline compression and decompression (mingw-w64) | ✅ main/libjpeg-turbo | ⏳ aphrody/mingw-w64/libjpeg-turbo | ✅ vendor/libjpeg-turbo | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libnice` 0.1.24-1 | An implementation of the IETF's draft ICE (for p2p UDP data streams) (mingw-w64) | ✅ community/libnice | ⏳ aphrody/mingw-w64/libnice | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libogg` 1.3.6-1 | Ogg bitstream and framing library (mingw-w64) | ✅ main/libogg | ⏳ aphrody/mingw-w64/libogg | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libpng` 1.6.59-1 | A collection of routines used to create PNG format graphics (mingw-w64) | ✅ main/libpng | ⏳ aphrody/mingw-w64/libpng | ✅ src/runtime/image/codec_png.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libquadmath` 16.2.0-4 | GCC Quad-Precision Math Runtime Library (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-librsvg` 2.63.2-1 | SVG rendering library (mingw-w64) | ✅ community/librsvg | ⏳ aphrody/mingw-w64/librsvg | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libstdc++` 16.2.0-4 | C++ runtime libraries shipped by GCC (mingw-w64) | ✅ main/gcc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-libsystre` 1.0.2-3 | Wrapper library around TRE that provides POSIX API (mingw-w64) | ⏳ aphrody/tre<br>✅ main/musl | ⏳ aphrody/mingw-w64/libsystre | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libtasn1` 4.21.0-1 | A library for Abstract Syntax Notation One (ASN.1) and Distinguish Encoding Rules (DER) manipulation (mingw-w64) | ✅ main/libtasn1 | ⏳ aphrody/mingw-w64/libtasn1 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libthai` 0.1.30-1 | Thai language support routines (mingw-w64) | ✅ community/libthai | ⏳ aphrody/mingw-w64/libthai | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libtheora` 1.2.0-1 | An open video codec developed by the Xiph.org (mingw-w64) | ✅ main/libtheora | ⏳ aphrody/mingw-w64/libtheora | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libtiff` 4.7.2-1 | Library for manipulation of TIFF images (mingw-w64) | ✅ main/tiff | ⏳ aphrody/mingw-w64/libtiff | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libtre` 0.9.0-2 | The approximate regex matching library and agrep command line tool (mingw-w64) | ⏳ aphrody/tre<br>✅ main/musl | ⏳ aphrody/mingw-w64/libtre | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libunistring` 1.4.2-1 | Library for manipulating Unicode strings and C strings. (mingw-w64) | ✅ main/libunistring | ⏳ aphrody/mingw-w64/libunistring | ✅ src/runtime/webcore/encoding.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libva` 2.24.1-1 | Video Acceleration (VA) API (mingw-w64) | ✅ main/libva | ⏳ aphrody/mingw-w64/libva | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libvorbis` 1.3.7-3 | Vorbis codec library (mingw-w64) | ✅ main/libvorbis | ⏳ aphrody/mingw-w64/libvorbis | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libwebp` 1.6.0-1 | A library to encode and decode images in WebP format (mingw-w64) | ✅ main/libwebp | ⏳ aphrody/mingw-w64/libwebp | ✅ vendor/libwebp | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-libwinpthread` 14.0.0.r426.g4564ee4b5-1 | MinGW-w64 winpthreads library (mingw-w64) | ✅ community/mingw-w64-winpthreads | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-libxml2` 2.15.4-1 | XML parsing library, version 2 (mingw-w64) | ✅ main/libxml2 | ⏳ aphrody/mingw-w64/libxml2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-lzo2` 2.10-3 | Portable lossless data compression library (mingw-w64) | ✅ main/lzo | ⏳ aphrody/mingw-w64/lzo2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-md4c` 0.6.0-1 | C Markdown parser implementation compliant to CommonMark specification | ✅ community/md4c | ⏳ aphrody/mingw-w64/md4c | ✅ src/runtime/api/MarkdownObject.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-mpc` 1.4.1-1 | Multiple precision complex arithmetic library (mingw-w64) | ✅ community/mpc | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-mpdecimal` 4.0.1-3 | Package for correctly-rounded arbitrary precision decimal floating point arithmetic (mingw-w64) | ✅ main/mpdecimal | ⏳ aphrody/mingw-w64/mpdecimal | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-mpfr` 4.2.2-3 | Multiple-precision floating-point library (mingw-w64) | ✅ main/mpfr4 | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-ncurses` 6.6-4 | System V Release 4.0 curses emulation library (mingw-w64) | ✅ main/ncurses | ⏳ aphrody/mingw-w64/ncurses | ✅ src/runtime/api/Terminal.classes.ts | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-nettle` 4.0-1 | A low-level cryptographic library (mingw-w64) | ✅ main/nettle | ⏳ aphrody/mingw-w64/nettle | ✅ src/runtime/crypto/EVP.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-openssl` 3.6.5-1 | The Open Source toolkit for Secure Sockets Layer and Transport Layer Security (mingw-w64) | ✅ main/openssl | ⏳ aphrody/mingw-w64/openssl | ✅ vendor/boringssl | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-opus` 1.6.1-1 | Codec designed for interactive speech and audio transmission over the Internet (mingw-w64) | ✅ main/opus | ⏳ aphrody/mingw-w64/opus | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-orc` 0.4.44-1 | The Oild Runtime Compiler (mingw-w64) | ✅ main/orc | ⏳ aphrody/mingw-w64/orc | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-p11-kit` 0.26.5-1 | Library to work with PKCS#11 modules (mingw-w64) | ✅ main/p11-kit | ⏳ aphrody/mingw-w64/p11-kit | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-pango` 1.58.2-1 | A library for layout and rendering of text (mingw-w64) | ✅ main/pango | ⏳ aphrody/mingw-w64/pango | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-pcre2` 10.49-1 | A library that implements Perl 5-style regular expressions (mingw-w64) | ✅ main/pcre2 | ⏳ aphrody/mingw-w64/pcre2 | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-pixman` 0.46.4-3 | The pixel-manipulation library for X and cairo (mingw-w64) | ✅ main/pixman | ⏳ aphrody/mingw-w64/pixman | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-pkgconf` 1~3.0.7-2 | pkg-config compatible utility which does not depend on glib | ✅ main/pkgconf | ⏳ aphrody/mingw-w64/pkgconf | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-python` 3.14.8-1 | A high-level scripting language (mingw-w64) | ✅ main/python3 | ✅ %USERPROFILE%/.cargo/bin/uv.exe | — | ✅ |
| `mingw-w64-ucrt-x86_64-python-packaging` 26.3-1 | Core utilities for Python packages (mingw-w64) | ✅ main/py3-packaging | ⏳ aphrody/mingw-w64/python-packaging | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-qqc2-desktop-style` 6.30.0-1 | A style for Qt Quick Controls 2 to make it follow your desktop theme (mingw-w64) | ✅ community/qqc2-desktop-style | ⏳ aphrody/mingw-w64/qqc2-desktop-style | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-qt6-base` 6.11.2-2 | Qt 6 (fixtures qt-window/kde-window, agent UI) | ✅ community/qt6-qtbase | ⏳ aphrody/mingw-w64/qt6-base | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-qt6-declarative` 6.11.2-1 | Classes for QML and JavaScript languages (mingw-w64) | ✅ community/qt6-qtdeclarative | ⏳ aphrody/mingw-w64/qt6-declarative | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-qt6-svg` 6.11.2-1 | Classes for displaying the contents of SVG files (mingw-w64) | ✅ community/qt6-qtsvg | ⏳ aphrody/mingw-w64/qt6-svg | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-shared-mime-info` 2.5.1-1 | Freedesktop.org Shared MIME Info (mingw-w64) | ✅ main/shared-mime-info | ⏳ aphrody/mingw-w64/shared-mime-info | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-sonnet` 6.30.0-1 | Spelling framework for Qt (mingw-w64) | ✅ community/sonnet | ⏳ aphrody/mingw-w64/sonnet | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-sqlite3` 3.53.4-1 | A C library that implements an SQL database engine (mingw-w64) | ✅ main/sqlite | ⏳ aphrody/mingw-w64/sqlite3 | ✅ src/js/bun/sqlite.ts | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-tcl` 8.6.18-1 | The Tcl scripting language (mingw-w64) | ✅ main/tcl | ⏳ aphrody/mingw-w64/tcl | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-tk` 8.6.18-1 | A windowing toolkit for use with tcl (mingw-w64) | ✅ main/tk | ⏳ aphrody/mingw-w64/tk | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-tzdata` 2026e-1 | Sources for time zone and daylight saving time data (mingw-w64) | ✅ main/tzdata | ⏳ aphrody/mingw-w64/tzdata | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-vulkan-headers` 1~1.4.363.0-1 | Vulkan header files (mingw-w64) | ✅ main/vulkan-headers | ⏳ aphrody/mingw-w64/vulkan-headers | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-vulkan-loader` 1~1.4.363.0-1 | Vulkan Installable Client Driver (ICD) Loader (mingw-w64) | ✅ main/vulkan-loader | ✅ C:/Windows/System32/vulkan-1.dll | — | ✅ |
| `mingw-w64-ucrt-x86_64-windows-default-manifest` 20260815-1 | Default Windows application manifest (mingw-w64) | ✅ sans objet : manifeste PE par défaut ; sans équivalent ELF | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-wineditline` 2.208-1 | An EditLine API implementation for the native Windows Console (mingw-w64) | ✅ main/libedit | ⏳ aphrody/mingw-w64/wineditline | ✅ src/runtime/cli/repl.rs | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-winpthreads` 14.0.0.r426.g4564ee4b5-1 | MinGW-w64 winpthreads library (mingw-w64) | ✅ community/mingw-w64-winpthreads | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `mingw-w64-ucrt-x86_64-xz` 5.8.4-1 | Library and command line tools for XZ and LZMA compressed files (mingw-w64) | ✅ main/xz | ⏳ aphrody/mingw-w64/xz | — | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-zlib` 1.3.2-2 | Compression library implementing the deflate compression method found in gzip and PKZIP (mingw-w64) | ✅ main/zlib | ⏳ aphrody/mingw-w64/zlib | ✅ vendor/zlib | ✅ Linux / ⏳ Windows |
| `mingw-w64-ucrt-x86_64-zstd` 1.5.7-2 | Zstandard - Fast real-time compression algorithm (mingw-w64) | ✅ main/zstd | ⏳ aphrody/mingw-w64/zstd | ✅ vendor/zstd | ✅ Linux / ⏳ Windows |
| `mintty` 1~3.8.3-1 | terminal des lanceurs MSYS2 | ✅ community/cosmic-term | ✅ %LOCALAPPDATA%/Microsoft/WindowsApps/wt.exe | — | ✅ |
| `mpfr` 4.2.2-1 | Multiple-precision floating-point library | ✅ main/mpfr4 | ✅ C:/tools/llvm-mingw/bin/x86_64-w64-mingw32-clang.exe<br>✅ community/mingw-w64-gcc | — | ✅ |
| `msys2-keyring` 1~20260814-1 | MSYS2 PGP keyring | ✅ main/alpine-keys | — | — | ✅ |
| `msys2-launcher` 1.5-3 | Helper for launching MSYS2 shells | ✅ sans objet : lanceurs .exe des environnements MSYS2 ; Linux : shell de connexion (bunsh -l, /etc/shells) | — | ✅ src/runtime/cli/bunsh.rs (login shell) | ✅ |
| `msys2-runtime` 3.6.10-6 | couche POSIX (msys-2.0.dll, fork de Cygwin) liée par 495 PE de usr/bin | ✅ main/musl | ✅ sans objet : binaires Windows natifs (llvm-mingw, MSVC) : pas de couche POSIX | ✅ src/sys/lib.rs | ✅ |
| `nano` 9.2-1 | Pico editor clone with enhancements | ✅ main/nano | ✅ %LOCALAPPDATA%/Microsoft/WinGet/Links/hx.exe | — | ✅ |
| `ncurses` 6.6-2 | System V Release 4.0 curses emulation library | ✅ main/ncurses | — | ✅ src/runtime/api/Terminal.classes.ts | ✅ |
| `nettle` 4.0-1 | A low-level cryptographic library | ✅ main/nettle | — | ✅ src/runtime/crypto/EVP.rs | ✅ |
| `openssl` 3.6.5-1 | The Open Source toolkit for Secure Sockets Layer and Transport Layer Security | ✅ main/openssl | — | ✅ vendor/boringssl | ✅ |
| `p11-kit` 0.26.5-1 | Library to work with PKCS#11 modules | ✅ main/p11-kit | — | — | ✅ |
| `pacman` 6.1.0-25 | gestionnaire de paquets (pacman -S/-Syu), utilisé par les agents UI pour GTK4/Qt6 ucrt64 | ✅ main/apk-tools | ✅ src/install/system/winget/mod.rs | ✅ src/install/system/mod.rs | ✅ |
| `pacman-contrib` 1.10.6-2 | Contributed scripts and tools for pacman systems (MSYS2 port) | ✅ community/pacman | — | — | ✅ |
| `pacman-mirrors` 20260129-1 | MSYS2 mirror list for use by pacman | ✅ main/apk-tools | — | ✅ src/install/system/mod.rs | ✅ |
| `perl` 5.42.3-2 | A highly capable, feature-rich programming language | ✅ main/perl | — | — | ✅ |
| `pinentry` 1.3.3-1 | A collection of simple PIN or passphrase entry dialogs which utilize the Assuan protocol | ✅ main/pinentry | — | — | ✅ |
| `rebase` 4.5.0-5 | rebaseall des DLL msys après mise à jour (autorebase.bat) | ✅ sans objet : adresses de base des DLL Cygwin/MSYS (fork() émulé) ; les ELF sont PIC | ✅ sans objet : seulement pour les DLL msys-2.0 | — | ✅ |
| `sed` 4.9-1 | GNU stream editor | ✅ main/sed | ✅ %USERPROFILE%/.cargo/bin/sd.exe | — | ✅ |
| `tar` 1.35-3 | Utility used to store, backup, and transport files | ✅ main/tar | ✅ C:/Windows/System32/tar.exe | ✅ src/runtime/api/Archive.rs | ✅ |
| `time` 1.10-1 | Utility for monitoring a program's use of system resources | ✅ community/time | — | — | ✅ |
| `tzcode` 2026e-1 | Sources for time zone and daylight saving time data | ✅ main/tzdata | — | — | ✅ |
| `util-linux` 2.40.2-2 | Collection of basic system utilities | ✅ main/util-linux | — | — | ✅ |
| `wget` 1.25.0-4 | A network utility to retrieve files from the Web | ✅ main/wget | — | ✅ src/runtime/webcore/fetch.rs | ✅ |
| `which` 2.25-1 | A utility to show the full path of commands | ✅ main/which | ✅ C:/Windows/System32/where.exe | ✅ Bun Shell : which | ✅ |
| `xz` 5.8.4-1 | Library and command line tools for XZ and LZMA compressed files | ✅ main/xz | — | — | ✅ |
| `zlib` 1.3.2-1 | Compression library implementing the deflate compression method found in gzip and PKZIP | ✅ main/zlib | — | ✅ vendor/zlib | ✅ |
| `zstd` 1.5.7-1 | Zstandard - Fast real-time compression algorithm | ✅ main/zstd | — | ✅ vendor/zstd | ✅ |
<!-- msys2-mirror:table:end -->
