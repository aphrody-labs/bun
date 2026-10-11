---
name: omar-indexing
description: "Consulter ou actualiser les index locaux Bun du code Aphrody/Omar et des métadonnées NTFS sur Windows."
---

# Index locaux Omar

Utiliser ce skill pour les graphes de code et de ressources, les alias de chemins NTFS, les événements USN ou le cache des index. Bun maison 1.4.4 est le runtime JavaScript/TypeScript. Lire `C:/SSH/omar/AGENTS.md` et la mémoire sans secret `C:/SSH/omar/codex/omar/references/memory.md` avant un scan. Pour une information confidentielle indispensable, consulter seulement la section utile de `C:/SSH/omar/private/omar.md`.

## Owners et interfaces

- Préférer le MCP Aphrody ou Bun réellement annoncé dans la session pour interroger les capacités, le graphe, le système et les services. Ne pas inventer d'outil MCP ou d'endpoint. Le dashboard est `http://localhost/` derrière Nginx sur le port 80.
- Utiliser les owners natifs `bun:graph` (BunPython) et `bun:graph-index` (indexCodebase), intégrés au runtime maison. Depuis `C:/SSH/omar`, `bun graph` affiche les derniers snapshots, `bun graph search <texte> --limit 10` recherche, et `bun graph help` décrit voisins/parcours bornés. Scopes : `--scope omar-strict|bun-os|aphrody`. `bun graph index --scope <scope>` délègue à `server/source-graph-index.ts`; snapshots et base restent sous `server/var/index/`.
- L'index NTFS utilise `bun:windows` (`NtfsVolume.enumerateMft` et `queryJournal`) dans `C:/SSH/omar/server/ntfs-index*.ts`. Le suivi USN expose son état via `http://127.0.0.1:8802/health`.
- Le service de cache lit une allowlist de tables depuis SQLite en lecture seule et publie des blocs compressés dans Redis. Son interface locale est `http://127.0.0.1:8803`; Redis est plafonné à 512 MiB avec expiration des clés.
- OmarServer supervise huit services : Nginx, A2A, stream système, llama CUDA, WebOS, proxy de crawl Japon, index NTFS et cache chaud. Vérifier le catalogue et la santé actuels au lieu de supposer qu'ils tournent.

## Portée et confidentialité

- Garder chaque indexation de graphe bornée aux surfaces demandées et aux budgets de fichiers, octets, nœuds, arêtes et mémoire du propriétaire. Le profil strict Omar exclut configuration, journaux, caches, dépendances, sorties de build, données `server/var`, `codex/private` et références du profil. Ne jamais indexer de fiche privée, secret, cookie ou session.
- L'énumération MFT de `C:` couvre des métadonnées d'entrées allouées du volume ; elle ne lit pas leur contenu. Conserver noms, identifiants de records, attributs, relations parent-enfant et checkpoints USN dans les bases locales protégées.
- Le suivi USN incrémental peut exiger une resynchronisation si l'identité ou le journal change. Lire son état de santé avant de dire que l'index est à jour.
- La résolution complète d'alias NTFS est qualifiée pour les fichiers PE System32 inclus dans le manifeste de couverture. Ne pas généraliser cette complétude à tout `System32`, aux autres répertoires ou types de fichiers. Rapporter la portée et les échecs depuis le manifeste.
- Pour SQLite, préférer les interfaces de lecture du propriétaire. En lecture directe, ouvrir en lecture seule, activer `PRAGMA query_only=ON` et garder une transaction courte. Avant un writer ou une reconstruction, vérifier qu'aucun writer n'est actif sur `omar.sqlite`; ne pas contourner un verrou ou une transaction.
- Ne pas vider les tables, lire le contenu de fichiers personnels ni afficher des chemins individuels sans nécessité. Présenter des comptes agrégés et leur portée. Garder les artefacts sous `server/var/`, hors plugin et Git.

Un endpoint de santé confirme que le service répond, pas la complétude de ses données. Pour modifier un indexeur, lire d'abord son owner Bun et les manifestes de couverture existants.
