# Correctifs Chromium en aval

Nos modifications de Chromium ne vivent plus comme 36 commits sur un fork
complet, mais comme un aval à la Brave au-dessus du Chromium amont épinglé
(`PATCH_BASE`, identique au pin de `bun chromium`) :

- `patches/chromium/*.patch` : un correctif par fichier amont modifié, nommé
  d'après son chemin (`chrome/browser/BUILD.gn` → `chrome-browser-BUILD.gn.patch`),
  produit avec un diff reproductible (histogram, `--full-index`, sans config Git
  globale) ;
- `patches/chromium/overlay.json` : répertoires entièrement nouveaux (M3,
  `bunmium`), épinglés par identifiant d'arbre Git dans
  `aphrody-labs/chromium`, matérialisés sans copie dans ce dépôt.

| Commande | Effet |
| --- | --- |
| `bun chromium patch check [--base <rev>] [--expect <rev>]` | applique tout sur un index temporaire de la base, sans toucher l'arbre ; liste les conflits ; `--expect` vérifie que le résultat égale une révision |
| `bun chromium patch apply` | remet les cibles modifiées à la base, applique les correctifs changés (3-way en conflit), matérialise l'overlay ; état dans `src/.git/aphrody-patches.json` |
| `bun chromium patch refresh [--to <rev>]` | réécrit les correctifs depuis `base..to` ou `base..arbre de travail`, supprime les obsolètes |
| `bun chromium patch reset` | restaure la base et retire l'overlay |

`bun chromium setup|sync` exécute `reset` avant `gclient sync` puis `apply`.

## Monter de version Chromium

1. `bun chromium patch check --base <nouveau-sha>` : liste les correctifs en conflit.
2. `bun chromium sync --revision <nouveau-sha>`, puis `bun chromium patch apply --base <nouveau-sha>` ;
   résoudre les marqueurs 3-way laissés dans les fichiers.
3. `bun chromium patch refresh --base <nouveau-sha>`, puis mettre à jour `PATCH_BASE`
   et `CHROMIUM_REVISION`.

Les correctifs CEF (`vendor/cef/patch/patch.cfg`) restent appliqués par le
patcher CEF, qui ignore un correctif déjà présent (vérification inverse).

## Choix retenus

CEF garde des correctifs groupés par fonctionnalité (`patch.cfg`) et
`patch_updater.py` les ré-enregistre après résolution manuelle. Brave garde un
correctif par fichier (`updatePatches`), réapplique seulement ceux dont le
contenu ou la cible a changé (`gitPatcher`), et réduit les correctifs par des
surcharges `chromium_src` (redirection d'inclusion et de compilation) et des
substitutions regex Plaster (`rewrite/*.yaml`). Nous reprenons le format et
l'application incrémentale de Brave ; `chromium_src` et Plaster restent à
introduire pour remplacer les gros correctifs (`chrome/browser/BUILD.gn`, DEPS).
