# Bun Video : catalogue vers Neon

Relevé du 13 octobre 2026. Le catalogue canonique local se trouve sous
`$APHRODY_HOME/data/bun-video/video.sqlite` : 790 528 octets, plus 1 182 472
octets de WAL au relevé. `PRAGMA quick_check` renvoie `ok`. Le snapshot cohérent
contient 11 tables : 1 753 fournisseurs, 814 capacités, 900 sources, 19 jobs,
6 artefacts, 4 qualifications, 510 entrées de capture et 346 ressources
capturées, avec les tables auxiliaires. Les fichiers `publication/*/catalog.sqlite`
sont des exports publics dérivés ; `site/cache.sqlite` est un cache. Les cookies
Crunchyroll restent dans leur store protégé distinct et sont exclus.

La base Neon dédiée `aphrody-bun-video` (`odd-sound-74350267`, organisation
Aphrody Free, PostgreSQL 18, `aws-eu-central-1`, base `bun_video`) est créée.
Son quota logique est de 1 Gio ; le catalogue local, même avec son WAL, tient
largement dans cette enveloppe. L'URL directe est conservée uniquement dans
`$APHRODY_HOME/config/bun-video-neon.url`, avec ACL locale restreinte ; le client
vérifie TLS, l'hôte et le nom de base. Le projet Shenron et Inagle sont séparés.

`src/video-neon-migrate.ts` lit un snapshot SQLite/WAL cohérent en mémoire,
vérifie le schéma et l'intégrité, puis importe en une transaction PostgreSQL
dans un schéma `bun_video` vide. Il relit toutes les lignes et compare une
empreinte SHA-256 avant le commit. Une branche Neon éphémère contenant seulement
une fixture synthétique a passé l'import et la comparaison des 11 tables ; elle
est supprimée après le contrôle. Le catalogue privé réel n'a pas été copié.

`NeonVideoCatalog` implémente maintenant les lectures et écritures des fournisseurs,
sources, jobs, artefacts et qualifications sur le schéma Neon. `VideoWorkerPool`
accepte ce catalogue asynchrone : sur une branche éphémère, une fixture a été
importée, puis un job synthétique a écrit sa source, son état terminé et son
artefact dans Neon. Le test a passé ; la branche a été supprimée. Cela qualifie
le parcours des workers avec injection explicite du catalogue, pas les autres
consommateurs ni la production.

L'import HAR peut aussi recevoir `NeonVideoCatalog`. Il écrit la source et les
tables `capture_entries`/`captured_resources` dans une transaction PostgreSQL,
en ne conservant que l'hôte, les comptages et les chemins privés vers les corps.
Une branche synthétique a validé cette écriture et l'absence des cookies et
paramètres d'URL signés dans les lignes SQL ; elle a été supprimée.

La watchlist, les requêtes/exportations filtrées, la publication dérivée et le
site local loopback acceptent désormais le catalogue Neon. Les CLI de la
watchlist et des workers lisent le backend canonique par
`openConfiguredVideoCatalog` ; `BUN_VIDEO_CATALOG_BACKEND=neon` et le fichier
privé de connexion sélectionnent Neon. Le marqueur privé
`$APHRODY_HOME/config/bun-video-neon.active`, à poser uniquement après le
dernier import vérifié, interdit ensuite la création implicite de SQLite.
`VideoCatalog` refuse aussi toute nouvelle ouverture disque dans ce mode.
Le site local et les exports ont passé un essai HTTP sur une branche Neon
synthétique, ensuite supprimée.

La bascule exige encore de figer les writers SQLite, importer un dernier snapshot,
vérifier les comptages et l'empreinte, poser le marqueur de cutover et relancer
les consommateurs avec le fichier de connexion Neon.
La seule copie SQLite conservée ensuite serait la sauvegarde qualifiée. Copier
le catalogue maintenant créerait deux sources de vérité divergentes. Le site
public `aphrody.app` présente Bun Video, mais son Worker n'accède pas à ce
catalogue privé ; `video-data-site.ts` est une application locale loopback.
