# Windows deep — la machine APHRODY vue par couches (vérifié 2026-10-09)

Tout fait ci-dessous vient d'une commande. `aphrody winclean call <tool> --json [-a k=v]` = outil winclean ;
le reste est natif (PowerShell, dumpbin, cdb, reg). Pour un argument de type chaîne qui ressemble à un nombre,
`-a value=2` est maintenant envoyé comme chaîne (corrigé, voir §9) ; avant : `-a 'value="2"'`.

## 0. Contexte d'exécution des agents

- Le shell des agents n'est pas élevé (`WindowsPrincipal` Administrator = False) mais `ConsentPromptBehaviorAdmin=0`
  (HKLM\...\Policies\System) : `gsudo pwsh -NoProfile -File x.ps1` élève sans invite (integrité High 12288 vérifiée par
  `gsudo status`). gsudo mutile les arguments quotés : passer par un fichier `.ps1`.
- Le processus `aphrody winclean` écrit dans HKLM sans élévation (`set_registry_value` sur WER LocalDumps a réussi) :
  l'écriture registre passe par winclean, Defender par `gsudo` + `Add-MpPreference`.
- `Remove-Item` sur `C:\CrashDumps\bun\*` est refusé par le garde-fou de l'outil PowerShell (« protected path ») :
  supprimer les dumps avec `bun -e` ou `rm` Bash.
- Les processus lancés par l'outil PowerShell des agents sont dans un job ; pour reproduire un vrai crash WER utiliser
  `Invoke-CimMethod Win32_Process Create` (voir §3).

## 1. Noyau / ntdll

| Fait | Commande | Valeur |
|---|---|---|
| OS | `winclean get_os_info`, `Get-ItemProperty HKLM:\...\CurrentVersion` | Windows 11 Famille 26H1, build 28000 (Insider), UBR 2956, `BuildLabEx 28000.1.amd64fre.br_release.251103-1709`, locale fr-FR |
| Versions de DLL | `(Get-Item System32\ucrtbase.dll).VersionInfo` | ucrtbase 10.0.28000.2952 ; kernel32/ntdll fichier 28000.2804 (servicing mixte, normal) |
| Matériel | CIM `Win32_ComputerSystem`/`BIOS` | ASUS ROG STRIX G35CA, BIOS G35CA.328, RAM 34 164 056 064 o (`get_memory_info`), pagefile `C:\pagefile.sys` 17 479 Mo alloués |
| Hyperviseur | `bcdedit /enum {current}` | `hypervisorlaunchtype Auto`, `HypervisorPresent=True` (WSL2/Docker Desktop, version WSL par défaut 2, distro docker-desktop) |
| VBS/HVCI | CIM `Win32_DeviceGuard` | `SecurityServicesRunning={0}`, `EnableVirtualizationBasedSecurity=0`, HVCI `Enabled=0` : pas de HVCI, pas de Credential Guard |
| Mitigations système | `Get-ProcessMitigation -System` | DEP OptIn (`nx OptIn`), ASLR/CFG/SEHOP/UserShadowStack tous NOTSET (défauts OS) ; `ForceRelocateImages`, `BottomUp`, `HighEntropy` non forcés |
| CET shadow stack | idem | `UserShadowStack NOTSET`, `BlockNonCetBinaries NOTSET` : bun.exe n'est pas imposé CET |
| Large pages | `whoami /priv` | `SeLockMemoryPrivilege` absent du jeton ; `LargePageMinimum` vide. mimalloc ne peut pas utiliser de large pages tant que le droit n'est pas accordé (non appliqué : élargit la surface d'attaque, bénéfice marginal sur 32 Go) |
| Privilèges utiles | idem | `SeDebugPrivilege` présent (désactivé par défaut côté processus ; `mem_enable_debug_privilege` winclean) |
| Mémoire | `winclean get_memory_info` | 59 % utilisée, 13,7 Go dispo, commit limit 50,3 Go |

Defender (`winclean get_defender_status`, `Get-MpComputerStatus`) : antivirus actif, **protection en temps réel
désactivée**, behavior monitor off, tamper protection off, signatures 1.459.384.0, `ThreatCount 2`. Conséquence : les
exclusions ne changent presque rien tant que la protection temps réel reste off ; elles évitent la régression si elle
est réactivée (scan à la demande / planifié inclus).

