# Omar

Guide d'exploitation complet : [docs/OMAR-SERVER-GUIDE.md](docs/OMAR-SERVER-GUIDE.md).

Monorepo local Bun 1.4.4 pour le PC et les services d'Omar.

- `server/` : superviseur Windows, WebOS, index et cache.
- `codex/` : plugin Omar et outils personnels.
- `private/omar.md` : fiche confidentielle originale, exclue de Git et protégée par ACL.

Les anciens chemins `C:/SSH/omar-server`, `C:/SSH/omar-codex` et `C:/SSH/omar.md` sont des liens vers ce dossier. Ils ne contiennent aucune copie indépendante.

Un seul `bun.lock` actif verrouille les workspaces serveur, WebOS et plugin Tailwind, ainsi que les dépendances système Winget. `bun install --frozen-lockfile` à la racine utilise le mode hoisted de `bunfig.toml` ; les anciens dossiers `node_modules` locaux ont été retirés après compilation avec les dépendances partagées.

## Accès

Ouvrir **http://localhost/** pour Omar WebOS via Nginx natif port 80. Depuis les VPS (VPS/DBFR) ou le PC Aphrody sur WireGuard : **http://10.200.77.10/**. Le dashboard Beszel reste sur http://127.0.0.1/. Le VPS peut aussi utiliser son forward loopback `28080` avec l'en-tête Host `omar-webos`. Les routes `/mcp/`, `/a2a/`, `/v1/` et `/system-stream/` sont présentes sur le même serveur WebOS.

Le service Windows `OmarServer`, démarré automatiquement sous SYSTEM, supervise Nginx, A2A, le stream système, llama CUDA, WebOS, le proxy Japon, le suivi NTFS et le cache. Santé : `http://127.0.0.1:8797/health`.

## Index

SQLite : `server/var/index/omar.sqlite`. Redis authentifié sur loopback:6379, AOF/RDB, budget 512 Mo. Les secrets restent dans le répertoire privé Aphrody utilisateur.

- MFT : environ 2,26 millions d'enregistrements alloués ; USN actualisé toutes les 2 secondes, santé `8802/health`.
- System32 : 5 304 chemins EXE/DLL, 5 257 fichiers uniques, 12 180 liens NTFS vérifiés contre le nombre déclaré de liens. Quatorze zones protégées n'étaient pas parcourables ; elles restent signalées dans les preuves.
- Graphes : sources Bun OS, Aphrody et Omar strict, plus 126 491 dépendances PE. Les snapshots conservent leur provenance ; les analyses incomplètes restent indiquées. Les alias hors du périmètre PE System32 ne sont pas démontrés exhaustifs.
- Cache : les 13 tables autorisées sont compressées en chunks et renouvelées toutes les 30 minutes, TTL 1 heure ; santé `8803/health`. SQLite reste la source canonique.

## Commandes

```powershell
bun run status
bun graph
bun graph search WebOS --limit 10
bun graph status --scope bun-os --limit 5
bun graph index --scope omar-strict
bun server/source-graph-index.ts
bun server/ntfs-index-sync.ts
bun server/ntfs-index-pe-paths.ts
bun server/warmCache.ts
bun server/manifest-webos.ts
```

`bun graph` est la commande du monorepo branchée sur les API natives `bun:graph`. Elle affiche les snapshots courants par défaut et propose recherche, voisins et parcours bornés. `bun graph help` décrit les scopes Omar, Bun OS et Aphrody. Les index de sources utilisent directement `bun:graph-index` ; les dépendances EXE/DLL restent accessibles dans l'onglet System32 de WebOS.

Le bundle WebOS se construit dans `server/apps/bun-webos` avec `bun --no-env-file build.ts`. Son module WASM est le sous-ensemble Rust Bun SemVer, analyse Shell et Markdown ; il n'exécute pas les capacités natives Windows/CUDA dans le navigateur.

Le chat compte les tokens avec le template et le tokenizer du serveur llama.cpp. Il retire les anciens tours quand le contexte local est rempli et l'indique dans l'interface ; un message unique trop long reçoit une explication.

## État de l'infrastructure

Bun 1.4.4 est installé dans System32, avec bunx et Bun Shell. SSH Windows utilise Bun Shell ; WireGuard, VNC et le partage SMB Omar-C sont actifs. Ubuntu WSL a été retirée après migration vérifiée, libérant environ 122 Go ; Docker VMM conserve ses données et dispose de 4 Go RAM.

L'API OpenAI compatible utilise llama.cpp CUDA sur RTX4060. Windows Famille n'héberge pas le serveur Microsoft RDP. La qualification GPU vLLM dans Docker VMM et le bureau Wayland restent des travaux distincts non terminés. Bun 1.4.4 `a2efe6945` a passé 12 sondes de qualification et OmarServer a été redémarré sur cette révision ; les contrôles PE stricts passent également. Le code source est synchronisé sur `aphrody-labs/bun-os` dans la branche `omar/bun-os-sync-20261011`; son binaire qualifié est publié dans la [release privée Omar](https://github.com/aphrody-labs/omar/releases/tag/omar-bun-1.4.4-a2efe694-20261011).

Le proxy Japon est limité aux consommateurs Aphrody Web/Shenron ; le reste du trafic Windows reste direct. Les profils de connexion, cookies et tokens ne sont pas exportés dans ce monorepo.
