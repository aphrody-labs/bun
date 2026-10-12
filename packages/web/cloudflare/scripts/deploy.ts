// Deploys aphrody.app: the Aphrody Bun site as static assets plus the API Worker, then D1 migrations.
//
//   bun packages/web/cloudflare/scripts/deploy.ts [--assets <built site>] [wrangler deploy flags]
//
// Without --assets the site is built from packages/web/site into packages/web/cloudflare/dist/site.
// Credentials: app/.env when present, else the host key store ~/.aphrody/config/cloudflare.env
// (APHRODY_CLOUDFLARE_ENV overrides); only the Worker's required secrets are uploaded.
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { wrangler } from "../../../bun-cloudflare/src/wrangler.ts";

export const ORIGIN = "https://aphrody.app";
const app = join(import.meta.dir, "..");
const repo = join(app, "..", "..", "..");

export function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map(line => line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(m => m !== null)
      .map(m => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]),
  );
}

export function envFile(): string {
  const local = join(app, ".env");
  if (existsSync(local)) return local;
  return process.env.APHRODY_CLOUDFLARE_ENV ?? join(homedir(), ".aphrody", "config", "cloudflare.env");
}

// Static asset headers: installers never cached, /assets 1 h, pages 5 min.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.aphrody.com",
  "font-src 'self' https://cdn.aphrody.com",
  "img-src 'self' https: data:",
  "media-src 'self' https:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' https://api.github.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const installers = ["/install", "/install.sh", "/install.ps1", "/bun/setup.sh", "/bun/setup.ps1"];

export const headersFile = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Cache-Control: public, max-age=300

/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=3600

/404.html
  ! Cache-Control
  Cache-Control: no-cache

/publish.json
  ! Cache-Control
  Cache-Control: no-cache
${installers.map(path => `\n${path}\n  ! Content-Type\n  ! Cache-Control\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: no-cache\n`).join("")}`;

/** Cloudflare compresses at the edge: the precompressed .gz twins of build.ts stay out. */
export const assetsIgnore = ["*.gz", "**/*.gz", "_headers", ".assetsignore", ""].join("\n");

export async function prepareAssets(dir: string) {
  if (!existsSync(join(dir, "index.html"))) throw new Error(`${dir} is not a built site (index.html missing)`);
  await Bun.write(join(dir, "_headers"), headersFile);
  await Bun.write(join(dir, ".assetsignore"), assetsIgnore);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--assets");
  let assets = join(app, "dist", "site");
  if (at >= 0) {
    assets = resolve(args[at + 1]);
    args.splice(at, 2);
  } else {
    await rm(assets, { recursive: true, force: true });
    const build = Bun.spawn({
      cmd: [
        process.execPath,
        join(repo, "packages/web/site/build.ts"),
        "--src",
        repo,
        "--out",
        assets,
        "--origin",
        ORIGIN,
      ],
      cwd: repo,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if ((await build.exited) !== 0) throw new Error("site build failed");
  }
  await prepareAssets(assets);

  const env: Record<string, string> = {
    ...parseEnv(await Bun.file(envFile()).text()),
    WRANGLER_SEND_METRICS: "false",
  };
  const config = Bun.JSONC.parse(await Bun.file(join(app, "wrangler.jsonc")).text()) as {
    secrets?: { required?: string[] };
  };
  const secrets = Object.fromEntries((config.secrets?.required ?? []).map(name => [name, env[name]]));
  const missing = Object.keys(secrets).filter(name => !secrets[name]);
  if (missing.length) throw new Error(`${envFile()} is missing ${missing.join(", ")}`);

  const secretsFile = join(tmpdir(), `aphrody-app-secrets-${crypto.randomUUID()}.json`);
  await Bun.write(secretsFile, JSON.stringify(secrets));
  const run = async (wranglerArgs: string[]) => {
    const code = await wrangler(wranglerArgs, { cwd: app, env }).exited;
    if (code !== 0) throw new Error(`wrangler ${wranglerArgs[0]} exited with ${code}`);
  };
  try {
    await run(["deploy", "--assets", assets, "--secrets-file", secretsFile, ...args]);
    if (!args.includes("--dry-run")) await run(["d1", "migrations", "apply", "aphrody-app", "--remote"]);
  } finally {
    await rm(secretsFile, { force: true });
  }
}

if (import.meta.main) await main();
