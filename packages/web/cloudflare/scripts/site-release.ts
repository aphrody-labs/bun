import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { wrangler } from "../../../bun-cloudflare/src/wrangler";
import { envFile, parseEnv, prepareAssets } from "./deploy";

export async function readProtected(path: string) {
  if (!isAbsolute(path)) throw new TypeError("Protected reference must be absolute");
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > 8192)
    throw new TypeError("Invalid protected reference");
  return (await Bun.file(path).text()).trim();
}

export async function releaseSite(options: {
  assets: string;
  output: string;
  dryRun?: boolean;
  connectionFile: string;
  credentialFile: string;
}) {
  const app = resolve(import.meta.dir, "..");
  const site = await Bun.file(join(options.assets, "site.json")).json();
  if (!/^[a-f0-9]{40}$/.test(site.commit)) throw new Error("Expected a source-pinned site build");
  const home = Bun.file(join(options.assets, "index.html"));
  if (home.size < 1) throw new Error("Expected a generated homepage");
  const homepageSHA256 = new Bun.CryptoHasher("sha256").update(await home.bytes()).digest("hex");
  await prepareAssets(options.assets);
  const env: Record<string, string> = { ...parseEnv(await Bun.file(envFile()).text()), WRANGLER_SEND_METRICS: "false" };
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) throw new Error("Cloudflare credentials unavailable");
  const secrets = {
    NEON_DATABASE_URL: await readProtected(options.connectionFile),
    TYPESAFE_API_KEY: await readProtected(options.credentialFile),
  };
  const url = new URL(secrets.NEON_DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.username) !== "bun_site_http" ||
    url.pathname !== "/bun_site" ||
    !url.hostname.endsWith(".neon.tech")
  )
    throw new Error("Expected the qualified public read-only Neon role");
  const logs: string[] = [];
  const run = async (args: string[], input?: string) => {
    const child = wrangler(args, { cwd: app, env, stdio: "pipe", input });
    if (!child.stdout || !child.stderr) throw new Error("Site release requires captured Wrangler diagnostics");
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    let log = stdout + "\n" + stderr;
    for (const value of [
      ...Object.values(secrets),
      ...Object.entries(env)
        .filter(([name]) => /TOKEN|KEY|SECRET|PASSWORD/.test(name))
        .map(([, value]) => value),
    ])
      if (value.length >= 8) log = log.replaceAll(value, "[redacted]");
    logs.push(log);
    await Bun.write(options.output + ".log", logs.join("\n"));
    if (code !== 0) throw new Error("Site release command failed; inspect the sanitized local log");
  };
  if (!options.dryRun) await run(["secret", "bulk"], JSON.stringify(secrets));
  await run([
    "deploy",
    "--assets",
    resolve(options.assets),
    "--keep-vars",
    "--message",
    `Aphrody Bun ${site.commit}`,
    ...(options.dryRun ? ["--dry-run", "--outdir", options.output + "-worker"] : []),
  ]);
  const receipt = {
    schema: 1,
    date: new Date().toISOString(),
    source: site.commit,
    homepageSHA256,
    dryRun: !!options.dryRun,
    secretsViaStdin: !options.dryRun,
    existingApplicationSecretPreserved: true,
    databaseRole: "bun_site_http",
    qualified: true,
  };
  await Bun.write(options.output + ".json", JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      assets: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean" },
      "database-url-file": { type: "string" },
      "api-key-file": { type: "string" },
    },
  });
  if (!values.assets || !values.out) throw new Error("Expected --assets and --out");
  try {
    console.log(
      JSON.stringify(
        await releaseSite({
          assets: resolve(values.assets),
          output: resolve(values.out),
          dryRun: values["dry-run"],
          connectionFile:
            values["database-url-file"] ?? join(homedir(), ".aphrody", "config", "bun-site-neon-http.url"),
          credentialFile: values["api-key-file"] ?? join(homedir(), ".aphrody", "private", "typesafe.api-key"),
        }),
      ),
    );
  } catch {
    console.error("Site release failed; no credential values are included in this diagnostic");
    process.exitCode = 1;
  }
}
