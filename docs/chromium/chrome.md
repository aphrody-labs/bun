# Chrome : guide documentaire du fork

## CLI navigateur et applications — sources du 2026-10-13

Le propriétaire est `scripts/aphrody/browser.ts`, appelé par les scripts
`chrome` et `obscura`. Exemples depuis le checkout :

```sh
bun run chrome download https://example.com/ --outfile page.html
bun run chrome compile app.ts --outfile app --minimal
bun run chrome compile app.tsx --mode webview --outfile app
bun run chrome compile index.html --outfile app
bun run chrome pwa app.tsx --outdir dist --icon icon.png --name "Mon application"
```

Le mode script conserve l'exécution JS/TS habituelle. Les modes WebView et PWA
créent un élément `#app` pour les entrées JS/JSX/TS/TSX : le code client monte
son interface et fournit ses dépendances. Aucun framework de rendu n'est ajouté.
Le bundler Bun embarque les imports et ressources HTML locales.

L'exécutable contient le runtime Bun standard. `--minimal` désactive uniquement
l'autochargement des configurations ; il ne réduit pas les composants natifs du
runtime. Les applications HTML utilisent `Bun.WebView` avec Chrome, dans un
processus navigateur séparé. Chrome doit être disponible sur la machine cible.
La fermeture de la vue ou un signal termine le serveur local de l'application.

Le téléchargement HTML est limité à 16 MiB, accepte annulation et délai, et
résout la première base relative depuis l'URL finale après redirection. Les
ressources distantes restent distantes. Aucun profil ou cookie n'est importé.

La génération PWA produit un manifeste relatif, un service worker, des icônes
PNG 192/512 via `Bun.Image` et un reçu des fichiers générés. Seuls ces fichiers
entrent dans le cache. Les fichiers préexistants restent hors du cache ; un
conflit sur une sortie générée est refusé. Servir le dossier via HTTPS ou
localhost : l'enregistrement du worker nécessite un contexte sûr et la même
origine, selon [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register).
Une CSP existante peut empêcher le script d'enregistrement ; elle n'est pas
modifiée. Les dépendances externes nécessitent toujours le réseau.

Ces commandes et leurs tests sont préparés dans les sources. Compilation,
exécution de l'artefact, enregistrement Chrome et installation effective sont
des qualifications distinctes ; la génération seule ne prouve pas une PWA
installée ni un backend Windows natif qualifié.

Date de consultation : **2026-10-11**.

Ce guide rassemble les contrats utiles au fork Bun ; il ne reproduit pas toute
la documentation Chrome et ne prouve pas la livraison des fonctions décrites.
Les URL officielles restent la référence pour la version du navigateur utilisée.

## Provenance et recherche