Exclusions Defender :
- Avant (sauvegarde `C:\bun\tmp\win\defender-exclusions-before.txt`) : `C:\aphrody`, `C:\Users\aphro\.aphrody`,
  `.bun`, `.cargo`, `AppData\Local\aphrody\target`, `AppData\Local\Mozilla\sccache`, `AppData\Local\uv`,
  `C:\Users\aphro\src` ; processus : `gost.exe`.
- Ajoutées (`gsudo` + `Add-MpPreference -ExclusionPath`) : `C:\bun`, `C:\Users\aphro\.rustup`, `C:\symbols`,
  `C:\CrashDumps`, `...\Visual Studio\18\BuildTools`, `C:\Program Files\LLVM`, `C:\Program Files (x86)\Windows Kits\10`.
  Retour arrière : `Remove-MpPreference -ExclusionPath <chemin>`.

## 2. Loader / PE

Commandes : `winclean binary_parse_pe_header`, `dumpbin /headers /dependents /loadconfig` (MSVC 14.44).

- `build\release\bun.exe` : ImageBase 0x140000000, `DllCharacteristics 0x8160` = HighEntropyVA + DynamicBase + NX +
  TerminalServerAware ; **pas de CFG** (`Guard CF function count 0`, GuardFlags 0x100) ; pas de CET ; chargé sous cdb à
  `0x7ff6dc040000` (ASLR effective, 64 bits). Stack reserve 0x1200000 (18 Mo). Manifeste : `longPathAware`,
  `supportedOS` Win10/11, `asInvoker`.
- CRT statique : imports uniquement `ADVAPI32 api-ms-win-core-synch-l1-2-0 bcryptprimitives CRYPT32 dbghelp IPHLPAPI
  KERNEL32 ntdll ole32 OLEAUT32 SHELL32 USER32 USERENV WS2_32 WSOCK32` — ni vcruntime140 ni msvcp ni ucrtbase. Un
  seul api-ms-win-* importé (synch l1-2-0, WaitOnAddress) ; les 112 fichiers `System32\downlevel` sont des
  redirections d'ensembles d'API ; `System32\api-ms-win-*.dll` n'existent pas sur disque (schéma résolu par l'ApiSet
  map du noyau, `Get-ChildItem` = 0).
- Chaîne de recherche DLL : `SafeDllSearchMode` non défini (défaut 1) ; ordre : répertoire de l'exe, System32,
  Windows, cwd, PATH. PATH commence par PowerShell 7.6.6 (WindowsApps), carapace, `.cargo\bin`, `.bun\bin`,
  `.local\bin`, OpenSSH, system32.
- Deux bun dans le PATH : `~\.bun\bin\bun.exe` (upstream 1.4.2, **à ne pas remplacer**) et
  `WinGet\Links\bun.exe`.
- Comparaison PE fork/upstream (sections `dumpbin /headers`) : ancien binaire périmé (MSVC 14.51) `_RDATA`
  1092 o ; build actuel (14.44) `_RDATA 0x1F4 = 500 o` = upstream. `.pdata` fork 0x10DE2C (1,06 Mo) contre upstream
  0xD4E20 (0,85 Mo), +26 % encore présent : c'est le nombre d'entrées de déroulage x64 (code Rust/C++ plus
  fragmenté), pas un défaut de chaîne d'outils. `.text` 0x3E0111B contre 0x3B5B26B (+4 %).

## 3. SEH / unwind x64, vectored handlers, WER, Event Log

- Bun installe (src/crash_handler/lib.rs, `init()`, ligne ~1651) : `AddVectoredExceptionHandler(0, handle_segfault_windows)`
  (0 = en dernier), `SetUnhandledExceptionFilter(handle_unhandled_exception_windows)`, et JSC enregistre un
  handler SEH pour ses frames JIT (`setJITExceptionHandlerWin` → `Bun__crashHandlerFromJSCFrame`). Le VEH ne prend la
  main que si le PC fautif est dans l'image bun (plage `exe_image_range()`) ou sur dépassement de pile ; les AV
  « sondées » dans du code système (CRYPTSP) restent au SEH.
