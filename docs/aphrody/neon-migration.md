# Migration SQLite vers Neon pour Aphrody Bun

Relevé du 13 octobre 2026. La seule base SQLite persistante trouvée dans ce
checkout hors répertoires générés (`build`, `target`, `node_modules`, `vendor`)
est `bun_python.sqlite`. Elle appartient au registre Buv/PyJS et pèse
14 090 264 576 octets (3 440 006 pages de 4 096 octets, aucune page libre).
Ses dix tables portent les graphes, événements, exécutions et échantillons ;
elles ne sont pas des tables du site public. La base est ignorée par Git et
reste protégée dans son emplacement actuel.

Le profil Neon accessible ici ne liste que les projets `shenron-overflow` et
`inagle`. Le premier est limité à 400 000 000 octets logiques et appartient à
Shenron ; le second appartient à Inagle. Un projet Neon dédié à Aphrody Bun,
dimensionné pour le contenu à migrer et ses index (14 Go occupés localement),
doit être qualifié avant toute migration. Il faut également établir un snapshot
SQLite cohérent avec le WAL, un manifeste de tables et de droits, puis vérifier les comptages,
empreintes et lectures Postgres avant de basculer les writers. Le simple
transfert du fichier SQLite vers Postgres ne préserve ni les contraintes ni les
consommateurs.

Le site `packages/web/cloudflare` utilise Cloudflare D1 pour la table `files`.
Une lecture distante de la base de production `aphrody-app` a trouvé le schéma
présent, mais zéro ligne et zéro octet d'objets référencés ; son fichier D1
occupait 36 864 octets. Cette observation ponctuelle ne remplace pas un nouveau
relevé avant bascule. Les salons `Room` utilisent chacun le SQLite de leur
Durable Object pour les messages et l'hibernation WebSocket. Ils demandent un
inventaire des instances et une migration de protocole dédiée ; déplacer D1 ne
déplace pas leur historique.

`@aphrody/bun-plugin-neon` utilise `Bun.SQL` côté serveur Bun. Le Worker
Cloudflare tourne dans `workerd` et ne peut pas consommer directement ce pilote.
Une intégration Neon du site doit choisir explicitement un transport compatible
Worker, son authentification, ses coûts et son routage. Aucun secret, schéma ou
writer de production n'a été modifié par ce relevé.
