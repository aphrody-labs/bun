<!-- SPDX-License-Identifier: Apache-2.0 -->

# Architecture Chromium et frontières Bun

Collecte et vérification : 2026-10-11.
Les liens `main` upstream sont mobiles : conserver leur révision lors d'une collecte reproductible.
Cette synthèse décrit les contrats et le code observé ; elle ne qualifie aucun nouveau moteur.

## Processus et propriétaires

Chromium sépare orchestration du navigateur, rendu des pages et services spécialisés.
Blink fournit le moteur de page ; V8 exécute le JavaScript de Chromium.
La séparation en processus participe à la sécurité et à l'isolation des sites.
Le placement réel d'un service dépend du composant, de la plateforme et de la configuration.
Éviter la formule « un processus par onglet », qui ne décrit pas toutes les situations.

La documentation moderne décrit des interfaces Mojo entre composants et services.
Un fichier `.mojom` définit les messages et produit des bindings typés.
`Remote` et `Receiver` représentent les deux rôles d'une interface.
Le propriétaire doit conserver les endpoints et leur implémentation pendant les échanges.
Source : [Mojo et services](https://chromium.googlesource.com/chromium/src/+/main/docs/mojo_and_services.md).

## Réseau et IPC modernes

Le service réseau expose notamment des interfaces de contexte réseau et de chargement URL.
Son contrat passe par Mojo ; il ne se résume pas au réseau dans le processus navigateur.
Un processus distinct n'implique pas automatiquement le même sandbox sur chaque plateforme.
Source : [Network Service](https://chromium.googlesource.com/chromium/src/+/main/services/network/README.md).

Les descriptions historiques d'IPC par pipes nommés restent utiles pour comprendre une ancienne révision.
Elles ne constituent pas un contrat actuel pour introduire un nouveau service.
Les résultats Context7 anciens doivent être confrontés aux `.mojom` et au code du commit cible.
Un détail du transport système ne remplace pas le modèle d'autorisation d'une interface Mojo.
Source : [sécurité des interfaces Mojo](https://chromium.googlesource.com/chromium/src/+/main/docs/security/mojo.md).

L'ajout d'une interface exposée au renderer demande une analyse de confiance.
Le code privilégié valide les messages provenant d'un processus moins privilégié.
Les durées de vie des frames, workers et receivers doivent correspondre.
Une page distante ne reçoit pas implicitement les capacités natives de Bun.
Ce dernier point est le contrat du projet, pas un effet automatique de Mojo.

## Sandbox

Le navigateur et les services ont des contraintes de sandbox différentes.
Examiner le tableau des processus et la politique réellement activée sur le build cible.
Ne pas généraliser l'état du service réseau ou d'un renderer à toute l'application.
Sources : [sandbox](https://chromium.googlesource.com/chromium/src/+/main/docs/design/sandbox.md),
[processus par plateforme](https://chromium.googlesource.com/chromium/src/+/main/docs/security/process-sandboxes-by-platform.md).

Le sandbox Chromium ne protège pas une API native ajoutée sans contrôle d'origine.
Préserver la séparation entre pages, profils et données de l'application.
Qualifier démarrage, refus de permissions et teardown sur chaque système concerné.
Une option de lancement ou un indicateur déclaré ne prouve pas l'activation effective.

## Capacités présentes dans le dépôt

| Surface                 | Propriétaire observé                                  | Contrat actuel                                                      |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Runtime Bun             | `src/jsc`                                             | JavaScriptCore                                                      |
| Automatisation Chromium | `src/js/bun/chromium.ts`                              | Connexion CDP à un navigateur externe                               |
| Chrome WebView          | `src/runtime/webview`                                 | Processus Chrome, pipe CDP ou WebSocket                             |
| Obscura                 | `src/browser`                                         | Bibliothèques du workspace Rust Bun, DOM et fournisseur V8 conservé |
| Application CEF         | `bun-os/packages/bun-tauri/crates/aphrody-tauri-runtime-cef` | Runtime Tauri sur CEF                                               |
| GPU Windows             | `src/runtime/windows/sys/gpu.rs`                      | Opérations et sondes D3D12 natives                                  |

Ces surfaces existent avec des niveaux de qualification distincts.
La présence de code et les tests unitaires ne prouvent pas une installation desktop complète.
Les déclarations TypeScript décrivent l'API, pas un remplacement du moteur de page.
Références locales : [module Chromium](../../src/js/bun/chromium.ts),
[backend natif Chrome](../../src/runtime/webview/ChromeProcess.rs).

## Obscura réutilisé

La branche `obscura` observée pointe sur `c82e6a6e3bd90511d44ada44819bbeda31ebaa76`.
Le transfert conserve API Rust, navigateur, DOM, réseau, CDP, MCP et rendu optionnel.
L'extraction et Taffy modifié appartiennent aussi au workspace transféré.
Les bibliothèques navigateur appartiennent désormais au workspace Cargo racine de Bun.
Cette intégration des sources ne qualifie pas à elle seule le fournisseur de page V8/JSC.
Références : [README](../../src/browser/README.md),
[plan et preuves datées](../../src/browser/PLAN.md).

Obscura utilise `deno_core` ; son rendu optionnel repose sur Taffy et Tiny Skia.
Ce rendu CPU ne constitue pas un pipeline Blink complet.
La sonde `navigator.gpu.requestAdapter()` du bootstrap retourne encore `null`.
La migration des sources ne ferme donc pas la qualification WebGPU ou JSC.
Voir [frontière V8/JSC](./v8-jsc.md).

## CEF réutilisé

CEF fournit un contrat d'intégration de Chromium dans une application native.
Réutiliser son propriétaire Tauri existant pour fenêtres et cycle de vie.
Le manifeste local fixe `cef` et `cef-dll-sys` à `152.3.0`.
Cette version de crate ne dispense pas de vérifier les binaires et ressources distribués.
Source : [documentation générale CEF](https://chromiumembedded.github.io/cef/general_usage).

Le fichier local `sandbox.rs` documente une limite Windows importante.
Le runtime transmet actuellement un pointeur sandbox nul aux entrées CEF.
Ne pas annoncer un sandbox Windows actif sans qualification du packaging bootstrap.
Référence : [politique CEF locale](https://github.com/aphrody-labs/bun-os/blob/os/packages/bun-tauri/crates/aphrody-tauri-runtime-cef/src/sandbox.rs).

## Contrat d'intégration à qualifier

1. Choisir explicitement Obscura headless ou Chromium/CEF navigateur complet.
2. Garder endpoints, permissions, données et lifetime sous leur propriétaire existant.
3. Prouver le handshake CDP et l'exécution dans la cible attendue.
4. Tester perte de connexion, annulation, crash et arrêt des processus descendants.
5. Mesurer WebGPU avec un adapter et une opération réelle sur le host cible.
6. Conserver les résultats négatifs et les tests ignorés dans les preuves.

Le client CDP et le runtime natif de l'application peuvent communiquer sans partager leur heap.
Cette frontière permet une intégration progressive tout en conservant les moteurs existants.
Un futur port Blink/JSC exige les gates décrites dans [V8/JSC](./v8-jsc.md).
La maintenance des sources et du fork est décrite dans [forks](./forks.md).
