// Mirrors a GitHub release of aphrody-labs/bun into the R2 bucket aphrody-dist, served by https://dist.aphrody.app:
// every asset named by the release's SHA256SUMS.txt is verified, then stored under bun/<tag>/ (cached a year at the
// edge, channels a minute: see provision.ts), the checksums last, their presence marking a complete mirror.
// Channels: bun/latest.json (install.sh, install.ps1) and bun/manifest.json (Windows runtime step of the Aphrody
// product setup). Mirrored tags beyond --keep are deleted.
//
//   bun scripts/aphrody/release-r2.ts [<tag>] [--keep 5] [--force] [--dry-run]
//
// Without a tag: the newest published, non-prerelease runtime release (bun-v*, aphrody-v*) carrying SHA256SUMS.txt, which also
// moves the channels. Credentials: R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID and
// AWS_SECRET_ACCESS_KEY) from the environment, else ~/.aphrody/config/cloudflare.env.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const REPO = "aphrody-labs/bun";
export const BUCKET = "aphrody-dist";
export const PUBLIC = "https://dist.aphrody.app";
export const PREFIX = "bun";
export const ALIASES = ["bun", "bunx", "node", "npm", "npx", "uv", "uvx"];

export type Asset = { name: string; sha256: string; size: number };
export type Latest = {
  tag: string;
  version: string;
  published: string;
  base: string;
  assets: Asset[];
};

/** `<sha256>  <name>` lines; names are plain file names, each listed once. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [, sha256, name] =
      line.match(/^([0-9a-fA-F]{64})\s+\*?([A-Za-z0-9][A-Za-z0-9._+-]*)$/) ?? [];
    if (!sha256 || !name)
      throw new Error(`SHA256SUMS.txt: unexpected line ${JSON.stringify(line)}`);
    if (sums.has(name)) throw new Error(`SHA256SUMS.txt: ${name} listed twice`);
    sums.set(name, sha256.toLowerCase());
  }
  return sums;
}

export const versionOf = (tag: string) => tag.replace(/^(bun-v|aphrody-v)/, "");

export function contentType(name: string): string {
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".tgz") || name.endsWith(".tar.gz")) return "application/gzip";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

/** Manifest read by packages/infra/product/src/setup/r2.ts (aphrody-labs/aphrody); null without a Windows archive. */
export function windowsManifest(latest: Latest) {
  const archive = latest.assets.find((a) => a.name === "bun-windows-x64.zip");
  if (!archive) return null;
  return {
    product: "bun",
    version: latest.version,
    platform: "windows-x64",
    path: latest.tag,
    archive: archive.name,
    binary: "bun-windows-x64/bun.exe",
    aliases: ALIASES,
    updated: latest.published,
    sha256: archive.sha256,
  };
}

/** Tags to delete: all mirrored tags but the current one and the `keep - 1` most recently uploaded others. */
export function prune(
  mirrored: { tag: string; uploaded: number }[],
  current: string,
  keep: number,
): string[] {
  return mirrored
    .filter((m) => m.tag !== current)
    .sort((a, b) => b.uploaded - a.uploaded)
    .slice(Math.max(0, keep - 1))
    .map((m) => m.tag);
}

