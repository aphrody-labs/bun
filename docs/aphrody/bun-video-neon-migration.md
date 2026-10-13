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

La bascule exige de convertir les writers et lecteurs de `VideoCatalog`,
actuellement synchrones sur `bun:sqlite`, vers des opérations `Bun.SQL`
asynchrones, puis de figer les writers SQLite, importer un dernier snapshot,
vérifier les comptages et l'empreinte, et déployer les consommateurs sur Neon.
La seule copie SQLite conservée ensuite serait la sauvegarde qualifiée. Copier
le catalogue maintenant créerait deux sources de vérité divergentes. Le site
public `aphrody.app` présente Bun Video, mais son Worker n'accède pas à ce
catalogue privé ; `video-data-site.ts` est une application locale loopback.
