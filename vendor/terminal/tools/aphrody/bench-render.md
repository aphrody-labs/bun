# Rendu Direct3D 11 vs Direct3D 12 (BackendD3D12)

## État (2026-10-09)

Session interrompue (quota). Aucune mesure n'a encore été prise : ce document décrit la méthode et ce qui reste à faire.
`automatic` reste sur Direct3D 11 (il ne choisit jamais Direct3D 12) et la configuration hôte
`C:\aphrody\tools\config\host\windows\terminal\settings.json` n'a pas été modifiée.

Fait :

- `src/renderer/atlas/BackendD3D12.{h,cpp}` et les 5 HLSL `*_d3d12.hlsl` : `ConRenderAtlas.lib` compile en Release x64 (shaders d3d12 générés).
- `AtlasEngine.r.cpp` : `direct3d12` crée `BackendD3D12`. Si D3D12 est indisponible, il se rabat sur D3D11. Le swap chain est créé sur la file D3D12.
- Paramètre `direct3d12` : le schéma, les chaînes en-US/fr-FR et le test `SerializationTests::GraphicsAPI` (aller-retour JSON + `ToJson`) sont en place. `Microsoft.Terminal.Settings.Model.dll` compile.
- Architecture et contrat des shaders multi-passes : `src/renderer/atlas/README.md` (section « BackendD3D12 »).

Reste à faire, dans l'ordre :

1. Build complet Release x64 vert (`bun run build`, 14,9 min, `CascadiaPackage_0.0.1.0_x64.msix` produit, sans erreur ; journal `obj/aphrody/build-x64-Release.log`). À relancer après tout changement. Vérifier d'abord que `procs msbuild` ne montre aucun MSBuild sur `C:\terminal` :
   `cd C:\terminal && bun run build`
2. Tests unitaires. Les noms de cibles de la solution sont à vérifier dans `OpenConsole.slnx`, a priori `Terminal\Tests\SettingsModel_UnitTests` et `Terminal\Tests\Control_UnitTests`. Ensuite :
   `packages\Microsoft.Taef.*\build\Binaries\x64\te.exe bin\x64\Release\UnitTests_SettingsModel\SettingsModel.Unit.Tests.dll /name:*SerializationTests::GraphicsAPI`
   (ou `tools\runut.cmd`).
3. Déploiement : `bun run deploy`. Le script de déploiement réécrit le `settings.json` du paquet Dev.
4. Lancement réel avec `"rendering.graphicsAPI": "direct3d12"` dans le `settings.json` du paquet Dev. Vérifier que `d3d11on12.dll` est chargée dans `WindowsTerminal.exe`, puis faire une capture :
   `aphrody winclean screenshot`.
5. Mesures, en tâche de fond (environ 10 min) :
   `bun tools/aphrody/bench-render.ts --runs 5 --lines 2000000 --apis direct3d11,direct3d12`
   Reporter ci-dessous les médianes de `obj/aphrody/bench-render/results.json`.
6. Décision. Si D3D12 est au moins aussi rapide : `automatic` peut choisir D3D12 (`AtlasEngine::_recreateBackend`) et on ajoute `"rendering.graphicsAPI": "direct3d12"` à la configuration hôte. Sinon, D3D11 reste le défaut.

## Méthode (`bench-render.ts`)

- Paquet `WindowsTerminalDev`. Son `settings.json` (LocalState) est sauvegardé, `rendering.graphicsAPI` est forcé pour chaque API, puis le fichier est restauré à la fin.
- Chaque essai :
  - ferme le Terminal Dev, puis ouvre une fenêtre neuve de 160×48 ;
  - lance dans cette fenêtre un processus enfant qui chronomètre la charge de travail.
- Charges de travail :
  - `seq` : `seq 1 2000000` (Git for Windows), mesure du débit ;
  - `colors` : 200 000 lignes SGR 256 couleurs avec caractères de dessin de cadres (`type`).
- Mesures :
  - temps de trame, CPU et GPU occupés, latence d'affichage : PresentMon 2 (`--v2_metrics`, via `gsudo`), médiane et p95, avec le mode et le runtime de présentation ;
  - mémoire CPU : WorkingSet et Private ;
  - mémoire GPU : `\GPU Process Memory(*)\Dedicated Usage` et `Shared Usage` du PID ;
  - `usesD3D12` : présence de `d3d11on12.dll` dans le processus.
- La latence d'entrée n'est pas mesurée : il faudrait une injection de touches horodatée corrélée à PresentMon.

## Résultats

Non mesurés.
