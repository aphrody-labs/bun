# Google : catalogue documentaire pour le navigateur du fork

Date de consultation : **2026-10-11**.

Le périmètre couvre les projets Google utiles à Chrome, Chromium et au runtime.
Ce catalogue n'est pas une copie de toute la documentation Google.
Il sert à orienter une collecte traçable et une recherche ciblée.

## Portails officiels

| Sujet | Point d'entrée officiel | Usage dans le fork |
| --- | --- | --- |
| Produits développeur | [Google for Developers](https://developers.google.com/products/) | Identifier le propriétaire documentaire |
| Navigateur et extensions | [Chrome documentation](https://developer.chrome.com/docs/) | Contrats de la plateforme Chrome |
| Développement web | [web.dev](https://web.dev/) | Fonctionnement des applications web |
| Source du navigateur | [Chromium docs](https://chromium.googlesource.com/chromium/src/+/main/docs/README.md) | Architecture et contribution |
| JavaScript | [V8 docs](https://v8.dev/docs) | Moteur, intégration et diagnostics |
| Système ChromiumOS | [Developer library guides](https://www.chromium.org/chromium-os/developer-library/guides/) | Workflow système distinct |
| Rendu 2D | [Skia docs](https://skia.org/docs/) | Bibliothèque graphique amont |
| Outils de checkout | [depot_tools](https://chromium.googlesource.com/chromium/tools/depot_tools/+/HEAD/README.md) | Gestion des sources Chromium |
| Style amont | [Google Style Guides](https://google.github.io/styleguide/) | Conventions du projet concerné |

Chaque portail possède sa portée ; la documentation de Chrome n'est pas celle
de ChromiumOS, et la documentation V8 ne décrit pas JavaScriptCore.
Les styles Google sont des références amont, pas une substitution aux règles Bun.

## Recherche avec Context7

Context7 a résolu le produit Chrome vers `/websites/developer_chrome`.
L'identifiant alternatif `/llmstxt/developer_chrome_llms_txt` était aussi proposé.
Une requête ciblée sur MV3 et native messaging a fourni des liens officiels.
Ces résultats sont des extraits de recherche, pas un manifeste exhaustif du site.
Un extrait ancien sur Chrome Apps doit être recoupé avec l'avertissement officiel.

Pour chaque recherche :

1. Définir le composant et la version du binaire ou du commit concerné.
2. Résoudre l'identifiant documentaire adapté au composant.
3. Poser une question portant sur un contrat précis.
4. Ouvrir la source primaire et vérifier son statut courant.
5. Enregistrer la provenance dans le corpus local.

Un index Context7 ne garantit ni la version d'un fork, ni son comportement réel.
Les contrats installés et les sources épinglées restent nécessaires aux gates.

## Chrome et applications web

Chrome for Developers réunit extensions, DevTools, ChromeDriver, Lighthouse,
Workbox et des capacités de la plateforme web dans son [catalogue](https://developer.chrome.com/docs/).
Le guide [Chrome](chrome.md) traite les contrats pertinents sans répliquer le site.
Le cours [PWA](https://web.dev/learn/pwa/) distingue l'application installable
des anciennes Chrome Apps et des extensions du navigateur.

Les outils d'audit, l'automatisation et les API de navigateur ont des finalités
différentes ; leur documentation ne prouve pas une intégration au runtime Bun.
Ne pas ajouter de dépendance simplement parce qu'un portail la présente.

## Chromium et depot_tools

Le [README Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/README.md)
oriente vers architecture, builds, tests et contribution.
Les [instructions Windows](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
décrivent la chaîne native, le checkout et ses prérequis de stockage.
Les besoins doivent être revérifiés au commit choisi avant toute préparation d'hôte.

Le [README depot_tools](https://chromium.googlesource.com/chromium/tools/depot_tools/+/HEAD/README.md)
présente `fetch` pour préparer les projets et `gclient` pour leurs dépendances.
Une collecte documentaire ne lance ni installation, ni synchronisation, ni build.
Les aides du CLI sélectionné sont nécessaires avant une future exécution.
Les contraintes Python annoncées par depot_tools appartiennent à son workflow ;
elles ne sont pas une preuve que `bun uv` remplace tous ses outils internes.

## V8 et frontières de moteur

[V8 documentation](https://v8.dev/docs) couvre développement et intégration du moteur.
Le [guide d'embedding](https://v8.dev/docs/embed) expose contextes, handles et
liaisons natives spécifiques à V8.
Ces contrats ne peuvent pas être assimilés aux objets et racines GC de JSC.
Full Chromium/V8 et Obscura/JSC doivent conserver des qualifications distinctes.
La lecture d'un guide n'établit aucune parité moteur ou performance.

## ChromiumOS

La [bibliothèque développeur](https://www.chromium.org/chromium-os/developer-library/guides/)
couvre le développement du système ChromiumOS et ses procédures spécialisées.
Ce périmètre se distingue d'un navigateur Chromium compilé sur Windows.
Un fork ChromiumOS nécessite sa propre sélection de branche, de plateforme,
d'images, de tests et de propriétaires ; aucune de ces actions n'est déclenchée ici.

## Skia et rendu

[Skia documentation](https://skia.org/docs/) est le portail de la bibliothèque amont.
Le renderer et les backends GPU doivent être recherchés à la révision sélectionnée.
Skia, tiny-skia, wgpu et les couches D3D12 du fork ne sont pas des API interchangeables.
La disponibilité d'un dépôt Skia ne prouve pas son intégration à Bun ou Obscura.
Réutiliser les propriétaires natifs existants avant d'envisager une nouvelle couche.

## Formats d'une collecte reproductible

Un reçu de téléchargement doit contenir au minimum :

- URL demandée et URL finale après redirection.
- Date UTC de collecte et statut HTTP.
- Type de contenu et taille de la ressource.
- Empreinte du contenu conservé.
- Commit source lorsque la ressource appartient à un dépôt.
- Notice de licence et attribution applicables.

Un catalogue de liens décrit des cibles ; un reçu réussi prouve leur téléchargement.
Un échec ou une redirection inattendue reste visible et ne devient pas une réussite.
Les URL `main` et `HEAD` évoluent ; conserver une référence de commit pour les forks.

## Mémoire et limites

La conservation demandée ici se fait dans `docs/chromium`.
Elle ne modifie pas l'entraînement du modèle et ne synchronise pas les historiques
ou mémoires des fournisseurs. Aucune configuration globale n'est nécessaire.
Ne pas archiver cookies, jetons OAuth, sessions, données personnelles ou modèles.
Préserver les licences des sources et limiter la reproduction de textes éditoriaux.
