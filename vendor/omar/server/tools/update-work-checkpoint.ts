import {withBunMcp,guardedWrite} from "../bun-mcp-client";
const path="C:/SSH/omar/codex/state/work.md";
const old=await Bun.file(path).text();
if(!await Bun.file("C:/SSH/omar/codex/state/work-20261011-history.md").exists())await Bun.write("C:/SSH/omar/codex/state/work-20261011-history.md",old);
const graph=await Bun.file("C:/SSH/omar/server/var/index/graph-artifacts/omar-strict-coverage.json").json();
const cache=await fetch("http://127.0.0.1:8803/status").then(r=>r.json());
const summary=await fetch("http://localhost/api/omar/summary").then(r=>r.json());
const commit=Bun.spawnSync({cmd:["git","rev-parse","HEAD"],cwd:"C:/SSH/omar",stdout:"pipe",stderr:"ignore"}).stdout.toString().trim();
const runtimePath="C:/Windows/System32/bun.exe";
const runtimeRevision=Bun.spawnSync({cmd:[runtimePath,"--revision"],stdout:"pipe",stderr:"ignore"}).stdout.toString().trim();
const runtimeHasher=new Bun.CryptoHasher("sha256");
for await(const chunk of Bun.file(runtimePath).stream())runtimeHasher.update(chunk);
const runtimeSha256=runtimeHasher.digest("hex");
const installation=await Bun.file("C:/SSH/omar/server/var/runtime-install.json").json().catch(()=>null);
const runtimeQualified=installation?.schema==="aphrody.bun-runtime-install/v1"&&installation?.sha256===runtimeSha256;
const checkpoint=`# Work — serveur GPU et monorepo Omar

Mis à jour : ${new Date().toISOString()}. Demandes reprises : configuration native Windows Bun, fusion Omar, index NTFS/System32, graphe, SQLite, Redis et WebOS.

## État courant

- Racine canonique C:/SSH/omar, un dépôt Git main, commit local ${commit}. codex/, server/, private/omar.md ; anciens chemins conservés par junctions/symlink. Fiche privée exclue de Git et ACL corrigées.
- Runtime local construit depuis aphrody-labs/bun-os : ${runtimeRevision}, SHA-256 ${runtimeSha256}. Installation qualifiée=${runtimeQualified}. System32 bun/bunx/bunsh/aphrody et PATH actifs. SSH Windows utilise Bun Shell.
- Un bun.lock actif, workspaces serveur/WebOS/Tailwind, linker hoisted ; NASM/Ruby verrouillés à la racine et anciens node_modules locaux retirés après build réussi.
- Aphrody native-20261009-21ff48ba62 installée. Plugin Bun maison actif ; ancien doublon bun@omar-local désactivé. Plugin Omar 1.2.1 installé et actif, avec le skill omar-indexing et les chemins canoniques.
- Flags Bun documentés persistés : 7 activations expérimentales, 23 DISABLE_* à 0, NO_LIBDEFLATE à 0, familles Win32 et WinUI 1.8. Pas de fault injection ni flags de compilation POSIX inventés.
- OmarServer SCM automatique SYSTEM supervise huit enfants sains : Nginx, A2A, stream Windows, llama CUDA, WebOS, proxy Japon, suivi NTFS et cache. Les tâches natives MCP/bureau/reverse SSH conservent leur contexte utilisateur.
- WebOS Nginx:80 accessible http://localhost/ et http://10.200.77.10/ depuis le mesh ; accès réel depuis VPS qualifié. Recherche NTFS incluant aliases System32, graphes sources/imports PE, ressources/cache et chat GPU SSE. Chat template/tokenizer natifs bornent l'historique au contexte réel et signalent les messages trop longs. COOP/COEP actifs pour le module WASM. Bundle compilé et HTTP/API/WS/stream CUDA qualifiés ; cross-site refusé 403.
- WASM Bun 1.4.4 construit, 277332 octets, SHA-256 484fd359cdf03b98a2b6731b001541a4846e716b9fcd882eb0e46dab2928acc1 ; vrai loader qualifie SemVer, Shell parser et Markdown. Ce module est un sous-ensemble, pas le monorepo complet exécuté en navigateur.

## Index et cache

- SQLite server/var/index/omar.sqlite, environ 2.26 millions d'entrées NTFS allouées, suivi USN toutes les 2 s (8802/health). Bun enumerateMft expose un seul nom par record : les aliases hors scope PE restent non exhaustifs.
- System32 : 5304 chemins EXE/DLL analysés, 0 erreur lecture/parsing sur les chemins accessibles, 14 zones protégées signalées ; 126491 imports, 854694 symboles importés, 364937 exports.
- Aliases NTFS PE : 5257 fichiers uniques, 12180 liens retournés Win32, tous concordent avec nNumberOfLinks, 0 alias incomplet. kernel32.dll est présent sous System32 et WinSxS.
- Graphes natifs Bun OS/Aphrody/Omar strict. Omar strict : ${graph.totals.files} fichiers, ${graph.totals.nodes} nœuds, ${graph.totals.edges} arêtes, ${graph.totals.parseErrors ?? 0} erreur parsing ; révision ${graph.revision}, dirty=${graph.dirty}. Sorties/dist/bin/cache/profils exclus. WebOS affiche les derniers snapshots par dépôt (${summary.code.nodes} nœuds/${summary.code.edges} arêtes) ; l'historique reste conservé. Le graphe initial omar large reste préliminaire.
- Redis officiel 8.10.2-alpine dans Docker VMM : authentifié loopback6379, AOF/RDB, limite512MiB, conteneur768MiB. Cache complet des13tables autorisées, dernière génération ${cache.lastRun?.generation ?? "indisponible"}, publiée ${cache.lastRun?.publishedAt ?? "indisponible"}. Première qualification : 6029500 lignes/1216chunks,115654436octets gzip (~170.3Mo Redis),0éviction. Snapshot renouvelé30min,TTL1h, santé8803.
- WAL initial3.52Go libéré après fermeture ciblée des anciens readers CTE Bun PID7864 et19836. TRUNCATE final a signalé SQLITE_IOERR_TRUNCATE; fermeture des derniers handles a supprimé WAL/SHM, puis le watcher a recréé un WAL de247Ko. PRAGMA quick_check final=ok ; ne pas rapporter TRUNCATE success.

## Infrastructure préservée et migrée

- Ubuntu WSL retirée après migration shenron-train77/77SHA-256 et migration A2A/MCP/reverse. Environ122Go décimaux récupérés sur C:. Docker VMM/données conservés ; RAM Docker4Go, aucune intégration Ubuntu restante.
- Six forwards VPS loopback :22010→SSH22,25900→VNC5900,28793→MCP8793,28795→bureau8795,28788→A2A8788,28080→Nginx80.22011 retiré. SSHd VPS validé/rechargé, clés existantes conservées.
- WireGuard10.200.77.10 actif ; SMB Omar-C chiffré, VNC5900 et bureau Aphrody8795 actifs. Windows Famille ne peut pas héberger RDP Microsoft.
- Windows directFrance, Mullvadglobaldéconnecté ; SOCKS Tokyo scopedAphrodyWeb/Shenron viaBunSSH natif +HTTP CONNECTlocalhost11081. VPSdirectFrance ; launcher Aphrody web-engine crawl dédié au proxy Japon, aucune API/crawl VPS inexistante déclarée active.
- llama.cpp b11552 CUDA13.4/RTX4060, modèleQwen3-0.6B-Q8_0 local8081 authentifié, OpenAI/SSE viaNginx. Beszelhub+agentWindows actifs.
- Node.js MSI externe retiré ; alias node.exe hardlinkBun conservé. Les fichiers personnels, modèles uniques et stashesGit sont préservés.

## Travaux originaux encore ouverts

- Gate release Windows Bun : contrôles PE stricts réussis sur le candidat ; installation stable qualifiée=${runtimeQualified}. Publication distante à tracer séparément.
- vLLM GPU et bureau Wayland dans DockerVMM non qualifiés ; DockerVMM ne donne pas actuellement un GPU CUDA utilisable au conteneur. L'inférence CUDA native est opérationnelle.
- Transfert externe des profils : archive locale sélective prête ; destination pas confirmée. Aucun cookie, token, loginDB ni clé exporté. Aucune donnée Google privée exportée.
- Index NTFS : les records alloués sont couverts ; aliases complets prouvés seulement pour les fichiers PE System32. Les symboles de graphes non résolus restent à qualifier.

Prochaine action : traiter les gates Bun release puis les capacités Docker réellement disponibles. Historique conservé dans work-20261011-history.md. Aucun secret dans ce checkpoint.
`;
await withBunMcp("C:/",call=>guardedWrite(call,path,checkpoint));
console.log("Checkpoint canonique mis à jour; historique conservé.");
