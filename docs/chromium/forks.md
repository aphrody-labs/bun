<!-- SPDX-License-Identifier: Apache-2.0 -->

# Sources upstream, CEF et maintenance des forks

Collecte et vérification : 2026-10-11.
Cette page propose un contrat de maintenance reproductible ; elle ne publie aucun fork.
Les URL `main` fournissent des points d'entrée, à convertir en SHA pour une livraison.

## Périmètres upstream distincts

Chromium est un arbre principal avec des dépendances externes.
V8 et Skia conservent leurs propres workflows de contribution.
ChromiumOS contient Chromium dans un workflow de source et de build différent.
Conserver l'identité de ces projets dans les inventaires et les notices.
Source : [contribuer à Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/contributing.md).

L'arbre du navigateur, ses dépendances et la toolchain doivent former une combinaison cohérente.
Un fork V8 seul n'est pas une distribution Chromium complète.
Un checkout de `depot_tools` n'établit pas un checkout ou build Chromium réussi.
Ne pas transférer une preuve obtenue sur un projet à un autre.

## Deux voies d'intégration

| Voie          | Usage                                   | Surface à maintenir                    |
| ------------- | --------------------------------------- | -------------------------------------- |
| CEF           | Application embarquant Chromium         | API CEF, ressources et packaging       |
| Fork Chromium | Modifications du navigateur ou de Blink | Source, toolchain et patches du moteur |

CEF vise les applications qui embarquent un navigateur.
Ses APIs et son architecture servent de frontière avec l'application native.
Le cycle de vie et la boucle de messages doivent respecter l'intégration choisie.
Source : [usage CEF](https://chromiumembedded.github.io/cef/general_usage).

Le projet local dispose déjà de `aphrody-tauri-runtime-cef`.
Réutiliser ce propriétaire avant d'introduire un deuxième stack desktop.
Le manifeste fixe `cef` et `cef-dll-sys` à `152.3.0`.
Référence : [manifeste CEF local](https://github.com/aphrody-labs/bun-os/blob/os/packages/bun-tauri/crates/aphrody-tauri-runtime-cef/Cargo.toml).

## Branches et binaires CEF

CEF documente branches de développement, branches de livraison et builds distribués.
La branche CEF doit être associée à la révision Chromium qu'elle utilise.
Le binaire, ses headers, ses ressources et ses flags doivent être compatibles.
Source : [branches et builds CEF](https://chromiumembedded.github.io/cef/branches_and_building).

Conserver les versions de crate et les hashes des distributions téléchargées.
Qualifier helpers, ressources locales, locales et snapshots dans le paquet final.
Une compilation Rust seule ne prouve pas le chargement correct du moteur distribué.
Réexécuter les tests du runtime lors d'un changement de distribution.

## Choix du commit et toolchain

Figer le SHA Chromium, ses dépendances et le SHA des outils utilisés.
Archiver l'origine des sources, les paramètres du build et les modifications locales.
Les ressources nécessaires se vérifient sur la factory réellement choisie.
Le quota suffisant pour de la documentation ne qualifie pas un build de navigateur.

Chromium dispose d'une procédure propre pour mettre à jour Clang et Rust.
Préserver la combinaison utilisée par la révision cible plutôt que substituer une toolchain arbitraire.
La compatibilité d'une version installée se prouve par les gates du build.
Source : [mise à jour Clang et Rust](https://chromium.googlesource.com/chromium/src/+/main/docs/updating_clang.md).

## Contrat de patch

Chaque patch indique problème concret, composant, test et révision upstream.
Préserver les notices et les auteurs des sources transférées.
Séparer intégration native, politique produit et modifications moteur.
Documenter les écarts intentionnels des APIs et permissions.

L'upstream demande revue et tests ; les gros changements d'architecture ont besoin d'un design.
Identifier les propriétaires des fichiers avant de proposer une modification upstream.
Les contributions passent par le workflow Gerrit du projet concerné.
Source : [contribution Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/contributing.md).

Le fork local conserve sa propre identité et ses remotes autorisés.
Une proposition upstream et une publication du fork sont deux actes distincts.
Ce document ne modifie ni branches ni configuration Git.

## Réutiliser le travail Obscura

La ref observée `obscura` est `c82e6a6e3bd90511d44ada44819bbeda31ebaa76`.
Le moteur transféré vit désormais dans `src/browser`, membre du workspace Cargo racine de Bun.
Le transfert initial cite la source Aphrody `2d66be8fcd84a87b4ca73124023881ca9d0c204f`.
Références : [propriétaire actuel](../../src/browser/README.md),
[provenance du transfert](../../src/browser/docs/browser-migration.md).

Réutiliser API Rust, DOM, CDP, cookies, réseau/SSRF et rendu existants.
Le catalogue `profiles.rs` définit des empreintes de navigateur, pas une synchronisation de comptes.
Les cookies conservent leurs frontières de profil et de données protégées.
La synchronisation de stores n'est pas autorisée implicitement par un transfert de sources.

Le plan du transfert rapporte 2 247 tests natifs réussis et sept ignorés.
Il rapporte aussi un passage strict Clippy sur son périmètre.
Ces preuves datées ne qualifient ni l'API nouvellement intégrée ni une distribution Chromium.
Référence : [preuves Obscura](../../src/browser/PLAN.md).

## Gates de mise à jour proposées

1. Inspecter les différences de source et les contrats modifiés au SHA cible.
2. Valider dépendances, toolchain et applicabilité des patches.
3. Exécuter les tests des composants réellement touchés.
4. Qualifier sandbox, permissions et intégration des services sur le host cible.
5. Vérifier installation, ressources, lancement et arrêt des descendants.
6. Conserver manifeste, hashes, résultats et procédure de retour au build précédent.

Le sandbox CEF Windows local reste une limite de packaging documentée.
Ne pas perdre cette réserve lors d'un changement de version.
Les autres plateformes exigent leurs propres preuves.
Référence : [sandbox CEF local](https://github.com/aphrody-labs/bun-os/blob/os/packages/bun-tauri/crates/aphrody-tauri-runtime-cef/src/sandbox.rs).

## Corpus primaire à conserver

- Chromium : architecture Mojo, réseau, sandbox, contribution et toolchain.
- Blink : bindings, renderer et GC.
- V8 : embedding et sources de l'API réellement utilisée.
- CEF : usage, branches, packaging et ressources de la distribution fixée.
- Skia et ChromiumOS : documentation et licences propres à leurs projets.

Voir [architecture](./architecture.md) et [frontière V8/JSC](./v8-jsc.md).
