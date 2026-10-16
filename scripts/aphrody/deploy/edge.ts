import Nginx from "bun:nginx";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EdgeRoot {
  /** Public name, matched by `server_name`. */
  host: string;
  /** Directory served read-only. */
  root: string;
  /** Cache-Control for static hits. */
  cacheControl?: string;
}

export interface EdgeConfig {
  prefix: string;
  listen?: string;
  roots: EdgeRoot[];
  /** Dynamic origin (Axum or the Shenron CDN origin) for everything the static roots do not hold. */
  upstream?: string;
}

const IMAGES = "jpg|jpeg|png|webp|avif|gif";

export function edgeConfig(c: EdgeConfig): string {
  const listen = c.listen ?? "127.0.0.1:8080";
  const servers = c.roots.map(r => {
    const cache = r.cacheControl ?? "public, max-age=86400, stale-while-revalidate=604800";
    const fallback = c.upstream ? "@origin" : "=404";
    return `    server {
        listen ${listen};
        server_name ${r.host};
        root ${r.root};
        autoindex off;
        disable_symlinks on;
        add_header X-Content-Type-Options nosniff always;
        add_header Access-Control-Allow-Origin "*" always;
        location ~ ^/_next/static/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri ${fallback}; }
        location ~* \.(?:${IMAGES}|js|css|woff2?|ttf|json|txt|zip|gz|tar|wasm)$ { limit_except GET HEAD { deny all; } add_header Cache-Control "${cache}"; try_files $uri ${fallback}; }
        location / { limit_except GET HEAD { deny all; } try_files $uri $uri/index.html ${fallback}; }
${c.upstream ? "        location @origin { proxy_pass http://edge_origin; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Connection \"\"; proxy_cache edge; proxy_cache_valid 200 10m; proxy_cache_use_stale error timeout updating; proxy_cache_lock on; }\n" : ""}    }`;
  });
  return `worker_processes auto;
worker_rlimit_nofile 65536;
error_log logs/error.log warn;
events { worker_connections 8192; multi_accept on; }
http {
    include /etc/nginx/mime.types;
    access_log off;
    sendfile on; tcp_nopush on; tcp_nodelay on; aio threads;
    keepalive_timeout 30s; server_tokens off;
    gzip on; gzip_comp_level 5; gzip_types text/css application/javascript application/json image/svg+xml text/plain;
    open_file_cache max=50000 inactive=60s; open_file_cache_valid 120s; open_file_cache_errors on;
    client_body_temp_path temp/body; proxy_temp_path temp/proxy; fastcgi_temp_path temp/fcgi; uwsgi_temp_path temp/uwsgi; scgi_temp_path temp/scgi;
${c.upstream ? `    proxy_cache_path cache/edge levels=1:2 keys_zone=edge:64m max_size=20g inactive=7d use_temp_path=off;\n    upstream edge_origin { server ${c.upstream}; keepalive 64; }\n` : ""}${servers.join("\n")}
}
`;
}

export async function startEdge(c: EdgeConfig, binary = "/usr/sbin/nginx") {
  for (const d of ["logs", "temp", "cache"]) mkdirSync(join(c.prefix, d), { recursive: true });
  writeFileSync(join(c.prefix, "nginx.conf"), edgeConfig(c));
  const nginx = await Nginx.create({ binary, prefix: c.prefix, configFile: "nginx.conf", timeoutMs: 15_000 });
  await nginx.validate();
  await nginx.start();
  return nginx;
}
