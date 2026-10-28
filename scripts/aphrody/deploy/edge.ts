import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EdgeRoot {
  /** Public name, matched by `server_name`. */
  host: string;
  /** Directory served read-only by nginx. */
  root: string;
  /** Cache-Control for static hits. */
  cacheControl?: string;
  /** TLS certificate pair; when set the block listens on `tlsListen` instead of `listen`. */
  tls?: { certificate: string; key: string };
  /** Proxy /docs/, /graph/, /knowledge/ and /plugin/ to `EdgeConfig.releaseUpstream`, static files as fallback. */
  release?: boolean;
}

export interface EdgeConfig {
  prefix: string;
  listen?: string;
  tlsListen?: string;
  roots: EdgeRoot[];
  /** bun-edge (Axum) address for everything the static roots do not hold. */
  upstream?: string;
  /** Release surfaces server (scripts/aphrody/release-server.ts). */
  releaseUpstream?: string;
  /** Where nginx reads mime types. */
  mimeTypes?: string;
}

const IMAGES = "jpg|jpeg|png|webp|avif|gif";
const PROXY =
  'proxy_pass http://edge_origin; proxy_set_header Host $host; proxy_http_version 1.1; proxy_set_header Connection ""; proxy_connect_timeout 5s; proxy_read_timeout 60s;';

export function edgeConfig(c: EdgeConfig): string {
  const listen = c.listen ?? "127.0.0.1:8080";
  const servers = c.roots.map(r => {
    const cache = r.cacheControl ?? "public, max-age=86400, stale-while-revalidate=604800";
    const fallback = c.upstream ? "@origin" : "=404";
    const listens = r.tls
      ? `        listen ${c.tlsListen ?? "443"} ssl;\n        ssl_certificate ${r.tls.certificate};\n        ssl_certificate_key ${r.tls.key};\n        ssl_protocols TLSv1.2 TLSv1.3;\n`
      : `        listen ${listen};\n`;
    const release =
      r.release && c.releaseUpstream
        ? `        location ~ ^/(?:docs|graph|knowledge|plugin)/ { proxy_pass http://edge_release; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_intercept_errors on; error_page 502 503 504 = @static; }
        location @static { try_files $uri $uri.html $uri/index.html =404; }
`
        : "";
    return `    server {
${listens}        server_name ${r.host};
        root ${r.root};
        autoindex off;
        disable_symlinks on;
        add_header X-Content-Type-Options nosniff always;
        add_header Access-Control-Allow-Origin "*" always;
${release}        location ~ ^/_next/static/ { add_header Cache-Control "public, max-age=31536000, immutable"; add_header Access-Control-Allow-Origin "*" always; try_files $uri ${fallback}; }
        location ~* \.(?:${IMAGES}|js|css|woff2?|ttf|json|txt|zip|gz|tar|wasm)$ { limit_except GET HEAD { deny all; } add_header Cache-Control "${cache}"; try_files $uri ${fallback}; }
        location / { limit_except GET HEAD { deny all; } try_files $uri $uri/index.html ${fallback}; }
${c.upstream ? `        location @origin { ${PROXY} proxy_cache edge; proxy_cache_valid 200 10m; proxy_cache_use_stale error timeout updating; proxy_cache_lock on; }\n` : ""}    }`;
  });
  return `worker_processes auto;
worker_rlimit_nofile 65536;
error_log logs/error.log warn;
events { worker_connections 8192; multi_accept on; }
http {
    include ${c.mimeTypes ?? "/etc/nginx/mime.types"};
    access_log off;
    sendfile on; tcp_nopush on; tcp_nodelay on; aio threads;
    keepalive_timeout 30s; server_tokens off;
    gzip on; gzip_comp_level 5; gzip_types text/css application/javascript application/json image/svg+xml text/plain;
    open_file_cache max=50000 inactive=60s; open_file_cache_valid 120s; open_file_cache_errors on;
    client_body_temp_path temp/body; proxy_temp_path temp/proxy; fastcgi_temp_path temp/fcgi; uwsgi_temp_path temp/uwsgi; scgi_temp_path temp/scgi;
${c.upstream ? `    proxy_cache_path cache/edge levels=1:2 keys_zone=edge:64m max_size=20g inactive=7d use_temp_path=off;\n    upstream edge_origin { server ${c.upstream}; keepalive 64; }\n` : ""}${c.releaseUpstream ? `    upstream edge_release { server ${c.releaseUpstream}; keepalive 16; }\n` : ""}${servers.join("\n")}
}
`;
}

export interface EdgeController {
  validate(): Promise<unknown>;
  start(): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface EdgeAdapter {
  create(options: { binary: string; prefix: string; configFile: string; timeoutMs: number }): Promise<EdgeController>;
}

export async function startEdge(c: EdgeConfig, binary = "/usr/sbin/nginx", adapter?: EdgeAdapter) {
  if (!adapter) throw new Error("NGINX controller adapter required; pass one explicitly or set BUN_EDGE_ADAPTER for the CLI");
  for (const d of ["logs", "temp", "cache"]) mkdirSync(join(c.prefix, d), { recursive: true });
  writeFileSync(join(c.prefix, "nginx.conf"), edgeConfig(c));
  const nginx = await adapter.create({ binary, prefix: c.prefix, configFile: "nginx.conf", timeoutMs: 15_000 });
  await nginx.validate();
  await nginx.start();
  return nginx;
}

if (import.meta.main) {
  const [file, binary] = process.argv.slice(2);
  if (!file) throw new Error("Usage: bun edge.ts <edge.json> [nginx-binary]");
  const modulePath = process.env.BUN_EDGE_ADAPTER;
  if (!modulePath) throw new Error("Set BUN_EDGE_ADAPTER to an adapter module exporting a default EdgeAdapter");
  const adapter = (await import(modulePath)).default as EdgeAdapter;
  const nginx = await startEdge(JSON.parse(readFileSync(file, "utf8")) as EdgeConfig, binary, adapter);
  const stop = () => void nginx.close().finally(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
