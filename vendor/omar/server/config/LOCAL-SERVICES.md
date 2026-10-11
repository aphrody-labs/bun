# Services locaux Omar

Configuration vérifiée le 2026-10-11 sous Bun Aphrody 1.4.4+a2efe6945.

Le DNS autoritaire OVH publie `omar.aphrody.com → 10.200.77.10` (TTL 300).
Ce nom nécessite le réseau privé WireGuard Aphrody. Pairs autorisés pour les
services de données : VPS `10.200.77.1`, DBFR `10.200.77.3`, PC Aphrody
`10.200.77.4`. Les services restent également disponibles en loopback.

| Service | Accès privé | Persistance |
| --- | --- | --- |
| SSH | `omar.aphrody.com:22` | OpenSSH `sshd`, automatique, reprise sur panne, clés uniquement |
| Nginx / WebOS | `http://omar.aphrody.com/` | Superviseur Bun `OmarServer`, automatique, reprise du processus |
| PostgreSQL 18.6 | `omar.aphrody.com:5432` | Docker `omar-postgres`, `unless-stopped`, volume `omar-postgres-data` |
| Redis 8.10.2 | `omar.aphrody.com:6379` | Docker `omar-redis`, `unless-stopped`, AOF/RDB, volume existant |
| Obscura CDP | `omar.aphrody.com:9222` et `/obscura/` | Service NSSM `OmarObscura`, automatique différé, reprise sur panne |

PostgreSQL utilise SCRAM-SHA-256 ; Redis exige son mot de passe existant ;
Obscura exige `Authorization: Bearer <jeton>`, y compris localement.
Les identifiants vivent uniquement dans les dossiers protégés
`~/.aphrody/private/omar-{postgres,redis,obscura}/`. Ne pas les commiter.
Le secret PostgreSQL est copié dans le volume `omar-postgres-config` et
fourni par `POSTGRES_PASSWORD_FILE`, jamais dans les arguments du conteneur.

Les projections Windows `netsh interface portproxy` relient l'adresse mesh
aux ports loopback 5432, 6379 et 9222. La règle de pare-feu
`Omar-Data-Obscura-Mesh` limite ces ports aux trois pairs ci-dessus.
Le service Obscura utilise le binaire canonique
`C:/Windows/System32/aphrody.exe web-engine launch --host 127.0.0.1 --port 9222 --workers 1`.
Ses variables NSSM définissent le jeton et l'adresse de projection privée.
Ses journaux tournent dans `server/var/services/`, limités à 10 Mio par rotation.

La configuration Nginx est générée depuis le propriétaire Infra
`C:/aphrody/tools/config/host/nginx/omar-webos.json`. Elle relaie notamment
`/a2a/`, `/v1/`, `/mcp/`, `/system-stream/`, `/obscura/` et `/devtools/`.
La présence d'une route ne prouve pas que son backend est démarré.

Docker Desktop conserve son backend Linux actuel et `AutoStart=true`.
Les conteneurs reprennent au lancement de Docker Desktop, normalement à
l'ouverture de session Windows ; aucun fonctionnement avant connexion
Windows n'a été qualifié. Aucun redémarrage du PC n'a été effectué.

Preuves : sonde SQL via `Bun.SQL`, Redis `PING=PONG`, AOF actif, Nginx 200,
Obscura 200 authentifié et 401 sans jeton. Depuis DBFR : Nginx 200, DNS privé
correct, Obscura 401 sans jeton. Connexions depuis le VPS et l'autre PC non
qualifiées ; aucune connexion SSH VPS pendant ce lot.

Limite existante : le service de cache des index répond 503 lorsque son
nouveau snapshot dépasse le budget Redis de 512 Mio. Redis lui-même répond
normalement ; les données n'ont pas été purgées pour masquer ce défaut.
