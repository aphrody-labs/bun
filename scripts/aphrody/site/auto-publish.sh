#!/usr/bin/env bash
# Republication automatique d'aphrody.com (timer systemd --user aphrody-site-publish sur le VPS).
# Fetch seul du checkout (le worktree n'est jamais touché), scripts du site pris dans origin/main,
# puis publish.ts --if-changed : rien n'est fait si commit, release, run perf et données collectées (runtime,
# distribution du checkout voisin `aphrody`, organisation GitHub, downloads) n'ont pas bougé.
# Installé en ~/.local/bin/aphrody-site-publish ; unités dans scripts/aphrody/site/systemd/.
set -euo pipefail

# Checkout unique du dépôt sur l'hôte (disposition ~/src/<dépôt>, tools/config/host/host-policy.toml d'aphrody).
checkout=${APHRODY_SITE_CHECKOUT:-$HOME/src/bun}
[ -d "$checkout/.git" ] || { echo "checkout du fork introuvable : $checkout (APHRODY_SITE_CHECKOUT)" >&2; exit 1; }
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/aphrody-site-publish.lock"
flock -n 9 || { echo "publication déjà en cours"; exit 0; }

git -C "$checkout" fetch -q origin main
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$checkout" archive origin/main scripts/aphrody/site | tar -x -C "$work"
GH_TOKEN=${GH_TOKEN:-$(gh auth token)}
export GH_TOKEN
bun "$work/scripts/aphrody/site/publish.ts" --git "$checkout" --if-changed "$@"