Le catalogue général est [Chrome for Developers](https://developer.chrome.com/docs/).
Context7 a résolu `Chrome for Developers` vers `/websites/developer_chrome`.
La requête ciblée MV3/native messaging a retrouvé les pages officielles ci-dessous.
Les résultats Context7 peuvent aussi contenir des Chrome Apps historiques :
vérifier leur URL, leur date et les avertissements de dépréciation avant usage.

Ce fichier est une synthèse française originale, avec des liens directs.
Il n'importe aucun profil privé et ne synchronise aucune mémoire fournisseur.

## Extensions Manifest V3

Le [guide MV3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
décrit les service workers d'extension, le code livré dans le paquet et les
changements du filtrage réseau. Une extension reste exécutée par Chrome.
Un client CDP Bun ne transforme pas `chrome.*` en API disponible dans Bun.

Consulter séparément les contrats suivants :

- [Déclarer les permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).
- [Cycle de vie du service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
- [Politique CSP du manifeste](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
- [Documents offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen).
- [Stockage d'extension](https://developer.chrome.com/docs/extensions/reference/api/storage).

Les permissions d'API et les permissions d'hôte ont des fonctions distinctes.
Un worker peut être arrêté ; son état durable doit résider dans un stockage adapté.
Un document offscreen ne dispose pas de toutes les API d'extension : vérifier
les restrictions de sa référence avant d'y déplacer une opération.
Les ressources référencées dans le manifeste doivent être effectivement livrées.

## Pont natif

Le contrat est [Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
L'extension déclare `nativeMessaging` et l'application installe un manifeste hôte.
Les origines autorisées sont explicites ; les jokers sont refusés.
Chrome communique avec un processus séparé via stdin/stdout.
Chaque message JSON UTF-8 est précédé d'une longueur sur 32 bits en ordre natif.
La limite documentée est 1 MiB depuis l'hôte et 64 MiB vers l'hôte.
Les diagnostics de l'hôte doivent rester sur stderr.
Les content scripts passent par un contexte d'extension autorisé.

La génération d'un manifeste ne prouve ni l'installation du pont, ni son appel
depuis Chrome. Qualifier une session complète avec une extension installée.

## Thèmes

La référence [Chrome themes](https://developer.chrome.com/docs/extensions/develop/ui/themes)
décrit le champ `theme`, ses couleurs, images, teintes et propriétés.
Un thème ne contient pas de JavaScript ou de HTML.
Ses images utilisent des chemins relatifs et le format PNG.
Créer ou modifier un manifeste ne change pas automatiquement le thème installé.
Conserver les ressources et la provenance de chaque image livrée.

## PWA et installation

Le cours [Learn PWA](https://web.dev/learn/pwa/) couvre manifeste, installation,
capabilités et comportement de l'application web.
Le manifeste, les ressources, le service worker et l'intégration système sont
des éléments à qualifier séparément selon les fonctions demandées.
Le domaine [PWA CDP](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/PWA.pdl)
est expérimental et fournit notamment installation, lancement et désinstallation.
Un schéma amont récent ne garantit pas que le binaire sélectionné l'implémente.

Les [Chrome Apps historiques](https://developer.chrome.com/docs/apps/overview)
portent un avertissement de suppression du support sur toutes les plateformes.
Les conserver comme archives de migration, pas comme modèle d'une nouvelle PWA.
Ne pas confondre leur ancien manifeste avec celui d'une extension MV3.

## DevTools, CDP et automatisation

- [DevTools](https://developer.chrome.com/docs/devtools/) : interface de diagnostic.
- [CDP](https://chromedevtools.github.io/devtools-protocol/) : commandes et événements.
- [ChromeDriver](https://developer.chrome.com/docs/chromedriver/) : serveur d'automatisation WebDriver.
- [Extensions CDP](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Extensions.pdl) : domaine expérimental pour extensions dépaquetées et stockage.

Identifier le navigateur et sa version avant de choisir les commandes.
Créer un target et attacher sa session distingue les opérations de navigateur
des opérations de page. Les événements et réponses doivent conserver leur session.
Le protocole de l'inspecteur JavaScriptCore de Bun reste un contrat différent.
Une connexion CDP ne prouve pas une adaptation complète de DevTools à Bun/JSC.

## WebGPU et rendu

La référence [dépannage WebGPU](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
explique les contextes sécurisés, la disponibilité des adaptateurs et les blocages.
Un serveur local loopback convient au test sans contacter Internet.
L'activation d'une fonction ne garantit pas la création d'un adaptateur GPU.
La qualification doit exécuter un shader et vérifier son résultat lu en mémoire.
Le GPU Chromium est distinct des API D3D12 natives du fork et du rendu Obscura.
Les [fonctions WebGPU de développement](https://developer.chrome.com/docs/web-platform/webgpu/developer-features)
ont leur propre périmètre ; ne pas en faire une promesse de production.

## Profils et données protégées

La référence Chromium [User Data Directory](https://chromium.googlesource.com/chromium/src/+/main/docs/user_data_dir.md)
décrit les répertoires de données et leurs variantes par plateforme.
Les [changements du débogage distant](https://developer.chrome.com/blog/remote-debugging-port)
imposent depuis Chrome 136 un répertoire non standard pour ces commutateurs.
Utiliser un profil dédié à l'automatisation ; éviter le profil personnel actif.
Importer explicitement des favoris JSON n'est pas répliquer Chrome Sync.
Le stockage `sync` d'extension a ses propres quotas et son état de compte Chrome.
Cookies, mots de passe, sessions et bases chiffrées restent dans leurs magasins.

## Application au fork Bun

Le contrat local se trouve dans [Chromium et Obscura](../aphrody/chromium.md).
L'API actuelle `bun:obscura` réutilise le propriétaire Chromium partagé et son
moteur de page V8. Le pipeline natif DOM/HTML sous JSC constitue un contrat
distinct, à qualifier séparément ; il ne remplace pas ce moteur dans l'API
Obscura actuelle.
Qualifier séparément le code, le binaire changé, le navigateur installé et l'hôte.
Conserver les numéros de version et les résultats réels dans les reçus de gates.

## Mise à jour du corpus

Lors d'une nouvelle collecte, conserver URL, date, statut HTTP et empreinte.
Épingler les schémas et les sources à un commit lorsqu'une reproduction est requise.
Les pages `main`, `master` ou `HEAD` sont des références mobiles.
Préserver les notices des sources copiées ; privilégier la synthèse et les liens
pour les pages éditoriales plutôt qu'une reproduction intégrale.
