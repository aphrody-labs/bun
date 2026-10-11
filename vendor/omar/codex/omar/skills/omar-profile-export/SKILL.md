---
name: omar-profile-export
description: "Inventorier et exporter les profils et données personnelles d'Omar vers une destination qu'il a demandée, y compris les données locales et les comptes web accessibles."
---

## Inventaire et périmètre

Quand Omar demande un export, dresser d'abord un inventaire par source et catégorie : profil applicatif, fichiers de travail, préférences et données exportables des comptes web demandés. Identifier la destination précise (par exemple un répertoire d'Omar Server ou un hôte accessible par un alias SSH existant) et vérifier qu'elle existe, appartient à Omar et dispose de l'espace requis. Utiliser les connecteurs déjà disponibles et les droits réels ; la présence d'un compte ou d'un connecteur ne prouve ni accès ni périmètre OAuth.

Préparer un manifeste indiquant les sources, les catégories incluses, les exclusions, la destination et le résultat de chaque copie. Préserver l'arborescence utile, les métadonnées raisonnablement transportables et les données existantes. Éviter de copier sans tri tout le profil Windows, les caches ou dossiers temporaires. Si la demande couvre un compte web, exporter les données auxquelles l'accès authentifié disponible donne effectivement droit ; préciser les catégories manquantes quand un export officiel, un scope OAuth ou un accès n'est pas disponible.

## Confidentialité

Exclure les clés privées, mots de passe, jetons, fichiers `.env`, cookies et sessions navigateur, secrets de cloud/CLI, et données d'authentification. Garder les secrets dans leurs magasins locaux prévus ; ne pas les écrire dans l'archive, le manifeste, les logs, le dépôt ou le plugin. Les préférences et configurations peuvent être exportées en retirant les valeurs secrètes.

## Transfert et vérification

L'autorisation explicite d'Omar de sauvegarder ses données vers sa destination s'applique au transfert demandé : ne pas ajouter une étape d'approbation générique. Si la destination, le compte propriétaire ou la portée demandée reste ambiguë, réaliser l'inventaire local non destructif et résoudre cette ambiguïté avant le transfert. Ne jamais publier les données sur une destination publique ou tierce non demandée.

Copier uniquement les catégories retenues, puis vérifier sur la destination les fichiers, tailles et sommes de contrôle disponibles. Garder le manifeste de transfert à côté de la sauvegarde seulement s'il ne révèle aucune donnée sensible. Ne supprimer ni déplacer les originaux dans le cadre d'un export ; rapporter les catégories copiées et les limites d'accès sans révéler de secrets.
