# Outils de construction Chromium

Références primaires consultées le **2026-10-11**. Cette fiche décrit la chaîne
amont ; aucun checkout, téléchargement, build ou déploiement n'est exécuté ici.
Les références `main` doivent être remplacées par les SHA retenus pour un build.
Épingler la documentation et les outils prouve la provenance, pas la réussite
de compilation ni la performance du moteur obtenu.

## Responsabilités

| Outil | Responsabilité |
| --- | --- |
| `depot_tools` | Distribution des wrappers et outils de développement Chromium. |
| `fetch` | Préparation d'un checkout au moyen de `gclient`. |
| `gclient` | Synchronisation des dépendances et règles par plateforme. |
| GN | Décrit les cibles et génère le graphe de construction. |
| Ninja | Format de graphe et exécuteur historique. |
| Siso | Exécuteur principal actuel de Chromium selon le guide Windows. |
| `autoninja` | Wrapper de sélection et configuration de Siso/Ninja. |

Le [README depot_tools](https://chromium.googlesource.com/chromium/tools/depot_tools/)
décrit ces responsabilités et indique que Ninja est remplacé par Siso.
Il précise aussi l'initialisation des wrappers et l'actualisation automatique
de `depot_tools` par `gclient`. Une copie du répertoire sans bootstrap n'établit
donc pas une chaîne opérationnelle.

Le [guide GN](https://gn.googlesource.com/gn/+/main/docs/quick_start.md)
décrit la génération, les cibles et les arguments. La configuration d'un
répertoire `out` appartient au checkout Chromium et à son graphe de dépendances.

## Préconditions Windows

Le [guide Windows actuel](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
demande Windows 10 ou ultérieur, une machine x86-64, au moins 8 Go de RAM et
100 Go libres sur NTFS ; il recommande davantage de mémoire.
Il indique Visual Studio 2026 au moins 18.0.0, les composants C++/MFC/ATL et
le SDK Windows 11 10.0.28000.2270. `clang-cl` utilise les en-têtes et bibliothèques
de cette chaîne. Ces versions sont celles de la page consultée, pas un audit
des installations locales ni un contrat pour une ancienne branche.

Le même guide utilise `gn gen out\Default`, puis
`autoninja -C out\Default chrome`. Il décrit Siso comme outil principal malgré
des passages historiques parlant encore de Ninja. L'exécution distante Windows
pour contributeurs externes n'est pas fournie par `rbe-chromium-untrusted`.
Conserver la route locale de la révision choisie lorsqu'aucun service distant
autorisé ne prend en charge l'hôte.

Le [guide Linux](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
possède ses propres préconditions et dépendances système. Une machine distante
qui héberge Bun ne possède pas automatiquement le stockage, la chaîne C++
ou les dépendances nécessaires à Chromium.

## Articulation avec Bun

`bun bd` reste la factory du runtime Bun ; elle ne construit pas un fork
Chromium. Le workspace indépendant `packages/bun-tauri` déclare déjà le runtime
CEF et verrouille ses crates ; les bibliothèques navigateur sous `src/browser`
appartiennent au workspace Cargo racine de Bun et utilisent son lockfile.
Leurs gates sont décrits dans `src/browser/PLAN.md`. Chromium conserve sa chaîne
et son livrable indépendants.
Les outils Python de `depot_tools` doivent conserver leur bootstrap amont ;
le choix Bun pour les scripts du dépôt ne remplace pas leur contrat d'exécution.

Avant un futur build, produire un plan indiquant hôte, branche et SHA Chromium,
SHA `depot_tools`, révisions `DEPS`, arguments GN, cible, stockage disponible,
versions compilateur/SDK, cache autorisé et gates. Enregistrer ensuite les
commandes réelles, codes de sortie et hashes des artefacts.
Un patch Bun/Chromium doit préciser la frontière IPC ou ABI, le sandbox et
les tests du binaire modifié ; la lecture de ces guides ne satisfait pas ces gates.
