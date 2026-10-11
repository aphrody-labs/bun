# Compte dédié Bun Google

Ce runbook sépare réception des messages, identité Google utilisateur et
automatisation Google Cloud. L'adresse demandée est `bun-google@aphrody.com`.
Les observations datent du **11 octobre 2026** et doivent être relues avant
application. Elles ne prouvent ni création de compte Gmail ni accès global Google.

## État vérifié

| Surface             | Observation                                                                         | Dépendance restante                                                               |
| ------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| OVH `aphrody.com`   | Domaine `ok`, offre `redirect`, listes de boîtes et redirections vides              | Boîte réceptrice exacte contrôlée par le propriétaire                             |
| Workspace Directory | Lectures domaine et utilisateur : HTTP 403, `insufficientPermissions`               | Administrateur qualifié, tenant, domaine vérifié, existence utilisateur, licences |
| Gmail               | API désactivée au relevé initial ; aucune requête Gmail exécutée                    | Identité, activation et scopes adaptés ; aucun succès ni 403 Gmail observé        |
| Google Cloud        | Compte de service dédié créé ; impersonation et permissions IAM testées sur Windows | Aucun déploiement VPS ni appel de modèle qualifié                                 |
| Antigravity Windows | Présence d'une entrée protégée observée ; identité non qualifiée                    | Qualification OAuth propre au service demandé                                     |

Les reçus privés `.coord/google-dedicated-account-plan.json` et
`.coord/google-cloud-automation-principal-plan.json` décrivent les lectures et le
plan initial. Le reçu terminal `.coord/google-cloud-automation-apply-receipt.json`
qualifie ensuite Google Cloud uniquement ; le gate de configuration est dans
`.coord/google-cloud-automation-configuration-gate.json`. Ne pas publier de
reçus avec des identités privées. Aucune destination OVH n'est vérifiée : ne pas
déduire `contact@aphrody.com` de l'identité de commit. Aucun utilisateur Workspace
ou Gmail n'a été créé.

## Trois identités distinctes

La redirection OVH transmet vers une boîte existante. L'offre `redirect` ne
fournit pas de boîte SMTP/IMAP consultable. Les listes interrogées ne prouvent
pas l'absence de boîtes chez un autre fournisseur. Voir le
[contrat OVH des redirections](https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/common-email-features/feature-redirections).

