# Terminal Aphrody

Terminal de la distribution Aphrody, construit depuis `aphrody-labs/terminal`, branche `aphrody`.
La branche suit `microsoft/terminal` `main`, la source du canal Canary (build nocturne `build/pipelines/ob-nightly.yml`, branding `Canary`).
Le paquet local porte le branding `Dev` : identité `WindowsTerminalDev`, alias `wtd.exe`. Il coexiste avec le Windows Terminal stable (`Microsoft.WindowsTerminal`).

## Prérequis

- Windows 11 avec le mode développeur activé (`AllowDevelopmentWithoutDevLicense=1`), requis pour `Add-AppxPackage -Register`.
- Visual Studio 2026 : un IDE ou Build Tools. `bun run setup` installe les composants manquants.
- Bun (le runtime de la distribution), `gsudo` ou le `sudo` de Windows pour l'élévation, `pwsh`.

## Commandes

| Commande | Effet |
| --- | --- |
| `bun run setup` | Détecte VS (vswhere) et ajoute les composants de `.vsconfig` (`setup.exe modify --config … --quiet --norestart`, élevé par gsudo ou sudo). Sur Build Tools, les workloads IDE sont remplacés par leurs équivalents Build Tools (`VCTools`, `UniversalBuildTools`, `ManagedDesktopBuildTools`…). Vérifie ensuite le Windows SDK de `src/common.build.pre.props`, le SDK .NET et vcpkg, puis restaure NuGet (`dep/nuget/packages.config`, `build/packages.config`, `msbuild /t:Restore`). Idempotent. `--no-vs-install` signale les composants manquants sans les installer. |
| `bun run build [Release\|Debug] [x64\|ARM64]` | `msbuild OpenConsole.slnx /t:Terminal\CascadiaPackage` dans l'environnement `VsDevCmd` (même chemin qu'`Invoke-OpenConsoleBuild`). Release x64 par défaut, `WT_BRANDING` change le branding. Le nombre de `cl.exe` simultanés (MultiToolTask) suit la mémoire virtuelle libre, à raison de 1,5 Go par compilation ; `WT_JOBS` le fixe. |
| `bun run deploy` | Décompresse le dernier `.msix` (`makeappx unpack`) dans `%LOCALAPPDATA%\aphrody\terminal\layout\<id>`, l'enregistre (`Add-AppxPackage -Register`), copie la config de profils canonique dans le `LocalState` du paquet, installe le fragment de profils puis lance `wtd.exe`. `--no-launch` saute le lancement. |
| `bun run check:profiles [settings.json]` | Ouvre la commandline de chaque profil visible dans un PTY headless (`aphrody.exe shell term`) et vérifie qu'un écran s'affiche. |
| `bun run bench [--runs N] [--label nom]` | Mesure le temps entre le lancement de `wt`/`wtd` et le démarrage du shell dans le nouvel onglet. |
| `bun run sync [--push]` | `git fetch upstream main` puis rebase de `aphrody`. `--push` pousse `aphrody` et aligne `main` du dépôt sur upstream. |
| `bun run clean [--all]` | Supprime `bin`, `obj`, `AppPackages` et les `Generated Files`. `--all` désinstalle aussi le paquet, son layout et le fragment. |

## Chemins

| Chemin | Contenu |
| --- | --- |
| `obj\aphrody\` | Journaux (`build-x64-Release.log`, `.binlog`, `restore*.log`, `vs-installer.log`), `vsconfig.json` généré, mesures `bench-*.json`. |
| `src\cascadia\CascadiaPackage\AppPackages\` | `.msix` produit par le build. |
| `%LOCALAPPDATA%\aphrody\terminal\layout\` | Layout enregistré du paquet. |
| `%LOCALAPPDATA%\Packages\WindowsTerminalDev_8wekyb3d8bbwe\LocalState\settings.json` | Config appliquée, copie de `C:\aphrody\tools\config\host\windows\terminal\settings.json` plus `tools/aphrody/settings.overrides.json` s'il existe. |
| `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\Aphrody\aphrody-terminal.json` | Fragment `tools/aphrody/fragment.json` : profils Aphrody Shell (Nushell, `aphrody.exe shell start`) et Bun Shell. |

## Profils et thème

Aphrody Shell et Bun Shell sont des profils dynamiques livrés par fragment, sans patch C++. Leurs GUID sont ceux de la config canonique, qui se superpose donc au fragment.
Le fragment est lu par toutes les éditions de Terminal installées, stable comprise.
Le schéma de couleurs `Aphrody M3` est généré depuis les tokens M3 par la crate `aphrody-identity`, dans `C:\aphrody\tools\config\host\windows\terminal\aphrody-m3.wt-scheme.json`. `fragment.json` le référence par son nom. `deploy` joint au fragment installé les schémas référencés tels que ce fichier les définit, ce qui les rend visibles par toutes les éditions installées. Si le fichier est absent, et qu'aucun autre fragment ne déclare le schéma, la référence est omise, car un schéma inconnu provoque un avertissement au démarrage.

## État au 2026-10-09

- Base : `microsoft/terminal` `main` 6676c6f938f. `bun run setup` passe et est idempotent : 31 composants, 9,6 s à la seconde exécution. Les composants UWP ont été ajoutés à VS Build Tools 18.10 en 10,3 min.
- Le build de `C:\terminal` échoue tant que le travail en cours sur Direct3D 12 n'est pas commité : `atlas.vcxproj` référence `BackendD3D12.cpp`, absent. Le HEAD commité (9566761aa) a été construit dans le worktree `C:\tmp\wtb` : Release x64 OK en 14,1 min avec 9 compilations parallèles.
- Restent à faire : le deploy, la vérification des profils et les mesures de démarrage. Commandes :

```sh
cd C:\tmp\wtb && bun run deploy
bun run check:profiles "%LOCALAPPDATA%\Packages\WindowsTerminalDev_8wekyb3d8bbwe\LocalState\settings.json"
bun run bench --runs 10 --label baseline
```

Un réglage n'entre dans `tools/aphrody/settings.overrides.json` (par exemple `disabledProfileSources` avec `Windows.Terminal.Wsl` ou `Windows.Terminal.SshHostGenerator`) que si `bun run bench --label <essai>` montre un gain sur la médiane.

## CI

`.github/workflows/aphrody-build.yml` exécute `bun run setup` (l'image n'a pas les composants UWP de `.vsconfig`) puis `bun run build` sur `windows-2025` à chaque push sur `aphrody`, et publie le `.msix` et les journaux. Le workflow upstream `spelling2` (Spell checking) est désactivé sur ce dépôt. `addToProject` (issues) et `winget` (releases publiées) ne se déclenchent pas : le dépôt n'a ni issues ni releases.
