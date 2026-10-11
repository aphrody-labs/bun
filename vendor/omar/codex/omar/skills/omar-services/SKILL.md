---
name: omar-services
description: "Travailler sur les projets et services d'Omar avec Bun, Aphrody, SSH, Docker, réseau et fournisseurs cloud."
---
Lire C:/SSH/omar/codex/omar/references/memory.md pour le contexte sans secret. Pour un détail confidentiel nécessaire, consulter seulement la section utile de C:/SSH/omar/private/omar.md ; ne pas copier de valeur sensible dans le plugin, les logs ou l'état de tâche.
Retrouver le projet ou service demandé avant de modifier sa configuration. Ne pas inventer les chemins des projets à partir du seul nom.
Pour les automatisations JavaScript/TypeScript, utiliser exclusivement le runtime maison Bun 1.4.4. Préférer les API natives du fork et les paquets Aphrody qui les exposent quand ils couvrent la tâche ; vérifier la capacité dans le checkout et dans le binaire installé avant de l'annoncer. Pour Docker, consulter le contexte et le backend actifs ; garder Docker VMM si c'est le choix configuré par Omar, sans supposer WSL.
Inspecter la configuration SSH et les fichiers de clés locaux avant de reconstruire des accès à partir de C:/SSH/omar/private/omar.md. Utiliser ssh -G pour résoudre un alias et une connexion bornée avec BatchMode et ConnectTimeout pour vérifier l'accès.
La fiche contient plusieurs clés WireGuard historiques : comparer les clés publiques et l'état réel avant toute sélection. Les tokens servent uniquement au service correspondant.
Utiliser les skills Aphrody pertinents déjà disponibles pour les commandes du kernel, les propriétaires de code et les déploiements. Préférer le MCP réel annoncé dans la session et ne pas dupliquer son serveur ou inventer un endpoint MCP.
Pour un service inaccessible, diagnostiquer réseau, alias, authentification et état du service ; éviter les retries sans borne.
L'autorisation générale d'Omar couvre le travail demandé sur ses projets et services. Elle ne constitue pas une demande de modifier tous les services spontanément ou d'envoyer des messages à des tiers.
Valider une modification avec un contrôle local ou distant adapté et rapporter uniquement les accès réellement testés.
