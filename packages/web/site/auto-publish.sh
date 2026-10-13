#!/usr/bin/env bash
# Republication automatique de aphrody.app (timer systemd --user aphrody-site-publish sur le VPS).
# Fetch seul du checkout (le worktree n'est jamais touché), scripts du site pris dans origin/main,
# puis sync.ts : docs, graphe SQLite/Neon et homepage partagent origin/main.
# Les reçus mesurés et la capture publique sont référencés dans bun-site-sync.json.
# Installé en ~/.local/bin/aphrody-site-publish ; unités dans packages/web/site/systemd/.
set -euo pipefail

# Checkout unique du dépôt sur l'hôte (disposition ~/src/<dépôt>, tools/config/host/host-policy.toml d'aphrody).
checkout=${APHRODY_SITE_CHECKOUT:-$HOME/src/bun}
git -C "$checkout" rev-parse --git-dir >/dev/null
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/aphrody-site-publish.lock"
flock -n 9 || { echo "publication déjà en cours"; exit 0; }

git -C "$checkout" fetch -q origin refs/heads/main:refs/remotes/origin/main
site_source=$(git -C "$checkout" rev-parse 'origin/main^{commit}')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$checkout" archive "$site_source" packages/web/site packages/web/cloudflare packages/bun-cloudflare packages/bun-agent-plugin packages/bun-types scripts/aphrody src/agent_tools src/codegen/generate-agent-tools.ts .claude/skills package.json | tar -x -C "$work"
[ -d "$checkout/node_modules" ] || { echo "dépendances Bun du site absentes" >&2; exit 1; }
ln -s "$checkout/node_modules" "$work/node_modules"
GH_TOKEN=${GH_TOKEN:-$(gh auth token)}
export GH_TOKEN
bun "$work/packages/web/site/sync.ts" "$@" --source "$site_source"