function client(): Bun.S3Client {
  let env: Record<string, string | undefined> = process.env;
  if (!env.R2_ENDPOINT) {
    const file =
      process.env.APHRODY_CLOUDFLARE_ENV ?? join(homedir(), ".aphrody", "config", "cloudflare.env");
    const parsed: Record<string, string> = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const [, key, value = ""] =
        line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/) ?? [];
      if (key) parsed[key] = value.replace(/^(["'])(.*)\1$/, "$2");
    }
    env = { ...parsed, ...process.env };
  }
  const accessKeyId = env.R2_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;
  if (!env.R2_ENDPOINT || !accessKeyId || !secretAccessKey)
    throw new Error("R2_ENDPOINT and R2 access keys are required");
  return new Bun.S3Client({
    endpoint: env.R2_ENDPOINT,
    accessKeyId,
    secretAccessKey,
    bucket: BUCKET,
  });
}

function gh(args: string[]): string {
  const r = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (!r.success)
    throw new Error(`gh ${args.slice(0, 2).join(" ")} : ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: { name: string; size: number }[];
};

function release(tag: string | undefined): Release {
  if (tag) return JSON.parse(gh(["api", `repos/${REPO}/releases/tags/${tag}`]));
  const list = JSON.parse(gh(["api", `repos/${REPO}/releases?per_page=30`])) as Release[];
  const found = list.find(
    (r) =>
      !r.draft &&
      !r.prerelease &&
      /^(bun-v|aphrody-v)/.test(r.tag_name) &&
      r.assets.some((a) => a.name === "SHA256SUMS.txt"),
  );
  if (!found) throw new Error("no published runtime release with SHA256SUMS.txt");
  return found;
}

async function mirroredTags(s3: Bun.S3Client): Promise<{ tag: string; uploaded: number }[]> {
  const tags = new Map<string, number>();
  let token: string | undefined;
  do {
    const page = await s3.list({
      prefix: `${PREFIX}/`,
      ...(token ? { continuationToken: token } : {}),
    });
    for (const o of page.contents ?? []) {
      const [, tag, rest] = o.key.split("/");
      if (!tag || !rest) continue;
      tags.set(tag, Math.max(tags.get(tag) ?? 0, new Date(o.lastModified ?? 0).getTime()));
    }
    token = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (token);
  return [...tags].map(([tag, uploaded]) => ({ tag, uploaded }));
}

async function main(args: string[]) {
  const keepAt = args.indexOf("--keep");
  const keep = keepAt >= 0 ? Number(args[keepAt + 1]) : 5;
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const tagArg = args.find((a, i) => !a.startsWith("--") && i !== keepAt + 1);
  const rel = release(tagArg);
  if (rel.draft) throw new Error(`${rel.tag_name} is a draft`);
  const tag = rel.tag_name;
  const s3 = client();
  const base = `${PREFIX}/${tag}`;

  const work = mkdtempSync(join(tmpdir(), "release-r2-"));
  try {
    gh(["release", "download", tag, "-R", REPO, "-p", "SHA256SUMS.txt", "-D", work]);
    const sumsText = await Bun.file(join(work, "SHA256SUMS.txt")).text();
    const remote = s3.file(`${base}/SHA256SUMS.txt`);
    const upload = force || !(await remote.exists()) || (await remote.text()) !== sumsText;
    const assets: Asset[] = [];
    for (const [name, sha256] of parseSums(sumsText)) {
      const size = rel.assets.find((a) => a.name === name)?.size;
      if (size === undefined) throw new Error(`${tag}: ${name} is not a release asset`);
      assets.push({ name, sha256, size });
      if (!upload) continue;
      console.log(`${tag}: ${name} (${(size / 1e6).toFixed(1)} MB)`);
      if (dryRun) continue;
      gh(["release", "download", tag, "-R", REPO, "-p", name, "-D", work, "--clobber"]);
      const file = Bun.file(join(work, name));
      const got = new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex");
      if (got !== sha256) throw new Error(`${tag}: ${name} sha256 ${got}, expected ${sha256}`);
      await s3.write(`${base}/${name}`, file, { type: contentType(name) });
      rmSync(join(work, name));
    }
    if (upload && !dryRun)
      await s3.write(`${base}/SHA256SUMS.txt`, sumsText, { type: contentType(".txt") });

    const latest: Latest = {
      tag,
      version: versionOf(tag),
      published: rel.published_at,
      base: `${PUBLIC}/${base}`,
      assets,
    };
    const manifest = windowsManifest(latest);
    if (!tagArg && !dryRun) {
      const json = { type: "application/json" };
      await s3.write(`${PREFIX}/latest.json`, JSON.stringify(latest, null, 2) + "\n", json);
      if (manifest)
        await s3.write(`${PREFIX}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n", json);
    }
    console.log(`${tag}: ${upload ? "mirrored" : "already mirrored"} at ${latest.base}`);

    for (const old of prune(await mirroredTags(s3), tag, keep)) {
      console.log(`${old}: removed (keeping ${keep})`);
      if (dryRun) continue;
      const page = await s3.list({ prefix: `${PREFIX}/${old}/` });
      for (const o of page.contents ?? []) await s3.delete(o.key);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) await main(process.argv.slice(2));
