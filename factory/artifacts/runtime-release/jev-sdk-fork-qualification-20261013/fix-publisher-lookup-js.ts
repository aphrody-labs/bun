const path = "/home/ubuntu/src/typesafe-sdk-js/scripts/publish-npm.mjs";
await Bun.write(path, `// Publish the already-tested tarball. A retry can skip only an identical registry artifact.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const registry = "https://registry.npmjs.org/";
const files = readdirSync("release").filter((file) => file.endsWith(".tgz"));
if (files.length !== 1) throw new Error("Expected exactly one release tarball");
const tarball = \`./release/\${files[0]}\`;
const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
const integrity = \`sha512-\${createHash("sha512").update(readFileSync(tarball)).digest("base64")}\`;
const existing = await fetch(\`\${registry}\${encodeURIComponent(name)}/\${encodeURIComponent(version)}\`, {
  headers: { "cache-control": "no-cache" },
  signal: AbortSignal.timeout(30_000),
});
if (existing.status === 200) {
  const metadata = await existing.json();
  if (metadata.name !== name || metadata.version !== version || metadata.dist?.integrity !== integrity)
    throw new Error("This version is already on the npm registry with different contents");
  console.log(\`\${name}@\${version} is already published with identical contents.\`);
} else {
  if (existing.status !== 404) throw new Error(\`Registry lookup failed: HTTP \${existing.status}\`);
  const result = spawnSync(
    "bun",
    ["publish", tarball, "--access", "public", "--tag", "latest", "--ignore-scripts", \`--registry=\${registry}\`],
    { stdio: "inherit", timeout: 90_000 },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
`);
console.log("SDK_REGISTRY_LOOKUP_HTTP_GUARD_READY");
