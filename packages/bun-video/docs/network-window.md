# Fenêtre réseau Windows

Source autonome React/TSX : `labs/network-window.tsx`. Le panneau React est rendu
dans un Shadow DOM, dans un monde CDP isolé du JavaScript du site. Le site reste
une vraie page Chrome interactive, sans proxy, iframe de substitution ni capture
vidéo simulée. Chrome/Edge installé reste nécessaire ; seul l'outil Bun est
embarqué dans le PE Windows x64.

```sh
bun labs/network-window.tsx https://example.com
bun build --compile --target=bun-windows-x64 --windows-hide-console labs/network-window.tsx --outfile network-window.exe
network-window.exe https://example.com
network-window.exe --self-test
```

Utiliser le fork Aphrody 1.4.4 disposant de `bun:chromium.connect`,
`findExecutable` et `bun:windows.Job`. `--browser chemin.exe` sélectionne un
moteur précis. La session possède son propre profil ; se connecter au site
dans cette fenêtre si nécessaire.

« Sélectionner un élément » active le sélecteur natif Chrome DevTools.
Le panneau affiche le cadre, HTML de l'élément, URL `currentSrc`, ainsi que les
requêtes candidates HLS/DASH, vidéo/audio et segments. Cliquer une requête
montre URL, méthode, en-têtes, initiateur, réponse, cadre et fichier de corps.
La correspondance par cadre est un indice ; plusieurs lecteurs dans un même
cadre nécessitent de comparer leurs URL et initiateurs. « Tous les cadres »
retire ce filtre. « Réduire » libère la surface du site.

« Exporter » écrit sous `$APHRODY_HOME/cookies/network-window/<session>`
(défaut `~/.aphrody/cookies/network-window/<session>`) :

- `cookies.json` : cookies CDP structurés, y compris HttpOnly et partitionnement.
- `network.json` : tous les événements du domaine Network exposés par le schéma
  du moteur, plus requêtes, redirections, initiateurs, corps et erreurs.
- `network.ndjson` : journal incrémental, conservé aussi à la fermeture.
- `site.html` : DOM courant ; `site.mhtml` : archive du site et ressources.
- `resources/*.html`, `*.js`, `*.css`, `*.body` : corps des réponses récupérables.

Les sous-cibles iframe/worker sont attachées récursivement avant leur reprise.
L'export concerne le trafic observé dans cette session, pas celui d'autres
profils ou du système. Les corps évincés, réponses en cours, flux infinis,
trafic interne inaccessible au CDP et contenu DRM ne deviennent pas des corps
complets : les erreurs de récupération sont conservées. Tampons CDP : 128 Mio
au total, 32 Mio par ressource. Les ressources ne sont pas réécrites pour
reproduire un site dynamique hors ligne.

« Fermer » exporte avant de fermer. La croix Windows conserve le journal réseau
et les corps déjà capturés ; exporter avant cette fermeture pour enregistrer
le DOM et les cookies. Le Job Windows termine les processus du moteur possédés
par l'application. Aucun export ni profil ne doit entrer dans Git.

Qualification locale : `--self-test` lance une vraie fenêtre sur une fixture
HTTP locale et vérifie cookie HttpOnly, manifeste HLS, fichiers JS/CSS,
événements Network, sélection DOM, initialisation du panneau et sélecteur
Overlay. `preview.png` est sauvegardé dans la session privée du test.

Références : [Network CDP](https://chromedevtools.github.io/devtools-protocol/tot/Network/),
[Overlay CDP](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/),
[Page CDP](https://chromedevtools.github.io/devtools-protocol/tot/Page/).
