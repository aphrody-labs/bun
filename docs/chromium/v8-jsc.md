<!-- SPDX-License-Identifier: Apache-2.0 -->
# V8, JavaScriptCore et moteur de page

Collecte et vérification : 2026-10-11.
Cette page distingue compatibilité d'API, protocole de debug et intégration de moteur.
Elle ne déclare pas un port Blink/JSC achevé.

## Trois contrats différents

| Contrat | Exemple local | Ce qu'il établit |
| --- | --- | --- |
| API native V8 | `src/jsc/bindings/v8` | Compatibilité de certaines extensions Node |
| Protocole inspecteur | `src/js/internal/inspector/cdp.ts` | Traduction de commandes CDP vers JSC |
| Moteur de page | Obscura V8 ou Chromium/Blink | DOM, JavaScript et navigateur effectifs |

Une extension native compatible ne prouve pas que Blink accepte le même heap.
Une commande CDP reconnue ne prouve pas une implémentation équivalente de sa sémantique.
Une page qui évalue `6 * 7` ne prouve pas l'ensemble des contrats du navigateur.

## Embedding V8

Le guide V8 décrit handles, scopes, contexts, templates et objets natifs enveloppés.
Les objets JavaScript et leur propriétaire natif ont des durées de vie explicites.
Un handle local ne peut pas être conservé après la destruction de son scope.
Les callbacks et exceptions suivent les conventions de l'embedder.
Source : [embedding V8](https://v8.dev/docs/embed).

Le code Obscura actuel utilise `deno_core::JsRuntime` et les types V8 associés.
Son manifeste fixe `deno_core` à la famille `0.412`.
Le runtime crée des isolates, charge un snapshot et installe ses opérations DOM.
Références : [manifeste JS](../../packages/bun-obscura/crates/obscura-js/Cargo.toml),
[runtime JS](../../packages/bun-obscura/crates/obscura-js/src/runtime.rs).

L'exécution Bun appelante reste sur JavaScriptCore.
Lancer Obscura dans un processus natif préserve cette séparation.
Un endpoint CDP ne transforme pas l'isolate distant en contexte JSC.
Un binding direct futur devra préciser threads, ABI et ownership des objets.

## Bindings Blink

Le répertoire officiel `bindings` produit les interfaces entre Blink et V8.
Les générateurs et conventions de wrappers font partie du moteur de page.
Le DOM natif, les wrappers JavaScript et les exceptions doivent rester cohérents.
Source : [bindings Blink](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/bindings/README.md).

L'ancien lien `core/v8/V8BindingDesign.md` n'a pas été récupéré pendant cette collecte.
Ne pas le présenter comme une preuve vérifiée du commit courant.
Utiliser le README accessible puis inspecter les générateurs au SHA réellement choisi.
Le contrat précis des mondes et contexts doit être reconstruit depuis ces sources.

Blink dispose de son système de GC, Oilpan.
Un port doit préserver les références entre DOM natif et objets du moteur JavaScript.
Le choix du moteur ne dispense pas de ce travail de lifetime et de tracing.
Source : [Blink GC](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/heap/README.md).

## Compatibilité V8 locale

Bun fournit un shim C++ V8 au-dessus de JSC pour des modules natifs Node.
Lire ses types, scopes, layouts et fonctions réellement implémentées.
Une classe exposée dans un header peut encore avoir des méthodes absentes.
Référence : [guide local V8](../../src/jsc/bindings/v8/CLAUDE.md).

`node:v8` conserve des surfaces non implémentées, dont les constructeurs Serializer.
Les compteurs du heap JSC ne sont pas ceux des espaces de heap V8.
Ne pas fabriquer des mesures V8 à partir de compteurs JSC incomparables.
Référence : [module node:v8](../../src/js/node/v8.ts).

## Debugging local

L'adapter inspecteur traduit une partie de `Runtime` et `Debugger` vers JSC.
Certaines commandes reçoivent une réponse vide sans comportement correspondant.
Les méthodes inconnues retournent une erreur de protocole.
La couverture doit être annoncée méthode par méthode.
Référence : [adapter CDP](../../src/js/internal/inspector/cdp.ts).

Le client `bun:chromium` peut parler au CDP d'un navigateur externe.
Le backend `Bun.WebView` possède aussi un transport natif Chrome.
Ces deux clients ne prouvent pas la parité de l'inspecteur JSC.
Une qualification DevTools doit exercer scripts, breakpoints, exceptions et teardown.

## Gates d'un port JSC

| Domaine | Preuve attendue |
| --- | --- |
| DOM | Identité des wrappers, mutations et événements |
| Realms | Contexts de page, frames et mondes isolés |
| GC | Références entre heaps, finalisation et absence de fuite |
| Exceptions | Propagation et erreurs observables par le script |
| Scheduling | Promises, microtasks, timers et interruption |
| Modules | Résolution, chargement et cycles |
| Workers | Isolation, messages, arrêt et threads |
| Teardown | Destruction répétée des pages et runtime |
| Debug | Mapping des scripts et comportement des commandes |

Cette grille est une proposition de qualification du projet, pas une certification upstream.
Les tests différentiels doivent comparer le même scénario dans chaque moteur.
Un cas ignoré reste hors de la couverture annoncée.
Conserver V8 tant que les cas requis par le produit ne passent pas sur JSC.
Le plan transféré conserve explicitement cette frontière.
Référence : [plan Obscura](../../packages/bun-obscura/PLAN.md).

## GPU et navigateur complet

La compatibilité ECMAScript ne fournit ni renderer Blink ni adapter WebGPU.
La sonde Obscura actuelle retourne un adapter nul.
Les opérations D3D12 natives de Bun appartiennent à une autre surface.
Une intégration réutilisera les propriétaires GPU sans inventer une équivalence d'API.

Pour Chromium complet, qualifier le moteur V8 et le GPU de la distribution réelle.
Pour Obscura, qualifier d'abord les besoins headless et les capacités réellement implémentées.
Mesurer performance, mémoire et démarrage avec la même charge et le même host.
Aucun gain de vitesse ne découle du seul nom du moteur.
Voir [architecture](./architecture.md) et [maintenance des forks](./forks.md).
