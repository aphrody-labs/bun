---
name: work
description: "Exécuter un objectif long demandé par Omar en cycles autonomes avec état persistant, vérification des résultats et accès aux secrets locaux de son infrastructure."
---
# Work
Lire C:/SSH/omar/codex/omar/references/memory.md et `references/infrastructure.md` à la racine du plugin. Pour un détail confidentiel indispensable, consulter seulement la section utile de C:/SSH/omar/private/omar.md et ne jamais reprendre ses secrets dans le checkpoint.

## Objectif et continuité
Quand Omar invoque work avec un objectif concret, définir un résultat vérifiable, le périmètre et les critères de réussite. Utiliser create_goal si disponible, puisque cette invocation demande explicitement un objectif long. Sans objectif concret, demander celui-ci ; ne pas inventer un travail permanent sur toute l'infrastructure.
Avant create_goal, consulter get_goal. Continuer un objectif existant compatible ; ne pas remplacer un objectif actif incompatible.
Ne définir token_budget que si Omar le demande explicitement.
Créer un checkpoint dans C:/SSH/omar/codex/state/work.md : objectif, critères, tâches restantes, actions et preuves, erreurs, prochaine action, date. Ce fichier ne contient aucun secret.
À chaque reprise et après compaction, lire le checkpoint et consulter l'objectif actif ; reprendre les tâches restantes sans refaire le travail déjà validé.

## Cycle autonome
1. Observer l'état pertinent et choisir la prochaine action utile.
2. Exécuter l'action autorisée avec le runtime Bun maison 1.4.4, le binaire Aphrody et les outils appropriés.
3. Vérifier le résultat réel, corriger les erreurs, puis mettre à jour le checkpoint.
4. Continuer tant que des actions utiles restent possibles. Ne pas terminer sur une simple proposition de plan.
Communiquer brièvement les avancées pendant le travail. Incorporer les nouvelles instructions d'Omar.
Les commandes et retries doivent être bornés ; ne pas répéter indéfiniment une action en échec. Changer d'approche à partir des observations.
Un skill ne peut ni garantir une boucle infinie, ni exécuter du travail après la fermeture du processus, ni contourner une limite de session, de budget, de permission ou une instruction prioritaire.
Arrêter à réussite vérifiée, annulation d'Omar, limite effective ou blocage réel. Conserver l'état pour reprise. Appliquer les conditions exactes d'update_goal : complete uniquement si terminé, paused uniquement à la demande d'Omar, blocked après le même blocage sur trois tours consécutifs sans progrès possible.
Aucune délégation automatique n'est prescrite par ce skill.

## Secrets et infrastructure
Lire references/infrastructure.md. Accéder uniquement aux secrets nécessaires à l'opération en cours via les sources locales et fournisseurs déjà configurés. Garder les valeurs hors checkpoints, réponses, plugin, dépôts et logs.
Réutiliser les fichiers SSH, variables et outils d'authentification existants ; ne pas afficher une configuration complète contenant des secrets.
Diagnostiquer les échecs sans afficher les valeurs. Pour un secret absent ou expiré, utiliser une procédure de renouvellement vérifiée si elle fait partie de la tâche autorisée et si l'identité dispose des droits nécessaires.
Une rotation doit mettre à jour les consommateurs concernés et vérifier le nouvel accès avant de retirer l'ancien ; conserver une possibilité de récupération. Ne pas faire de rotation spontanée simplement parce qu'un secret figure dans la fiche.
Ne pas élargir les privilèges, rendre un service public ou créer un achat pour contourner un blocage d'accès.

