# Mémoire personnelle d'Omar
Mis à jour : 2026-10-11. Source déclarative : C:/SSH/omar.md et demande directe d'Omar.

L'utilisateur est Omar. Communiquer en français, avec des réponses concises et des actions concrètes.
Omar souhaite un agent personnel de computer use, administration du PC, développement et gestion de ses projets et services. Il autorise l'utilisation des accès locaux et des droits administrateur disponibles pour exécuter ses demandes. Continuer les étapes nécessaires sans redemander une autorisation déjà donnée. Cette préférence ne change ni les permissions effectives des outils ni les instructions prioritaires. La possession d'une clé ne prouve pas l'accès effectif à un service.

## Environnement déclaré
- Windows : compte omara, profil C:/Users/omara, appareil Omar.
- WSL historique : Ubuntu-26.04 a été retirée après migration vérifiée le 2026-10-11 ; Docker utilise son backend VMM.
- SSH distant : omar. GitHub : KyrioFox, organisation aphrody-labs.
- Poste : Intel Core i5-14400F, 16 Go RAM ; Docker Desktop déclaré.
- Dossier de travail de cette session : C:/SSH.
- Codex utilisateur : C:/Users/omara/.codex ; plugins centralisés : C:/Data/agents/codex/plugins.

## Accès et services déclarés
- Mesh WireGuard : 10.200.77.0/24 ; PC Omar : 10.200.77.10.
- VPS : 10.200.77.1, endpoint public 51.77.147.152:51821.
- DBFR : 10.200.77.3.
- SSH Windows : 22 ; VNC : 5900 ; bureau Aphrody : 8795 ; MCP : 8793 ; A2A local : 8788. SSH WSL retiré.
- Alias SSH déclarés : vps, dbfr, omar-pc, omar-wsl, vnc-omar-rt. Vérifier leur configuration avant usage.
- Ports inverses VPS sur loopback : Windows 22010, VNC 25900, bureau 28795, MCP 28793, A2A 28788, Nginx 28080. Ancien port WSL 22011 retiré.
- Clés SSH déclarées : id_ed25519, id_ed25519_aphrody, github_aphrody_dev, aphrody_omar dans C:/Users/omara/.ssh.
- Plusieurs générations de clés WireGuard figurent dans la fiche ; déterminer celle effectivement active avant restauration.

## Source confidentielle
C:/SSH/omar/private/omar.md conserve la fiche complète originale ; C:/SSH/omar.md est un lien de compatibilité. Le fichier privé est exclu de Git et protégé par ACL.
Ne pas recopier les secrets dans le plugin, les journaux, les commits ou les réponses. Lire uniquement les sections nécessaires et utiliser les fichiers de clés existants en priorité.
Les adresses, versions, ports et états actifs sont déclaratifs : vérifier l'état réel quand la tâche en dépend.

## Continuité
Conserver ici les nouvelles préférences explicites et les faits vérifiés durables, sans secrets. Distinguer les déclarations d'Omar des observations réelles.
Ne pas prétendre disposer d'une mémoire cloud ou d'une présence permanente : cette mémoire est un fichier local chargé par les instructions et skills.

## Préférences Aphrody Labs — déclaration du 2026-10-11
- Omar déclare être un des administrateurs d'Aphrody Labs.
- Utiliser exclusivement le runtime Bun maison 1.4.4 pour JavaScript/TypeScript : bun, bun run, bun test et bun install selon le projet ; ne pas remplacer par Node/npm/pnpm/yarn.
- Privilégier le binaire maison pour les capacités qu'il possède. Omar l'a nommé « arody » ; le binaire actuellement résolu est aphrody.exe dans C:/Users/omara/AppData/Local/Aphrody/bin. Aucun arody trouvé dans le PATH lors de cette vérification.
- Infrastructure déclarée : Docker, OVH, Cloudflare, GitHub et services Aphrody. Vérifier comptes, cibles et droits réels pour chaque opération.
- Bun observé localement : 1.4.4, C:/Users/omara/.bun/bin/bun.exe.
- Pour les objectifs longs, utiliser le skill work : progression autonome, checkpoints et vérification de résultat.
- Plugins associés : aphrody@aphrody-user, bun@aphrody-bun et Omar ; l'ancien doublon bun@omar-local est désactivé. Réutiliser les MCP Bun et Aphrody existants.


