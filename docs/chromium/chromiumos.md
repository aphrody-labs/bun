# ChromiumOS, SDK et frontière du navigateur

État des références primaires consultées le **2026-10-11**. Aucun SDK, système
ou appareil n'est démarré ou modifié par cette fiche.

L'archive `chromiumos/docs` conservée dans le corpus est historique : son README
déclare le dépôt déprécié depuis Q1 2024 et renvoie vers la Developer Library.
La bibliothèque actuelle est également conservée dans le snapshot `chromium-site`.

## Trois périmètres

| Périmètre | Livrable et propriétaire |
| --- | --- |
| Chromium | Navigateur, moteur et outils décrits par son checkout et `DEPS`. |
| ChromiumOS | Ensemble de dépôts, paquets, configuration de board et image système. |
| Simple Chrome | Construction et déploiement du navigateur pour une cible ChromeOS avec son SDK/sysroot. |

Le [guide de développement ChromiumOS](https://www.chromium.org/chromium-os/developer-library/guides/development/developer-guide/)
utilise `repo` pour synchroniser plusieurs dépôts à partir du manifeste public.
Il recommande la référence `stable` plutôt que `main` pour les tâches courantes ;
cette référence évolue et ne remplace pas un manifeste de révisions épinglées.
Le SDK/chroot isole les outils de construction et les sysroots par board.
Le cycle associe sélection de board, paquets, image et tests sur la cible.

La même référence demande un hôte Linux x86-64 et des privilèges adaptés au
chroot. Elle cite Ubuntu 22.04 comme environnement officiellement pris en charge.
Ses exemples historiques de mémoire ou de boards ne constituent pas une
mesure actuelle du coût de construction d'une image donnée.

## Navigateur seul avec Simple Chrome

Le [guide Simple Chrome](https://www.chromium.org/chromium-os/developer-library/guides/development/simple-chrome-workflow/)
décrit `cros chrome-sdk` et la sélection de board. Le checkout Chromium référence
sa version de SDK via `chromeos/CHROMEOS_LKGM` ; elle peut changer avec le code.
Les SDK publics disponibles pour les contributeurs externes et les boards
internes n'ont pas la même disponibilité. Une cible générique publique ou un
SDK construit à partir d'une image autorisée doit être choisi explicitement.

Cette route reconstruit le navigateur pour son sysroot ; construire une image
complète suit le workflow ChromiumOS. Le navigateur local Windows et CEF
ne deviennent pas une distribution ChromiumOS par ajout de quelques crates.

## Réutilisation dans l'écosystème Bun

`packages/bun-tauri/crates/aphrody-tauri-runtime-cef` fournit déjà le propriétaire
Chromium embarqué. `packages/bun-obscura` fournit un moteur headless indépendant
avec DOM, CDP, réseau et rendu optionnel. `bun:windows` et `bun:cosmic` possèdent
leurs primitives système et texte ; ces sources ne fournissent pas le SDK,
les paquets système, le boot ou les images ChromiumOS.

Un futur port Bun dans ChromiumOS doit sélectionner le paquet, la board et
le rôle du runtime : service séparé, outil de build ou composant du navigateur.
Un service séparé peut préserver la séparation JSC/V8 et les stores de profils.
Une intégration au navigateur exige un contrat IPC/ABI, une revue du sandbox
et une qualification du binaire cible ; cette architecture reste à décider.

La preuve attendue comprend le manifeste résolu, le SDK, les versions du
toolchain, les paquets construits, l'image ou le navigateur produit et les
tests sur la cible. Épingler des guides et branches établit une provenance ;
cela ne prouve ni démarrage, rendu, parité V8/JSC ni gain de performance.
