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

site_remote=${APHRODY_SITE_SOURCE_REMOTE:-origin}
[[ "$site_remote" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ ]] || { echo "remote source invalide" >&2; exit 1; }
git -C "$checkout" fetch -q "$site_remote" "refs/heads/main:refs/remotes/$site_remote/main"
site_source=$(git -C "$checkout" rev-parse "refs/remotes/$site_remote/main^{commit}")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$checkout" archive "$site_source" packages/web/site packages/web/cloudflare packages/web/src/domains.ts packages/bun-cloudflare packages/bun-sql packages/bun-agent-plugin packages/bun-types scripts/aphrody src/agent_tools src/js/bun/graphx.ts src/js/bun/graph-index.ts src/codegen/generate-agent-tools.ts .claude/skills package.json bun.lock | tar -x -C "$work"
bun "$work/packages/web/site/jit-source.ts" "$checkout" "$site_source" "$work"
timeout 300 bun install --cwd "$work" --filter @aphrody/web --production --frozen-lockfile --ignore-scripts --no-progress --network-concurrency=4
[ -d "$checkout/packages/bun-cloudflare/node_modules" ] || { echo "dépendances Cloudflare du propriétaire absentes" >&2; exit 1; }
cmp "$checkout/packages/bun-cloudflare/bun.lock" "$work/packages/bun-cloudflare/bun.lock" || { echo "lock Cloudflare propriétaire différent" >&2; exit 1; }
ln -s "$checkout/packages/bun-cloudflare/node_modules" "$work/packages/bun-cloudflare/node_modules"
bun "$work/packages/web/site/jit-source.ts" "$checkout" "$site_source" "$work" --verify-cloudflare
GH_TOKEN=${GH_TOKEN:-$(gh auth token)}
export GH_TOKEN
bun "$work/packages/web/site/sync.ts" "$@" --source "$site_source"