Un compte Google peut utiliser une adresse tierce après vérification de sa
réception, sans création automatique de boîte Gmail. Un utilisateur Workspace
dépend du tenant, de ses règles et licences. Voir la
[création avec une adresse existante](https://support.google.com/accounts/answer/27441?hl=fr).

Le compte de service `bun-google-automation` a été créé dans le projet Google
Cloud existant. Cette identité est distincte de l'utilisateur et d'une boîte Gmail. L'impersonation produit
des jetons courts depuis un principal autorisé sans exporter de clé. Voir le
[contrat Google d'impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation).

## Réception OVH : lecture, plan, application et rollback

Le propriétaire est `@aphrody/ovh`, source Aphrody
`packages/infra/ovh/src/email.ts`. La CLI native `aphrody ovh email` expose les
lectures `domain`, `redirections` et `audit`, pas la création de boîte. Le SDK
possède les opérations de redirection avec application explicite.

1. Relire `aphrody ovh email --help`, le domaine et les redirections avec
   `--profile aphrody.com`. Lire aussi les comptes via le propriétaire SDK.
   Conserver un inventaire privé avant application, sans valeurs OAuth.
2. Faire confirmer la boîte réceptrice exacte et son contrôle. Vérifier l'absence
   de collision pour `bun-google@aphrody.com` et de boucle de transfert. Aucun
   alias ne doit être créé vers une destination supposée.
3. Utiliser `new AphrodyOvh("aphrody.com").email.createRedirection(domain, from,
   verifiedRecipient, false)` pour le plan. Sans `{ apply: true }`, la méthode
   renvoie seulement `{ planned: true }` : elle ne valide ni permissions serveur
   ni livraison. `from` est l'adresse complète `bun-google@aphrody.com`.
4. Après revue du plan exact, appeler la même méthode avec `{ apply: true }`.
   `localCopy: false` ne demande pas de copie locale. Conserver l'identifiant
   retourné puis relire et comparer les champs exacts. Les lectures IAM ne
   prouvent pas que l'écriture aboutira.
5. Qualifier la réception réelle lors de la vérification Google avec le
   propriétaire. La redirection seule ne prouve pas la livraison. Aucun envoi
   de test n'est autorisé par ce lot documentaire.
6. Pour retirer la redirection, planifier `deleteRedirection(domain, newId)` puis
   appliquer avec `{ apply: true }` sur **le seul identifiant créé par ce lot**.
   Relire et comparer l'inventaire initial ; préserver tous les autres alias.

Ne pas modifier les MX ni acheter une offre pour ce plan. Une vraie boîte OVH
nécessite un propriétaire de provisionnement et une offre qualifiés. Aucun
wrapper `createAccount` ni capacité AphrodyMail de création de boîte n'a été
trouvé dans cette inspection. `aphrody mail --help` a échoué sur le routage A2A
local ; cet échec n'est pas une API de provisionnement. Les adaptateurs Gmail
de lecture existants ne créent pas de boîtes non plus.

## Identité utilisateur et Workspace

Un administrateur qualifié doit lire domaine, éventuel utilisateur existant,
unité organisationnelle et licences disponibles avant création. Les 403 actuels
empêchent de conclure que le compte n'existe pas. Ne pas réinitialiser un compte
existant pour contourner le refus. Les
[scopes Directory](https://developers.google.com/workspace/admin/directory/v1/guides/authorizing)
et [scopes Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
sont séparés des rôles IAM Google Cloud.

Si tenant et licence déjà autorisée sont qualifiés, le propriétaire Admin SDK
peut provisionner l'utilisateur avec son secret uniquement dans le store protégé
existant. Sinon, étudier une identité Google à adresse tierce après qualification
de réception. Aucun achat Workspace, ajout de licence, changement DNS ou
contournement de challenge n'est inclus. Cloud Identity sans Gmail ne doit pas
être présenté comme une boîte Gmail. La délégation à l'échelle du domaine exige
autorisation administrateur et scopes explicites ; IAM ne les remplace pas.

## Automatisation keyless et SDK

Le plan IAM autorisé vise le projet existant et les rôles
`roles/serviceusage.serviceUsageConsumer` et `roles/aiplatform.user` pour la
nouvelle identité. `roles/iam.serviceAccountTokenCreator` est limité à cette
nouvelle ressource et au principal appelant déjà autorisé. Qualifier grants,
état des API et jeton court séparément ; aucune inférence facturable comme test.
Ne pas exporter de clé ni élargir aux rôles owner/editor, secrets ou stockage.

Le reçu terminal qualifie ces deux bindings projet et le binding Token Creator
sur la seule nouvelle identité. Le jeton de 600 secondes obtenu en mémoire a
passé HTTP 200 pour `aiplatform.endpoints.predict`, `aiplatform.locations.get`,
`resourcemanager.projects.get` et `serviceusage.services.use`. Les permissions
`resourcemanager.projects.setIamPolicy` et `iam.serviceAccounts.create` n'ont pas
été accordées à ce jeton. Ce test de permissions n'est pas une inférence Vertex.

Conserver les configurations gcloud existantes, notamment active et default.
Employer les paramètres par commande `--project` et
`--impersonate-service-account`, ou une nouvelle configuration dédiée créée avec
`--no-activate` et sélectionnée par `--configuration`. Les paramètres de cette
nouvelle configuration peuvent être définis explicitement sans activer ni modifier
les configurations existantes. Aucun nouveau login ou remplacement ADC implicite.
Le jeton reste en mémoire et n'est
jamais imprimé. Le rollback retire seulement les bindings ajoutés, après
comparaison des politiques et etags. Vérifier l'absence de consommateurs avant
suppression du compte dédié. Ne pas restaurer une politique globale ancienne
au détriment d'un changement concurrent.

La configuration `aphrody-bun-google-automation` a été qualifiée sur Windows :
elle reste inactive et la configuration default est inchangée. Sa durée de jeton
par défaut est de 3600 secondes. L'option `--lifetime=600s` requiert également un
`--impersonate-service-account` explicite ; la CLI refuse cette durée avec la seule
sélection de configuration. Aucun refresh credential humain n'a été transporté
vers le VPS, qui reste non qualifié pour ce principal. Aucun store Antigravity,
cookie ou paramètre search n'a été modifié, et aucune clé statique n'a été créée.
Le reçu `.coord/google-cloud-automation-keyless-gate.json` confirme une liste de
clés avec zéro clé `USER_MANAGED`, sans lecture de matériau de credential.

Exemple Windows de capture privée dans le fournisseur explicite, avec le gcloud
déjà qualifié sur PATH. Cette commande utilise la durée par défaut de 3600 secondes.
Elle ne doit pas être lancée avec stdout hérité ou journalisation du jeton :

```ts
async function credentialProvider(): Promise<string> {
  const child = Bun.spawn(
    ["gcloud", "--configuration=aphrody-bun-google-automation", "auth", "print-access-token"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [output, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const token = output.trim();
  if (code !== 0 || !token) throw new Error("Google Cloud credential unavailable");
  return token;
}
```

Le SDK reçoit ce fournisseur via ses options ; aucun token dans les arguments,
logs ou fichiers. Le subprocess est le propriétaire d'authentification gcloud,
pas une nouvelle implémentation native Bun de l'impersonation. Le test IAM précité
qualifie la commande ; l'application consommatrice doit qualifier ses appels et
sa cancellation. Cet exemple ne doit pas alimenter les services Antigravity ou
Gmail avec un token Cloud IAM.

Le 11 octobre 2026, la capture `Bun.spawn` de cet exemple a passé sur Windows avec
le runtime existant `1.4.3-aphrody.4` : exit 0, jeton présent, jamais imprimé ;
ce résultat ne qualifie ni endpoint produit, ni inférence, ni cancellation.

Le SDK [services.ts](../../packages/bun-google/src/services.ts) reçoit un
`credentialProvider` explicite ; il ne découvre pas ADC ou gcloud. Le propriétaire
fournit un jeton adapté à l'endpoint et au scope. Un jeton Cloud IAM ne qualifie
ni Gmail utilisateur ni Antigravity Cloud Code.

La [lecture Windows exacte](../../packages/bun-google/src/credentials.ts) du store
Antigravity est read-only : cible explicite, expiration validée, erreurs expurgées.
Elle retourne une chaîne JS, pas un jeton opaque. Refresh et écritures restent
chez le propriétaire desktop. Le [CLI SDK](../../packages/bun-google/src/cli.ts)
conserve le propriétaire PKCE interactif existant ; aucune nouvelle implémentation
fidèle du login n'est déclarée ici. Le
[search public](../../packages/bun-google/src/search.ts) reste anonyme : aucun
jeton de ce plan, cookie de compte ou profil navigateur n'y est injecté.

## Reçu de qualification

Conserver dans le reçu privé date, propriétaire, ressources exactes, état initial,
opérations, métadonnées IAM/OVH, résultats HTTP et rollback disponible. Masquer
les identités existantes dans la synthèse publique ; exclure tokens, mots de passe,
contenus de mail et cookies. Qualifier séparément réception, identité Google,
Directory, Gmail, API produit et déploiement. Annoncer chaque gate manquant.
Voir la [frontière de publication](google-browser-publication.md) et le
[catalogue SDK](../../packages/bun-google/README.md).
