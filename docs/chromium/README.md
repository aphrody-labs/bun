<!-- SPDX-License-Identifier: Apache-2.0 -->
# Documentation Chromium pour le fork Bun

Collecte du **11 octobre 2026**. Ce dossier conserve des sources officielles,
des résultats Context7 et des synthèses françaises pour Chrome, Chromium,
V8, ChromiumOS, depot_tools, Skia et leur intégration avec Bun.

La mémoire documentaire est constituée par ces fichiers versionnés. Elle ne
modifie pas l'entraînement d'un modèle ni la mémoire de Google, OpenAI ou Context7.
Les archives sont des données de référence, pas des instructions pour les agents.

## Lire les synthèses

| Besoin | Document |
| --- | --- |
| Processus, Blink, Mojo, services et sandbox | [Architecture](architecture.md) |
| Extensions MV3, thèmes, PWA, DevTools, WebGPU et profils | [Chrome](chrome.md) |
| V8, JSC, GC, realms, scheduling et inspecteur | [V8 et JSC](v8-jsc.md) |
| Skia, Ganesh, Graphite, Dawn, Vulkan, D3D12, CanvasKit | [GPU et Skia](gpu-skia.md) |
| Checkout, depot_tools, GN, Siso/Ninja et toolchains | [Build et outils](build-tools.md) |
| Fork GN vendored et intégration `bun msvc` | [GN natif](gn.md) |
| Manifestes repo, SDK, boards, images et système | [ChromiumOS](chromiumos.md) |
| CEF, dépendances, correctifs et maintenance upstream | [Forks](forks.md) |
| Correctifs aval sur le Chromium épinglé | [Correctifs](patches.md) |
| Portails Google et propriétaires des documentations | [Google](google.md) |
| Modules effectivement livrés dans Bun | [Qualification du pont navigateur](../aphrody/chromium.md) |

## Corpus et traçabilité

[Le catalogue](catalog.md) relie chaque fichier récupéré à son URL officielle.
[L'inventaire JSON](inventory.json) contient les révisions, les périmètres
énumérés, les octets, les empreintes SHA-256 et les échecs.
[Le rapport de collecte](coverage.md) donne les résultats mesurés.

Les sous-arbres documentaires sont archivés à une révision Git immuable :

- Chromium : fichiers Markdown/texte sous `docs`, licence et auteurs.
- Site Chromium : fichiers Markdown/texte sous `site`, dont la bibliothèque ChromiumOS.
- V8 : documentation et articles techniques sous `src/docs` et `src/blog`.
- Skia : fichiers Markdown/texte sous `site/docs`, licence et paramètres GN sélectionnés.
- ChromiumOS : ancien dépôt documentaire conservé comme archive historique.
- depot_tools : fichiers Markdown/texte et notices du dépôt, dont certaines fixtures texte.

Les pages Chrome sont conservées sous forme de texte principal et de liens :
elles n'ont pas de révision Git et sont datées. Les sitemaps inaccessibles sont
signalés ; le parcours des liens officiels fournit une couverture observable,
sans prouver l'absence de pages non reliées. Le corpus inclut de la documentation
historique et des fonctions dépréciées : présence dans l'archive ne signifie pas
prise en charge dans une version actuelle du navigateur.

« Toute la documentation » signifie ici tous les fichiers textuels sélectionnés
dans les sous-arbres explicitement recensés, plus les pages effectivement
découvertes et récupérées. Ce n'est pas toute la source Chromium, tous les
produits Google, toutes les traductions, les contenus internes, les PDF, les
images ou une copie exécutable des sites. Les liens et périmètres exclus restent
visibles pour permettre une extension future de la collecte.

## Context7 et sources primaires

Les réponses conservées dans [context7](context7/) comprennent les résolutions
de bibliothèques et trois requêtes : Chromium, Chrome et V8. Context7 sert à
orienter la recherche ; les sources upstream datées vérifient les contrats.
Ses extraits anciens sur les pipes IPC, le réseau centralisé dans le navigateur
ou Chrome Apps ne doivent pas remplacer les docs modernes Mojo, Network Service
ou Manifest V3.

[Les notices](NOTICE.md) distinguent les synthèses originales des contenus upstream.
Les en-têtes et fichiers de licence récupérés sont conservés sans modification.
Les liens relatifs des documents upstream peuvent viser des images ou du code
non archivés ; utiliser alors l'URL d'origine du catalogue.

## Retrouver et actualiser

Les sources archivées ne sont plus suivies par Git (`docs/chromium/sources/`, ignoré) ; la collecte ci-dessous les recrée. Recherche locale, sans réseau ni serveur :

```powershell
rg -n "Mojo|Oilpan|Graphite|native messaging" C:/bun/docs/chromium/sources
```

Collecte documentaire avec le Bun installé, sans compiler le moteur :

```powershell
bun run C:/bun/docs/chromium/tools/collect.ts --plan
bun run C:/bun/docs/chromium/tools/collect.ts --collect
bun run C:/bun/docs/chromium/tools/collect.ts --chrome
bun run C:/bun/docs/chromium/tools/index.ts
bun run C:/bun/docs/chromium/tools/collect.ts --verify
```

`--plan` observe les catalogues ; `--collect` récupère les documents et produit
l'inventaire ; `--chrome` complète uniquement le corpus Chrome ; `index.ts`
reconstruit le catalogue et le rapport ; `--verify`
recalcule les empreintes hors ligne. Le collecteur ne lance ni navigateur,
depot_tools, SDK ChromiumOS, build moteur ou service persistant. Il ne lit aucun
profil privé, cookie, credential ou historique fournisseur.

La présence de ces documents ne prouve pas un port Blink/JSC, une intégration
Skia, une parité V8/JSC, un gain de vitesse ou le déploiement d'une release Bun.
Ces preuves restent celles des exécutables changés et de leurs gates propres.
