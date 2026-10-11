# Chrome : guide documentaire du fork

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
La cible sépare Obscura/JSC serverless et Chromium/V8 complet avec WebGPU.
Les sources documentaires n'établissent pas que ces deux modes sont terminés.
Qualifier séparément le code, le binaire changé, le navigateur installé et l'hôte.
Conserver les numéros de version et les résultats réels dans les reçus de gates.

## Mise à jour du corpus

Lors d'une nouvelle collecte, conserver URL, date, statut HTTP et empreinte.
Épingler les schémas et les sources à un commit lorsqu'une reproduction est requise.
Les pages `main`, `master` ou `HEAD` sont des références mobiles.
Préserver les notices des sources copiées ; privilégier la synthèse et les liens
pour les pages éditoriales plutôt qu'une reproduction intégrale.
