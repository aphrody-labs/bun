#!/usr/bin/env bash
set -euo pipefail
mode=${1:?--plan or --apply}
artifact=${2:?artifact directory}
site=${3:?existing site base}
nginx_config=${4:?existing site nginx configuration}
artifact=$(realpath "$artifact")
site=$(realpath "$site")
nginx_config=$(realpath "$nginx_config")
state=${XDG_DATA_HOME:-$HOME/.local/share}/bun-release
bun_bin=$(command -v bun)
test -f "$artifact/manifest.json"
test -f "$artifact/monorepo.sqlite"
test -d "$artifact/site"
test -d "$site/releases"
test -f "$nginx_config"
source_sha=$("$bun_bin" -e 'console.log(JSON.parse(await Bun.file(process.argv[1]).text()).source)' "$artifact/manifest.json")
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]]
release="graph-${source_sha}"
printf 'Plan: artifact=%s source=%s site=%s release=%s nginx=%s cache=loopback:6388 server=loopback:8798\n' "$artifact" "$source_sha" "$site" "$release" "$nginx_config"
docker compose -p bun-release-cache -f "$state/cache/compose.yaml" config --quiet
sudo -n nginx -t
if [[ "$mode" == --plan ]]; then exit 0; fi
[[ "$mode" == --apply ]]
"$bun_bin" "$artifact/runtime/release-verify.ts" "$artifact"
previous=$(readlink "$site/current")
printf '%s\n' "$previous" > "$state/previous-site.txt"
mkdir -p "$HOME/.config/systemd/user"
ln -sfn "$artifact" "$state/current"
cat > "$HOME/.config/systemd/user/bun-release-surfaces.service" <<EOF
[Unit]
Description=Bun immutable release graph, docs and plugin cache
[Service]
ExecStart=$bun_bin $state/current/runtime/release-server.ts $state/current
Environment=BUN_RELEASE_REDIS_URL=redis://127.0.0.1:6388
Environment=BUN_RELEASE_PORT=8798
Restart=on-failure
RestartSec=3
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now bun-release-surfaces.service
systemctl --user restart bun-release-surfaces.service
curl --retry 10 --retry-connrefused --retry-delay 1 --fail --silent http://127.0.0.1:8798/graph/api/status
sudo -n mkdir -p "$site/releases/$release"
sudo -n cp -a "$artifact/site/." "$site/releases/$release/"
sudo -n ln -sfn "releases/$release" "$site/.release-current"
sudo -n mv -Tf "$site/.release-current" "$site/current"
backup="$nginx_config.bun-release-backup-$(date -u +%Y%m%dT%H%M%SZ)"
sudo -n cp -a "$nginx_config" "$backup"
"$bun_bin" "$artifact/runtime/release-nginx.ts" "$nginx_config" "$state/nginx-planned.conf"
sudo -n cp "$state/nginx-planned.conf" "$nginx_config"
if ! sudo -n nginx -t; then
  sudo -n cp "$backup" "$nginx_config"
  sudo -n ln -sfn "$previous" "$site/current"
  exit 1
fi
sudo -n systemctl reload nginx
printf '\nApplied source=%s; previous site=%s; nginx backup=%s\n' "$source_sha" "$previous" "$backup"