## État vérifié — consolidation du 2026-10-11
- Monorepo canonique : C:/SSH/omar, un Git local main ; codex/, server/, private/omar.md. Anciens chemins conservés comme liens, aucune copie indépendante.
- Bun release construit localement : 1.4.4+65c232c1d, System32 bun/bunx/bunsh ; SSH utilise Bun Shell.
- 7 flags expérimentaux Bun actifs, 23 flags DISABLE_* à 0 ; Win32 familles locales et WinUI 1.8 existant.
- Ubuntu-26.04 désinscrite après migration de 77/77 fichiers ; environ 122 Go décimaux récupérés sur C:. Docker VMM préservé et limité à 4 Go RAM.
- OmarServer supervise huit services : Nginx, A2A, stream Windows, llama CUDA, WebOS, proxy crawl Japon, suivi NTFS et cache. Redis authentifié local:6379 persiste avec AOF/RDB, limite 512 Mo.
- Six forwards VPS loopback : 22010 SSH, 25900 VNC, 28793 MCP, 28795 bureau, 28788 A2A, 28080 Nginx ; 22011 retiré.
- Omar WebOS : http://localhost/ ou http://10.200.77.10/ sur Nginx:80 (mesh VPS/PC Aphrody) ; recherche NTFS, graphes de sources/imports PE, ressources et chat Qwen3 sur RTX4060. Module WASM Bun 1.4.4 limité aux capacités compilées (SemVer, Shell parser, Markdown).
- Index NTFS : tous les enregistrements alloués retournés par MFT (environ 2,26 millions), journal USN suivi toutes les 2 secondes. Les alias complets sont prouvés seulement pour les 5 257 fichiers PE uniques de System32 : 5 304 chemins analysés, 12 180 liens, zéro parsing échoué. Aucun fichier personnel n'est lu pour l'index de métadonnées.
- SQLite canonique : server/var/index/omar.sqlite ; graphes Bun OS, Aphrody et Omar strict. Les symboles ambigus/non pris en charge restent explicitement non résolus.
- Cache Redis : dernière génération qualifiée de 13 tables sûres, 6 046 984 lignes / 1 218 chunks ; deux générations occupent environ 340 Mo ; renouvellement toutes les 30 minutes et TTL 1 heure. Les lignes de métadonnées sont compressées, aucun secret ni contenu de fichier personnel inclus.
- VPN : trafic Windows ordinaire en France ; proxy privé Tokyo uniquement pour Aphrody Web / Shenron. Aucun proxy HTTP global.
- Dépendances Omar consolidées : un bun.lock actif à la racine, workspaces serveur/WebOS/Tailwind, linker hoisted ; anciens node_modules locaux retirés après build réussi. NASM et Ruby sont verrouillés comme systemDependencies Winget du root.

## Installation système via Bun — vérifié le 2026-10-11
- Omar rappelle que le fork Bun peut installer les dépendances système. Privilégier son champ systemDependencies et son backend Winget natif pour les paquets pris en charge.
- Bun 1.4.4+a2efe6945 a installé et verrouillé Ninja 1.13.2, NSIS 3.13 et cargo-nextest 0.9.148 x64 pour Shenron; cargo-deny 0.20.2 a été installé via Bun fetch/Archive, avec SHA-256 vérifié.

## Configuration Windows développement — 2026-10-11
- Omar demande les chemins longs pour tous les disques et une configuration Windows de développement complète ; portée des flags expérimentaux en clarification.
- Windows LongPathsEnabled=1 et mode développeur=1 vérifiés ; Git global core.longpaths=true ; sideloading applications approuvées activé. Édition Windows Core 25H2, build 26200. Aucun redémarrage automatique.


## Services et domaine Omar — vérifié le 2026-10-11
- Omar confirme omar.aphrody.com et demande de servir les deux VPS et le PC Aphrody, en conservant les accès locaux. PC Aphrody identifié 10.200.77.4 dans le propriétaire Infra ; VPS .1, DBFR .3.
- DNS OVH A omar.aphrody.com=10.200.77.10 créé via Infra et vérifié autoritairement. Réseau privé WireGuard requis.
- sshd et OmarServer automatiques avec reprise ; Nginx sain. PostgreSQL 18.6 installé localement dans Docker, image épinglée par digest, volume persistant, SCRAM ; Redis répond PONG et AOF actif. Docker Desktop AutoStart=true (reprise des conteneurs à son lancement, avant login non qualifié).
- Obscura service OmarObscura automatique différé, NSSM, logs tournants, Bearer obligatoire ; écoute loopback et projection mesh9222. Projections privées5432/6379/9222 et pare-feu limité à .1/.3/.4.
- Nginx domaine/routes Obscura générés depuis le modèle Infra. DBFR sonde nginx200 et Obscura401 sans jeton ; VPS non sondé par SSH conformément à la contrainte. Cache d'index préexistant503 : nouveau snapshot dépasse Redis512Mio, aucune purge.