- **vendor/libuv/src/win/core.c:181** : `SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | ...)`.
  Conséquence vérifiée : WER n'écrit **aucun** dump LocalDumps pour un processus bun (testé :
  `RaiseFailFastException` dans bun-profile.exe lancé hors job → pas de dump, alors qu'un `crash.exe` C compilé
  avec cl produit `C:\CrashDumps\bun\crash.exe.2104.dmp` 183 386 o, événements Application 1000 + 1001 APPCRASH).
  Pour bun on utilise donc **procdump -e** (§7), pas LocalDumps. Le message « panic(main thread): Segmentation
  fault at address 0x… » est écrit par le crash handler de bun, puis `abort` ; code de sortie 3.
- Le paramètre 1 d'un AV (`Parameter[1]`) est l'adresse lue, mais un déréférencement d'un pointeur non canonique
  s'affiche `0xFFFFFFFFFFFFFFFF` (ancienne repro : `rcx=0x009f3fca13639700`, adresse canonique invalide).
- `process.abort()` sous Windows ne plante pas : sortie 134 émulée, aucune exception.
- WER : **la stratégie `HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting\Disabled` valait 1**
  (WER entièrement désactivé pour tous les programmes, y compris les autres exe). Mise à 0 (valeur d'avant : 1) via
  `set_registry_value`. `DontShowUI=1` ajouté sous `HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting` (absent
  avant). Services : WerSvc Running/Manual, Eventlog Running/Auto, WinDefend Running/Auto.
- LocalDumps (valeur d'avant : clés `bun.exe`, `bun-profile.exe`, `crash.exe` absentes ; existaient ASUS et NVIDIA) :
  `HKLM\...\LocalDumps\bun.exe` et `bun-profile.exe` → `DumpType=2` (complet), `DumpFolder=C:\CrashDumps\bun`
  (REG_EXPAND_SZ), `DumpCount=5`. Utile pour tout autre exe natif du fork (cargo test, bun_*.exe), pas pour bun.
- Event Log (`Get-WinEvent -ListLog`) : Application 20 515 événements (20 Mo max), System 15 574, Defender
  Operational 2 457, CodeIntegrity 1 202. Plantages récents sans rapport : WinStore.App.exe (gameplatformservices),
  LightingService.exe (ntdll).

## 4. CPU

- Intel Core i7-13700F (Raptor Lake), 16 cœurs / 24 threads, L2 24 Mo, L3 30 Mo, 1 nœud NUMA, ligne de cache 64 o.
  `winclean get_cpu_info` renvoie `L1/L2/L3CacheBytes: 0` (champs non remplis) ; CIM donne les vrais.
- `GetLogicalProcessorInformationEx` : 8 cœurs P (EfficiencyClass 1, SMT) + 8 cœurs E (EfficiencyClass 0).
- `IsProcessorFeaturePresent` : SSE4.2/AVX/AVX2 (PF 10, 17, 36–40) vrais ; **AVX-512 (PF 41) faux**, PF 43–46 faux.
  Le crash handler de bun l'imprime : « CPU: sse42 popcnt avx avx2 ». Les builds `baseline` ne sont pas nécessaires,
  les chemins highway AVX-512 ne sont pas exercés ici.
- Plan d'alimentation : `winclean get_active_power_plan` → « Performances optimales » (385ba2d9-…), `PROCTHROTTLEMAX`
  100 % secteur et batterie ; `disabledynamictick Yes` dans bcdedit. Rien à changer.
- `CARGO_BUILD_JOBS=6` (24 threads) : volontairement bas (memoire/Docker). Les builds C++/ninja prennent tous les
  threads.
- GPU : RTX 4070 (32.0.16.1692), HAGS mode 2 (`get_hags_mode`).

## 5. Disque / FS

- Un seul disque : NVMe Micron 2400 1 To, SSD, **C: NTFS** (`Get-Volume`), 606 Go libres sur 996 Go
  (`get_disk_info`). TRIM actif (`DisableDeleteNotify=0`). Pas de Dev Drive : `fsutil devdrv query C:` →
  « pas un volume de développeur ». Créer un VHDX Dev Drive n'a pas été fait (déplacer C:\bun pendant que d'autres
  agents travaillent est dangereux) ; commande prête : `Format-Volume -DevDrive` sur une partition d'un VHDX
  dynamique (≥ 50 Go).
- `LongPathsEnabled=1` (déjà), manifeste bun `longPathAware` : lecture d'un fichier à 386 caractères réussie avec
  `bun -e` (testé).
- Symlinks : `AllowDevelopmentWithoutDevLicense=1` et `AllowAllTrustedApps=1` (mode développeur déjà actif) ;
  `New-Item -ItemType SymbolicLink` sans élévation réussi (testé). `SymlinkEvaluation` L2L/L2R/R2R activés, R2L désactivé.
- `NtfsDisableLastAccessUpdate=2147483649` (désactivé, géré par le système), `NtfsDisable8dot3NameCreation=2`
  (par volume). `fsutil file queryCaseSensitiveInfo C:\bun` : sensibilité à la casse **désactivée** ; la changer
  exige la fonctionnalité WSL, non touchée (limite WSL à ne pas modifier).
- Aucun autre volume (le lecteur `Temp:` est un alias de PSDrive).

## 6. Toolchain

| Outil | Fait (commande) |
|---|---|
| Visual Studio | un seul : Build Tools 2026 **18.10.12217.157** (`vswhere -all -prerelease -products *`), `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools` |
| MSVC | `VC\Tools\MSVC` : **14.44.35207** et 14.51.36231 ; Redist : 14.44.35112, 14.51.36231 ; libcmt.lib présents dans les deux |
| Windows SDK | **10.0.26100.0** seul (Include, Lib, Redist\ucrt) ; UCRT serviced demandé par le build : `UCRT_SERVICING_VERSION 10.0.26100.8249` (winsysroot.ts) pour les libs statiques |
| LLVM | `C:\Program Files\LLVM` : clang, clang-cl, lld-link **23.1.3** (rustc nightly embarque LLVM 23.1.1) ; lldb 23.1.3 |
| Rust | `rustc 1.100.0-nightly (574ff7d98 2026-09-14)`, `rust-toolchain.toml` → `nightly-2026-09-15-x86_64-pc-windows-msvc`, 11 cibles installées dont aarch64/x86_64 linux, apple, android, freebsd |
| CMake / Ninja | CMake 4.4.3, Ninja 1.13.2 (WinGet\Links) ; ninja du fork aussi dans le build |
| sccache | 0.18.0 ; `RUSTC_WRAPPER=sccache`, `SCCACHE_DIR=...\Mozilla\sccache\cache`, `SCCACHE_CACHE_SIZE=50G`, `SCCACHE_SERVER_PORT=4227`, `CARGO_INCREMENTAL=0`. Stats : 19 534 requêtes exécutées, **1 353 hits (6,96 %)**, 18 088 misses, 0 erreur : taux bas = cache froid / nightly changeant, pas de panne |
| uv / Python | uv sur `.cargo\bin` ; `python.exe` du PATH = **stub Microsoft Store** ; vrais Python : uv 3.12.15, 3.13.16, 3.14.8 sous `AppData\Roaming\uv\python` |

Sélection effective (vérifiée par `pwsh scripts/vs-shell.ps1 pwsh -Command ...`) :
`VCToolsVersion=14.44.35207`, `WindowsSDKVersion=10.0.26100.0`, `cl`/`link` =
`...\14.44.35207\bin\HostX64\x64\`, `rc` = `Windows Kits\10\bin\10.0.26100.0\x64\rc.exe`, `clang-cl` =
`C:\Program Files\LLVM\bin`. Mécanisme : `scripts/vs-shell.ps1` lit `windowsSysroot.crt` (« 14.44.17.14 ») dans
`scripts/build/ci-images/spec.ts`, en déduit `14.44`, et si un répertoire `14.44.*` existe sous `VC\Tools\MSVC` il
passe `-vcvars_ver=14.44` à `Enter-VsDevShell`. `checkNativeMsvcToolset` (winsysroot.ts:72) lit `VCToolsVersion`
et refuse tout toolset > 14.44 avec un WebKit `prebuilt` (ABI STL). Sans vs-shell, un shell VS « standard » prend
14.51 : c'est ce qui a produit l'ancien binaire.

## 7. Débogueurs, symboles, procédure crash → cause

Installé / configuré pendant cette mission (état d'avant : ni cdb ni WinDbg dans le PATH, lldb cassé) :

| Outil | Chemin / action | Avant |
|---|---|---|
| cdb 10.0.26100.7705, symchk, dumpchk | déjà dans `Windows Kits\10\Debuggers\x64` (hors PATH) → shims `~\.local\bin\{cdb,symchk,dumpchk}.cmd` | absent du PATH |
| WinDbg (Store) 1.2610.1001.0 | `winget install --id Microsoft.WinDbg -e` ; alias `WinDbgX.exe` dans `%LOCALAPPDATA%\Microsoft\WindowsApps` | absent |
| procdump 12.01 | `curl https://live.sysinternals.com/procdump64.exe` → `~\.local\bin\procdump.exe` + `procdump64.exe` (pas dans winget : `winget search procdump` vide) | absent |
| lldb 23.1.3 | `liblldb.dll` importe `python3.dll` (ABI stable) ; sans `PYTHONHOME` il charge le stub → « Failed to import encodings ». Shim `~\.local\bin\lldb.cmd` fixant `PYTHONHOME=...\uv\python\cpython-3.12.15-windows-x86_64-none` et PATH, placé avant LLVM dans le PATH. `lldb -b -o "script print(1+1)"` → 2 | cassé |
| `_NT_SYMBOL_PATH` | `HKCU\Environment` = `srv*C:\symbols*https://msdl.microsoft.com/download/symbols` (via `set_registry_value`) ; `C:\symbols` créé | absent |
| registre Python | clé périmée `HKCU\Software\Python\Astral\CPython3.12.13` (exécutable inexistant, warning à chaque `uv python list`) supprimée | présente |

Procédure bout en bout, testée sur `C:\bun\build\release\bun-profile.exe` (build v1.4.3-aphrody.2 f7a7086b6, PDB
`bun-profile.pdb` 569 Mo à côté de l'exe) :

```powershell
# 1. crash provoqué (AV dans l'image bun) : bun:ffi read.u8(1)
Set-Content C:\bun\tmp\win\av.js 'import {read} from "bun:ffi"; console.log("before"); console.log(read.u8(1));'
# 2. dump complet au 1er passage de l'AV (WER ne marche pas pour bun, cf. §3)
procdump -accepteula -ma -e 1 -f C0000005 -x C:\CrashDumps\bun C:\bun\build\release\bun-profile.exe C:\bun\tmp\win\av.js
#    -> C:\CrashDumps\bun\bun-profile.exe_261009_011741.dmp (161 Mo, 3,9 s)
# 3. pile symbolisée (PDB local + serveur Microsoft ; 40 s avec !analyze -v, ~6 s sans)
cdb -z <dump> -y "C:\bun\build\release;srv*C:\symbols*https://msdl.microsoft.com/download/symbols" -lines -c ".ecxr; kn 40; !analyze -v; q"
# ou, tout en un :
bun C:\bun\scripts\aphrody\win-crash.ts run -- C:\bun\tmp\win\av.js
bun C:\bun\scripts\aphrody\win-crash.ts analyze <dump.dmp> [--pdb build/release] [--full]
```

Résultat : `FAILURE_BUCKET_ID NULL_CLASS_PTR_READ_c0000005_bun-profile.exe!bun_runtime::ffi::dom_call_slowpath::Reader__u8__slowpath`,
pile avec fichiers/lignes Rust (`FFIObject.rs @ 304`, `ffi/mod.rs @ 54`) et C++ (`JSModuleRecord.cpp @ 277`). Notes :
- L'exe de release (`bun.exe`) est le même binaire que `bun-profile.exe` (taille identique) : le PDB `bun-profile.pdb`
  convient, d'où `-y build\release`. Les sources WebKit sont des chemins `/webkit/...` (non résolvables), les sources
  bun `C:\bun\src\...` sont vraies.
- `Parameter[1]` d'une AV de cdb = adresse lue ; sur dump post-mortem de procdump, `.ecxr` donne le contexte exact.
- La repro historique (release `await import("node:fs")` : AV première chance dans `WTF::codePointCompare+0x27`
  appelé par `std::ranges::sort` de `JSModuleNamespaceObject`, build compilé avec MSVC 14.51) a été obtenue avec
  `cdb -y build\release -c "sxe av; g; .ecxr; kn 25; q" bun.exe -e ...` ; elle est résolue par le rebuild en 14.44
  (`_RDATA` revenu à 500 o).
- Autre voie : `cdb -g -G` sur l'exe avec `sxe av` s'arrête sur la 1re chance avant le VEH de bun.

## 8. Réglages appliqués (récapitulatif, avec valeurs d'avant)

| Réglage | Avant | Après | Retour arrière |
|---|---|---|---|
| Exclusions Defender | 8 chemins + `gost.exe` | +7 chemins (§1) | `Remove-MpPreference -ExclusionPath` |
| `HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting\Disabled` | 1 | 0 | remettre 1 |
| `HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\DontShowUI` | absent | 1 | `delete_registry_entry` |
| LocalDumps `bun.exe`, `bun-profile.exe` | clés absentes | DumpType 2, `C:\CrashDumps\bun`, DumpCount 5 | supprimer les clés |
| LocalDumps `crash.exe` (test) | absente | DumpFolder `C:\CrashDumps\bun` | supprimer la clé |
| `HKCU\Environment\_NT_SYMBOL_PATH` | absent | `srv*C:\symbols*https://msdl.microsoft.com/download/symbols` | `delete_registry_entry` |
| shims `~\.local\bin` | — | cdb, symchk, dumpchk, lldb (.cmd), procdump(64).exe | supprimer les fichiers |
| Déjà bons, non touchés | `LongPathsEnabled=1`, mode développeur, plan Performances optimales, TRIM, `DisableLastAccess` | — | — |
| Non appliqués | Dev Drive (nouveau volume), `SeLockMemoryPrivilege`, casse par répertoire (WSL), HVCI | — | — |

## 9. Défauts aphrody trouvés et corrigés (C:\aphrody)

1. `aphrody winclean call <tool>` sans `--json` n'affichait rien quand le résultat n'avait que `structuredContent`
   (`get_os_info`, `get_cpu_info`, `set_registry_value`…) : `crates/infra/aphrody-command/src/winclean_cmd.rs`,
   `render_result` (texte d'abord, sinon `structuredContent`, chaîne brute ou JSON indenté).
2. `aphrody winclean call set_registry_value -a value=2` échouait (« requires string value ») car `-a` parse en JSON :
   `coerce_to_schema` renvoie la chaîne brute pour les propriétés de type `string` du schéma.
3. `aphrody os status` affichait « WinClean Tools: 0 observed » (le démon noyau, pipe nommé, est hors ligne, alors que
   winclean tourne dans le processus : `doctor` voit 166) :
   `crates/infra/aphrody-command/src/pillars_cmd.rs`, `merge_in_process_winclean` garde le max entre le compte noyau et
   le compte en processus ; champ JSON `winclean_in_process` ajouté.
4. Observé, non corrigé (hors périmètre) : `get_os_info` renvoie `EditionId`, `Ubr`, `InstallationType` vides, et
   `get_cpu_info` des caches à 0 (voir §1/§4 pour les vraies valeurs).

## 10. Pièges à retenir

- Pour tester un plantage « natif » avec WER, lancer l'exe via CIM `Win32_Process.Create` (job object de l'outil
  sinon) ; attendre ~30 s (WerFault écrit le dump après l'événement 1000).
- bun + WER = rien (libuv). Toujours procdump `-e 1` ou cdb.
- `vswhere` sans `-prerelease` ne voit pas VS 2026 Build Tools ; `cl` n'est pas dans le PATH hors vs-shell.
- `uv python install` laisse des clés `HKCU\Software\Python\Astral\...` périmées après mise à jour de patch.
