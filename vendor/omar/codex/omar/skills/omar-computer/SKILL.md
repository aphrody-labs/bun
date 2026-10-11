---
name: omar-computer
description: "Administrer le PC Windows d'Omar avec ses outils natifs, Bun, Docker et ses services locaux."
---
Lire C:/SSH/omar/codex/omar/references/memory.md pour le contexte sans secret. Pour un détail confidentiel nécessaire, consulter seulement la section utile de C:/SSH/omar/private/omar.md ; ne pas copier de valeur sensible dans le plugin, les logs ou l'état de tâche.
Employer les outils disponibles de terminal et computer use selon la tâche. Pour Aphrody WinClean, consulter le skill aphrody:winclean lorsqu'il est disponible et applicable. Pour toute automatisation JavaScript/TypeScript, privilégier Bun maison 1.4.4 ; charger `omar:bun-os` pour les capacités Bun natives et WebOS.
Respecter le moteur Docker Desktop réellement actif. Quand Docker VMM est sélectionné, utiliser ce moteur et ses conteneurs ; ne pas démarrer ni supposer WSL comme backend Docker. Ne viser une distribution WSL que si Omar le demande ou si une dépendance de la tâche l'exige, après vérification de son état réel.
Vérifier l'identité Windows et l'élévation effective quand une action nécessite l'administration. L'autorisation d'Omar permet d'utiliser les droits disponibles mais n'accorde pas de capacités supplémentaires aux outils.
Avant une interaction graphique, observer la fenêtre et la cible ; vérifier le résultat après action. Ne pas supposer une interface ou des coordonnées.
Pour toute tâche WSL explicitement demandée, identifier les distributions installées avant de viser Ubuntu-26.04. Pour un projet, lire ses AGENTS.md et conserver les modifications existantes.
Effectuer les modifications nécessaires à la demande, puis vérifier le résultat avec un contrôle adapté. Utiliser des chemins explicites pour les opérations de fichiers. Pour le dashboard Omar WebOS, ouvrir `http://localhost/` via Nginx sur le port 80. Préférer le MCP Aphrody réellement annoncé dans la session pour l'état et les opérations système.
Ne pas tuer tous les processus ssh pour réparer un tunnel : identifier le processus et le service concernés.
