# Bun Win32 / Windows / NTFS / WebOS / Omar

État vérifié le 12 octobre 2026 sur Windows natif, avec le fork `aphrody-labs/bun`.

## Runtime installé

```text
Version       1.4.4
Révision      2ae8fc65fba1d05c423a2433b1195835109942b6
Source        https://github.com/aphrody-labs/bun/releases/download/bun-v1.4.4/bun-windows-x64-full.zip
Binaire       $APHRODY_BUN_CHECKOUT\build\release\bun.exe
```

Le runtime installé est bien le fork Aphrody, pas un Bun upstream générique.

## `bun:windows`

Import vérifié avec le binaire installé. Les surfaces exposées sont :

```text
Job, clipboard, conpty, default, eventLog, families, family, gpu,
isElevated, isSupported, isWindows11, knownFolder, knownFolders, memory,
notify, ntfs, pe, processes, registry, services, storage, systemInfo,
toast, toolchain, version, win32, wsl
```

`bun:windows.ntfs` expose actuellement :

```text
FILE_ATTRIBUTE_DIRECTORY, ROOT_RECORD, Volume
```

`bun:windows.storage.drives()` fonctionne et retourne le disque logique réel.
Dernière mesure : `C:\`, disque fixe, 996911943680 octets au total,
260338860032 octets libres et disponibles.

`bun:windows` n’expose pas de namespace `webos`. WebOS est un package Bun
applicatif et non une famille native du runtime.

## Implémentation Win32/NTFS dans le fork

Les sources natives sont présentes dans :

- `src/runtime/windows/mod.rs`
- `src/runtime/windows/host.rs`
- `src/runtime/windows/sys/ntfs.rs`
- `src/runtime/windows/sys/storage.rs`
- `src/runtime/windows/sys/process.rs`
- `src/runtime/windows/sys/registry.rs`
- `src/runtime/windows/sys/services.rs`
- `src/runtime/windows/sys/wintrust.rs`
- `src/windows_sys/externs.rs`

`src/runtime/windows/sys/ntfs.rs` couvre les opérations NTFS liées au journal
USN et à l’énumération MFT via `FSCTL_QUERY_USN_JOURNAL`,
`FSCTL_CREATE_USN_JOURNAL`, `FSCTL_READ_USN_JOURNAL` et
`FSCTL_ENUM_USN_DATA`.

Le sous-projet d’indexation est présent dans :

- `packages/bun-os/fsindex/src/ntfs_win.rs`
- `packages/bun-os/fsindex/src/mft.rs`
- `packages/bun-os/fsindex/src/everything.rs`
- `packages/bun-os/fsindex/src/everything_sdk/win.rs`
- `packages/bun-tools/src/indexing/ntfs.ts`
- `packages/bun-tools/src/indexing/pe.ts`
- `packages/bun-tools/src/indexing/cache.ts`
- `packages/bun-tools/src/indexing/graph.ts`
- `packages/bun-tools/src/indexing/resources.ts`

## Index System32 EXE/DLL

Inventaire borné du répertoire réel `C:\Windows\System32` :

```text
EXE       642
DLL       3588
Fichiers  4645
```

Les sources d’index PE/System32 sont rattachées au propriétaire
`bun:windows.pe + bun:ffi + bun:sqlite`. La politique déclarée impose un
répertoire racine explicite, des budgets de lecture bornés, une persistance
atomique et le maintien des imports ambigus comme non résolus.

## WebOS

Le package existe dans `packages/bun-webos` avec 100 fichiers suivis par
l’inventaire local. Les tests ciblés exécutés avec Bun 1.4.4 sont passés :

```text
42 pass
0 fail
145 expect()
```

La couverture vérifiée inclut Fluent/WebView, WASM/OPFS, permissions navigateur,
parsers système, exploration d’index, PE/hardlinks, Bun Shell, `bun:sqlite`,
processus, fichiers, PTY, FFI et garde hôte/origine.

## Omar dans le fork Bun

Omar n’est pas seulement référencé par un fichier local : son intégration est
présente dans l’historique Git du fork. Le dépôt source déclaré est :

```text
https://github.com/aphrody-labs/omar
revision d565a5a67d570e3648c091c351698781fb24bf54
```

Preuves dans le fork :

- `packages/bun-tools/src/indexing/*`
- `packages/bun-webos/*`
- `$APHRODY_BUN_CHECKOUT\.coord\omar-index-map.json`
- `$APHRODY_BUN_CHECKOUT\.coord\omar-webos-map.json`
- commits `614b3dde802` — migration des capacités Omar vers les packages Bun
- commit `68c7d86dd53` — graph, WebOS et gates Windows

La map de migration relie notamment :

```text
omar/server/ntfs-index*.ts       -> packages/bun-tools/src/indexing/ntfs.ts
omar/server/index-system32*.ts   -> packages/bun-tools/src/indexing/pe.ts
omar/server/warmCache*.ts        -> packages/bun-tools/src/indexing/cache.ts
omar/server/graph.ts             -> packages/bun-tools/src/indexing/graph.ts
omar/server/apps/bun-webos/*     -> packages/bun-webos/*
```

Le checkout local `C:\omar` n’existe pas, ce qui est cohérent avec la règle du
fork : l’intégration qualifiée est dans Bun et ne crée pas une copie parallèle.

## Limites vérifiées

- La présence des sources ne prouve pas que chaque chemin natif est exporté par
  le binaire installé ; l’export public `bun:windows` est la preuve runtime.
- Il n’existe pas actuellement d’export runtime `bun:webos`.
- L’index System32 mesuré est un inventaire de fichiers ; il ne constitue pas
  une signature Authenticode ni une analyse complète des imports.
- Les maps Omar indiquent explicitement : pas d’auto-démarrage de service, pas
  de découverte implicite de catalogues, budgets bornés et persistance atomique.
