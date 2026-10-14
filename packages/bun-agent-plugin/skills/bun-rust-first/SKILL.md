---
name: bun-rust-first
description: "Obligatoire pour concevoir, coder, refactoriser ou distribuer les composants Aphrody avec Rust et Bun : vérifier les API actuelles, réutiliser les propriétaires existants, limiter dépendances et builds, garder un noyau minimal et des extensions optionnelles."
---

# Rust et Bun, sources actuelles

Appliquer ces contraintes aux modifications demandées. Le skill ne donne pas
d'autorisation sur des travaux ou hôtes supplémentaires. Une instruction seule
ne garantit pas le comportement d'un agent : les preuves ci-dessous conditionnent
la livraison, et un contrôle manquant doit être signalé.

## Vérifier avant de coder

Lire les instructions du dépôt, ses manifests et lockfiles, les claims et les
diffs concurrents. Résoudre le checkout et les outils depuis le contexte courant.
Vérifier le runtime avec `bun agent-plugin doctor --json` ; si son lanceur embarqué
est cassé, utiliser `bun scripts/aphrody/agent-plugin.ts doctor --json` dans Bun.
Consigner executable, version, revision et provenance ; un numéro upstream ne
prouve pas qu'une fonctionnalité existe dans Bun OS.

Pour chaque API envisagée, lire documentation et types du checkout, trouver son
implémentation par graph/LSP et exécuter une petite preuve comportementale sur le
binaire cible. Utiliser `aphrody home` pour le contexte et `aphrody graph` pour
les propriétaires ; ne synchroniser aucune session brute ni donnée protégée.
Documenter le résultat : disponible, absent, expérimental ou non vérifié.
Ne jamais inventer une signature, attribuer une API upstream à Bun OS sans preuve,
ou présenter Bun comme encore implémenté en Zig dans ce dépôt Rust.

Lire [les références datées](references/current-bun.md) pour sélectionner les
nouvelles fonctionnalités pertinentes, puis vérifier leur état réel.

## Un propriétaire, une implémentation

Écrire la nouvelle logique native en Rust et les applications, outils et tests
en TypeScript/JavaScript exécutés par Bun. Aucun nouveau moteur Node, Python,
Go, Zig ou C++ ; réutiliser les bibliothèques et ponts natifs existants lorsque
leur intégration l'exige, sans réécriture de dépendances vendored.

Chercher d'abord le propriétaire existant dans Bun, Rust std et les dépendances
verrouillées. Réutiliser notamment fichiers, HTTP, streams, SQL, SQLite, Redis,
shell, spawn, compression, archives, hashing, transpiler, bundler et tests Bun.
Charger `bun-apis` avant tout ajout npm, `bun-deps` pour inspecter une dépendance,
et les skills Rust/JSC/syscall pertinents pour le runtime.
La logique métier réside chez un seul propriétaire ; les bindings, CLI et plugins
délèguent via un contrat typé au lieu de reproduire algorithmes, états ou caches.

Ne créer aucun workspace Cargo parallèle, copie vendor, package enveloppe ou crate
pour simplement renommer une API. Étendre un module/crate/package existant.
Un ajout indispensable nécessite une preuve du manque, une frontière fonctionnelle
réelle, et son coût transitif en taille, mémoire et maintenance. Hériter des
dépendances workspace ; examiner doublons de versions et features effectivement
activées avec Cargo metadata/tree via le wrapper natif du dépôt.

Utiliser ownership et Drop ; borner unsafe aux contrats FFI documentés.
Vérifier callbacks réentrants, fermeture asynchrone, erreurs, annulation et GC :
Rust seul ne rend pas une frontière JSC sûre. Ne remplacer aucun comportement par
un stub pour obtenir une compilation verte.

## Noyau minimal et distribution

Conserver dans le binaire principal uniquement les capacités vitales au démarrage
et au contrat public du noyau. Placer outils de développement, médias, navigateurs,
modèles et services facultatifs chez leurs propriétaires optionnels existants :
autres binaires, plugins ou packages Bun compatibles.
Une feature Cargo ne réduit la taille que si le graphe de linkage l'exclut ; un
import dynamique ne suffit pas si le bundler embarque encore son payload.

Réutiliser le catalogue et le gestionnaire de packages de la distribution, comme
une distribution Linux : résolution des versions/plateformes, manifest, intégrité,
licences, contrat d'activation, erreurs explicites si l'extension manque.
Installer les extensions à la demande ; aucun téléchargement au démarrage implicite.
Tester le noyau sans extensions, puis chaque extension avec le même propriétaire
canonique. Préserver les contrats IPC/FFI et éviter de recopier la logique dans
le binaire auxiliaire. Ne multiplier ni registry ni installateur.

Mesurer sur le même host, target, profil et workload : octets du binaire et de
la distribution totale, démarrage froid, RSS maximal et débit/latence.
Comparer aux valeurs avant modification. Essayer les profils release existants,
dead-code elimination, strip, LTO, codegen-units et options bytecode seulement
lorsque disponibles ; mesurer leurs compromis de build et d'exécution.
Ne pas désactiver les vérifications ou changer panic/ABI pour gagner des octets
sans valider le contrat. Ne jamais promettre « plus petit/rapide » sans mesures.

## Builds et tests bornés

Un seul build lourd à la fois, initialement un job ; respecter le verrou et le
wrapper Cargo natif Windows du dépôt, jamais le wrapper Bash ni WSL.
Inventorier processus actifs, RAM libre, CPU et disque avant une tâche lourde.
Réutiliser caches, sccache et sorties ; ne pas lancer clean ni rebuild général.
Augmenter le parallélisme seulement avec une marge mesurée ; plafonner workers,
processus enfants et tests stress. Sur un autre hôte, qualifier ses permissions
et ressources avant plan/apply via le CLI infra existant.

Dans le checkout Bun : `bun bd` et `bun bd test <fichier>` pour les changements
runtime, flags de build avant arguments d'exécution. Exécuter les builds en
arrière-plan sans timeout de build ; observer le même handle vivant jusqu'à
son état terminal. Garder les diagnostics légers et les mises à jour réactives.
Pour scripts/documents, utiliser le gate dédié sans rebuild natif inutile.
Types, lint, formatage et migration passent directement par `bun check`,
`bun lint`, `bun fmt` et `bun n2b`, avec un budget CPU borné. Dans le checkout,
qualifier avec `bun bd check`, `bun bd lint`, `bun bd fmt` et `bun bd n2b`.
Corriger le propriétaire natif en cas d'échec ; aucun backend en sous-processus,
Oxc autonome, tsgo/tsc ou n2b externe pour ces quatre commandes. Les scripts de
package peuvent exposer ces commandes natives, sans les remplacer par un wrapper;
`bunx` reste réservé aux paquets sans rapport avec ces tâches.

Les tests doivent prouver les résultats, erreurs et libérations de ressources,
avec fixtures locales et deadline ; ni sleeps fixes ni preuve par absence de crash.
Faire une revue indépendante des changements risqués, sans lancer plusieurs builds.

## Conditions de livraison

Livrer seulement avec preuves des API réellement utilisées, absence de logique
dupliquée et de nouveaux workspaces inutiles, gates applicables sur le bon binaire,
et mesures comparables pour chaque gain revendiqué. Pour extraction optionnelle,
prouver aussi que le payload est absent du noyau et que l'extension fonctionne.
Inspecter le diff final, committer uniquement les chemins possédés, conserver les
modifications concurrentes et signaler précisément les contrôles non effectués.
