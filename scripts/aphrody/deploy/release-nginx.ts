import { readFileSync, writeFileSync } from "node:fs";

export function gatewayReleaseConfig(config: string): string {
  const include = "    include /etc/nginx/conf.d/*.conf;";
  const added = "    include /etc/aphrody-bun-release/bun-release.conf;";
  if (config.includes(added)) return config;
  if (config.split(include).length !== 2) throw new Error("Unexpected gateway configuration");
  return config.replace(include, `${include}\n${added}`);
}

export function releaseProxyConfig(config: string): string {
  const original = "try_files $uri $uri.html $uri/index.html =404;";
  if (config.includes("# bun-release-surfaces proxy")) return config;
  if (config.split(original).length !== 2)
    throw new Error("Expected one existing site fallback; inspect host configuration");
  const proxy =
    "proxy_pass http://127.0.0.1:8798; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_intercept_errors on; error_page 502 503 504 = @bun_release_static;";
  return config
    .replace(original, `# bun-release-surfaces proxy\n        ${proxy}`)
    .replace(
      /\n}\s*$/,
      `\n    location ^~ /docs/ { ${proxy} }\n    location ^~ /graph/ { ${proxy} }\n    location ^~ /knowledge/ { ${proxy} }\n    location ^~ /plugin/ { ${proxy} }\n    location @bun_release_static { ${original} }\n}\n`,
    );
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw new Error("Usage: bun release-nginx.ts <current-config> <planned-config>");
  writeFileSync(output, releaseProxyConfig(readFileSync(input, "utf8")));
}
