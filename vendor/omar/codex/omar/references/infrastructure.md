# Intégrations et secrets
Le plugin Omar compose des workflows avec les plugins déjà installés ; il ne lance pas un second kernel MCP.

- Aphrody : aphrody@aphrody-user, kernel MCP existant. Consulter les skills Aphrody pertinents et son catalogue de source avant d'inventer une commande.
- Bun : bun@omar-local, runtime maison 1.4.4 ; les outils MCP bun_docs_list, bun_docs_read, bun_docs_search et bun_node_equivalent sont fournis par le kernel Aphrody.
- Docker : binaire local détecté ; consulter le contexte actif avant de viser un daemon.
- OVH : fournisseur déclaré ; aucune authentification API OVH vérifiée durant la configuration du plugin.
- Cloudflare : plugin connecté disponible ; choisir le skill correspondant à l'opération et vérifier le compte et la ressource cible.
- GitHub : plugin installé ; organisation déclarée aphrody-labs, identité déclarée KyrioFox. Vérifier les droits réels sur le dépôt.
- Secrets : fiche canonique C:/SSH/omar/private/omar.md, fichiers C:/Users/omara/.ssh et configuration locale Aphrody. C:/SSH/omar.md est un lien de compatibilité. Conserver les valeurs dans leurs magasins locaux, pas dans le plugin.
Les outils MCP disponibles dépendent du build et de la session : utiliser les outils réellement annoncés. Ne pas déclarer un accès fournisseur vérifié uniquement parce qu'un plugin existe.
