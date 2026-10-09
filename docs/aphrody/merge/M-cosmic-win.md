# M-cosmic-win — COSMIC natif Win32 sur Windows 11

Agent CW, 2026-10-09. COSMIC epoch-1.10.0 (System76), porté sur Win32 par nos forks `aphrody-labs/*`, sans
Wayland, sans X11 et sans cosmic-comp. Les preuves viennent de Windows 11 Home 10.0.28000. Le statut ✅ exige un
lancement réel avec fenêtre trouvée par UI Automation et une capture ; ⏳ veut dire non prouvé.

## Dépôts

- `C:\cosmic` = `aphrody-labs/cosmic-epoch` (branche `master`, commit 64bf1f3) : tous les sous-modules repointés
  vers `https://github.com/aphrody-labs/<repo>`, clones `--filter=blob:none`. Sous-modules ajoutés : `libcosmic`,
  `iced`, `cosmic-text`, `cosmic-protocols`. `cosmic-config` n'a pas de dépôt séparé : c'est un crate du dépôt
  libcosmic. Le fork de `cosmic-applibrary` s'appelle `cosmic-app-library`.
- `C:\forks\libcosmic` : même fork que `C:\cosmic\libcosmic` (origin/master dbc62f2, rien de non poussé), laissé en
  place.
- `C:\cosmic\.cargo\config.toml` : `target-dir = C:/cosmic/target`, `jobs = 12`.
  - `[patch."https://github.com/pop-os/libcosmic"]` remplace libcosmic, cosmic-config et cosmic-theme par
    `aphrody-labs/libcosmic` à la révision des apps (5a8bd94).
  - `[patch."https://github.com/pop-os/cosmic-files.git"]` les remplace par la branche `win32` de
    `aphrody-labs/cosmic-files` (worktree `C:\cosmic\.wt\cosmic-files`).
- Construction : `cargo +1.98.1 build --release --no-default-features --features wgpu`, avec `RUSTC_WRAPPER=`
  (sccache plante sur certains crates : rustc sort avec le code 2 sans message).

## Matrice

| Composant                                                                               | Statut     | Preuve / reste                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cosmic-edit                                                                             | ✅         | Construit en 1 min 24 s, `cosmic-edit.exe` de 38 Mo. Lancé sur `README.md` : fenêtre UIA « README.md - Éditeur de texte COSMIC », 1024×768, `Responding=True`. Capture `img/cosmic-win-cosmic-edit.png` : menus, onglet, coloration syntaxique.                                                                         |
| cosmic-files (bibliothèque)                                                             | ✅ compile | Branche `win32` : `as_encoded_bytes` au lieu d'`OsStrExt` unix ; `is_mime_subclass_of` sans shared-mime-info hors unix. L'app autonome n'a pas encore été lancée.                                                                                                                                                       |
| bun-cosmic (assistant libcosmic de `bun:cosmic`)                                        | ✅         | `packages/bun-cosmic` construit sous Windows (winit Win32, `multi-window`). `bun-cosmic.exe window` affiche la fenêtre UIA « bun:cosmic sous Windows 11 », 480×240, `Responding=True`. Capture `img/cosmic-win-bun-cosmic-window.png`.                                                                                  |
| `bun:cosmic` text (cosmic-text)                                                         | ✅ Rust    | `cargo test -p bun_cosmic` sous Windows : `lays_out_and_renders_a_loaded_font` réussit (Space Mono, 2 lignes, 48 px, pixels rouges). Le test JS `windows` est écrit mais n'a pas tourné : pas de `bun bd` local.                                                                                                        |
| `bun:cosmic` config                                                                     | ⏳ JS      | Sous `%APPDATA%\cosmic\<nom>\v<n>` (états sous `%LOCALAPPDATA%`, défauts sous `%ProgramData%`), comme `dirs::config_dir()`. Test écrit, à exécuter par la CI Windows.                                                                                                                                                   |
| `bun:cosmic` notify                                                                     | ⏳ JS      | Passe par `bun:windows` `notify` (toast WinRT), sans actions ni `wait`.                                                                                                                                                                                                                                                 |
| `bun:cosmic` apps                                                                       | ⏳         | L'index `.desktop` reste Linux : freedesktop-desktop-entry 0.8.3 ne compile pas sous Windows (`xdg::BaseDirectories`). Les raccourcis `.lnk` du menu Démarrer sont à faire par `bun:windows`.                                                                                                                           |
| cosmic-term (ConPTY)                                                                    | ✅         | Construit sans modification de code (2 min 40 s, `--no-default-features --features wgpu`, donc sans secret-service). Fenêtre UIA « Administrateur : …powershell.exe — Terminal COSMIC », 1024×768, `Responding=True`. PowerShell tourne derrière ConPTY (alacritty_terminal). Capture `img/cosmic-win-cosmic-term.png`. |
| cosmic-settings, cosmic-store (`bun pm winget`), cosmic-player, cosmic-launcher         | ⏳         | Non construits.                                                                                                                                                                                                                                                                                                         |
| cosmic-panel et applets (appbar Win32), cosmic-bg, cosmic-workspaces (bureaux virtuels) | ⏳         | Non portés. Ils dépendent de wlr-layer-shell et des protocoles cosmic : il faut un backend appbar (`SHAppBarMessage`) et `IVirtualDesktopManager` via `bun:windows`.                                                                                                                                                    |
| cosmic-comp                                                                             | —          | Non porté, conformément au brief. Sous Windows c'est DWM qui compose. cosmic-comp reste le compositeur de l'OS Bun (Alpine) et des sessions WSLg.                                                                                                                                                                       |
| Thème et accent Windows, DPI v2, IFileDialog, cosmic-config par ReadDirectoryChangesW   | ⏳         | winit fournit déjà le DPI par moniteur. Le reste n'est pas branché.                                                                                                                                                                                                                                                     |

## Shell Winlogon (remplacer explorer.exe)

Plan, rien n'est encore enregistré sur la machine :

- Activation : `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell` (REG_SZ) reçoit le lanceur
  de bureau COSMIC. Ce lanceur démarre cosmic-panel (appbar et barre des tâches), cosmic-launcher (menu Démarrer),
  cosmic-bg, cosmic-files (explorateur) et la WebOS M3 (`packages/bun-webos`).
- Retour à explorer.exe : supprimer la valeur HKCU, ce qui fait retomber sur la valeur HKLM `explorer.exe`, puis se
  déconnecter. Un test doit vérifier la lecture et la suppression de la valeur, et la présence de la valeur HKLM.
- Tout passe par `bun:windows` (agent W), sans binding Win32 propre à COSMIC.
- Condition d'activation : panel, launcher et bg prouvés ✅. Ce n'est pas le cas aujourd'hui.

## Restes

1. cosmic-term : gestionnaire de mots de passe (secret-service → Credential Manager par `bun:windows`).
2. settings, store, player et launcher, dans cet ordre. Pour chacun : features sans wayland, corrections `cfg(unix)`
   dans les forks, sur des branches `win32`.
3. Backends appbar et bureaux virtuels dans `bun:windows`. Ensuite panel, bg et workspaces, puis le shell Winlogon
   avec son test de retour.
4. Faire tourner `test/js/bun/cosmic/cosmic.test.ts` (sections `windows` et `linux`) dans la CI. Vérifier que Linux
   ne régresse pas sous Docker sur le VPS (Ubuntu 26.04 et Alpine 3.24).
