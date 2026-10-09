# Couches Aphrody : Bun est la plateforme, aphrody la consomme

Décision de l'utilisateur, 2026-10-09.

## Règle

Toute la couche bas niveau appartient au fork Bun (aphrody-labs/bun) :

- systèmes : Windows, Linux, kernel ;
- FFI et bibliothèques natives ;
- crates Rust système ;
- interop .NET, C et C++.

Aphrody (C:\aphrody) consomme Bun. Il ne garde que le produit : API, IA, cloud, apps, MCP.

winclean reste dans aphrody, uniquement comme outil produit. Il couvre le computer use Windows, le nettoyage et l'optimisation, et il consomme `bun:windows`. Il ne possède aucun binding Win32 qui lui soit propre.

Cette logique vaut pour tout : à chaque fois qu'une capacité système existe à la fois dans aphrody et dans le fork, c'est la version du fork qui reste.

## Remplacements visés sur Windows 11

| Windows | Remplaçant | Propriétaire |
|---|---|---|
| explorer.exe (shell, barre des tâches, menu Démarrer, explorateur de fichiers) | COSMIC porté en Win32 (panel en appbar, launcher, cosmic-files, bg, workspaces) + WebOS M3 ; enregistrable comme shell Winlogon | CW, OS |
| cmd.exe, pwsh | bunsh (Bun Shell complet POSIX + builtins uutils) + shell aphrody, terminal cosmic-term/ConPTY, profil Windows Terminal | MS (langage et builtins), G1 (pty et terminal) |
| WinUI 3 / XAML | M3 (Material 3) : composants m3 rendus par Bun.WebView (couche webview unique) ou libcosmic thémé M3 | UI, WV, OS |
| .NET hors Bun | .NET 10 hébergé dans Bun (node-api-dotnet), `dotnet` piloté par Bun | W |

## Couverture native de kernel32 et de System32

L'ordre est le même pour chaque DLL :

1. `bun:ffi`, pour une couverture immédiate. Les signatures sont générées depuis les métadonnées Win32 (windows-rs / win32metadata).
2. Crates Rust `windows` / `windows-sys`, liées au fork, pour les chemins chauds.
3. Exports C++ (JSC bindings) quand l'objet JS l'exige.
4. node-api-dotnet pour les API .NET et WinRT.

Une table de couverture, DLL par DLL et fonction par fonction, est tenue dans `docs/aphrody/merge/M-windows.md`.

## Répartition, pour ne pas alourdir le binaire ni le runtime

Le binaire `bun` ne contient que le minimum chargé paresseusement : les modules `bun:windows`, `bun:linux` et `bun:cosmic`, et le cœur Win32 fréquent (registre, services, processus, fichiers, console, fenêtres de base). Aucune initialisation tant qu'un module n'est pas importé ; le démarrage et la RSS ne doivent pas régresser (voir project-perf-objective).

Le reste vit dans des paquets séparés, en plugins natifs (bun native plugin / N-API) chargés à la demande :

- la couverture exhaustive de System32 : `@aphrody/bun-windows-<famille>` (gdi, d3d, shell32, winrt, wmi…) ;
- l'hôte .NET : `@aphrody/bun-dotnet` ;
- les backends webview lourds (CEF) ;
- COSMIC : `packages/bun-cosmic` ;
- Tauri : `packages/bun-tauri` ;
- Obscura.

`bun:windows` réexporte ces paquets paresseusement quand ils sont installés.

Chaque ajout au binaire est mesuré : taille, temps de démarrage et RSS, avant et après.
