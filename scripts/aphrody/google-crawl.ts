#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateJob } from "../../packages/web/rust/integrations/scripts/tools/web/crawl-index";

export const PUBLIC_GOOGLE_HOSTS = Object.freeze([
  "developers.google.com",
  "developer.chrome.com",
  "developer.android.com",
  "source.android.com",
  "ai.google.dev",
  "web.dev",
  "chrome.dev",
  "chromeos.dev",
  "dart.dev",
  "api.dart.dev",
  "flutter.dev",
  "docs.flutter.dev",
  "api.flutter.dev",
  "angular.dev",
  "material.io",
  "firebase.google.com",
  "cloud.google.com",
  "docs.cloud.google.com",
  "opensource.google",
  "research.google",
  "deepmind.google",
  "blog.google",
  "design.google",
  "go.dev",
  "pkg.go.dev",
]);
const SOURCES = [
  [
    "packages/bun-google/aphrody/crates/google/src/atlas.json",
    "72989c4fcb78e6d61f4b6b13fabf2b5b358fa0775f3475192b69260379301878",
  ],
  [
    "packages/bun-google/aphrody/crates/google/src/search/google_domains.txt",
    "356dfb248ec122d6f7fc9090e4182f92d1d2a52e91b78e0ec9ad3fa2caff7ce2",
  ],
] as const;
export const REQUIRED_REDIRECT_CAPABILITY = "crawl-redirect-allowlist-before-network";
const sha256 = (value: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

function host(value: unknown): string {
  if (typeof value !== "string" || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value))
    throw new Error("catalog contains an invalid hostname");
  const normalized = value.toLowerCase();
  if (normalized.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
    throw new Error("catalog contains an invalid hostname");
  return normalized;
}

export function createGoogleCrawlPlan(
  atlasText: string,
  domainsText: string,
  label = "google-public",
  maxRequests = 25,
) {
  if (Buffer.byteLength(atlasText) > 2_000_000 || Buffer.byteLength(domainsText) > 100_000)
    throw new Error("catalog exceeds source budget");
  const atlas: unknown = JSON.parse(atlasText);
  if (!atlas || typeof atlas !== "object" || !("allHosts" in atlas) || !Array.isArray(atlas.allHosts))
    throw new Error("atlas must provide allHosts");
  if (atlas.allHosts.length > 10_000) throw new Error("catalog exceeds host budget");
  const atlasHosts = new Set(atlas.allHosts.map(host));
  const domainHosts = new Set(
    domainsText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(host),
  );
  const allHosts = [...new Set([...atlasHosts, ...domainHosts])].sort();
  if (allHosts.length > 10_000) throw new Error("catalog exceeds host budget");
  const catalog = allHosts.map(hostname => ({
    hostname,
    sources: [...(atlasHosts.has(hostname) ? ["atlas"] : []), ...(domainHosts.has(hostname) ? ["google_domains"] : [])],
    publicSeed: PUBLIC_GOOGLE_HOSTS.includes(hostname),
    ownershipVerified: false,
  }));
  const seeds = PUBLIC_GOOGLE_HOSTS.filter(hostname => allHosts.includes(hostname)).map(
    hostname => `https://${hostname}/`,
  );
  const job = validateJob({ host: "vps", label, seeds, maxRequests, maxDepth: 0 });
  const atlasHash = sha256(atlasText);
  const domainsHash = sha256(domainsText);
  return {
    schemaVersion: 1 as const,
    job,
    transport: "anonymous-native" as const,
    requiredCapability: REQUIRED_REDIRECT_CAPABILITY,
    policy: {
      allowedDomains: seeds.map(seed => new URL(seed).hostname),
      obeyRobots: true,
      authenticated: false,
      depth: 0,
    },
    provenance: [
      { path: SOURCES[0][0], sha256: atlasHash },
      { path: SOURCES[1][0], sha256: domainsHash },
    ],
    counts: {
      atlas: atlasHosts.size,
      googleDomains: domainHosts.size,
      merged: catalog.length,
      seeds: seeds.length,
    },
    catalog,
  };
}
export type GoogleCrawlPlan = ReturnType<typeof createGoogleCrawlPlan>;

export async function loadGoogleCrawlPlan(repository: string, label = "google-public", maxRequests = 25) {
  if (!isAbsolute(repository)) throw new Error("repository must be absolute");
  const contents: string[] = [];
  for (const [relative, expected] of SOURCES) {
    const path = join(repository, relative);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
      throw new Error("invalid catalog source file");
    const bytes = await Bun.file(path).bytes();
    if (sha256(bytes) !== expected)
      throw new Error("catalog provenance changed; review new source pins before applying");
    contents.push(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  return createGoogleCrawlPlan(contents[0]!, contents[1]!, label, maxRequests);
}

export function nativeCrawlArguments(plan: GoogleCrawlPlan, jobDirectory: string): string[] {
  validateJob(plan.job);
  if (!isAbsolute(jobDirectory)) throw new Error("job directory must be absolute");
  if (
    plan.job.maxDepth !== 0 ||
    plan.job.seeds.some(seed => {
      const url = new URL(seed);
      return (
        url.protocol !== "https:" ||
        url.port !== "" ||
        url.pathname !== "/" ||
        url.search !== "" ||
        url.hash !== "" ||
        !PUBLIC_GOOGLE_HOSTS.includes(url.hostname)
      );
    })
  )
    throw new Error("only curated public HTTPS roots are permitted");
  return [
    "web",
    "crawl-index",
    ...plan.job.seeds,
    "--label",
    plan.job.label,
    "--profile",
    "aphrody",
    "--job-dir",
    jobDirectory,
    "--max-requests",
    String(plan.job.maxRequests),
    "--max-depth",
    "0",
    "--timeout",
    "1800",
    "--per-host-delay-ms",
    "1000",
  ];
}

export interface NativeCrawlOwner {
  capabilities(): Promise<readonly string[]>;
  indexCatalog(directory: string, label: string): Promise<unknown>;
  crawl(args: readonly string[]): Promise<unknown>;
}

export function indexSummary(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("errors" in value) ||
    !Array.isArray(value.errors) ||
    value.errors.length
  )
    throw new Error("native indexing did not qualify successfully");
  const record = value as Record<string, unknown>;
  for (const field of ["indexed", "unchanged", "chunks"])
    if (!Number.isSafeInteger(record[field]) || Number(record[field]) < 0)
      throw new Error("invalid native index counters");
  return {
    indexed: Number(record.indexed),
    unchanged: Number(record.unchanged),
    chunks: Number(record.chunks),
  };
}

export async function executeGoogleCrawlPlan(
  plan: GoogleCrawlPlan,
  root: string,
  owner: NativeCrawlOwner,
  crawl = true,
) {
  if (!isAbsolute(root)) throw new Error("protected root must be absolute");
  const crawlArgs = nativeCrawlArguments(plan, join(root, "crawl"));
  if (crawl && !(await owner.capabilities()).includes(REQUIRED_REDIRECT_CAPABILITY))
    throw new Error("native per-hop redirect allowlist is not qualified; crawl refused");
  if (process.platform === "win32") throw new Error("apply requires the existing native Linux VPS owner");
  for (let current = dirname(root); ; current = dirname(current)) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("protected ancestors must be ordinary directories");
    if ((stat.uid !== 0 && stat.uid !== process.getuid!()) || stat.mode & 0o022)
      throw new Error("protected ancestors must not be writable by other users");
    if (dirname(current) === current) break;
  }
  const parent = await lstat(dirname(root));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid!() || parent.mode & 0o077)
    throw new Error("existing parent must be an owner-only ordinary directory");
  // Exclusive creation refuses foreign job state; frontier resume is owned by the native CLI.
  await mkdir(root, { mode: 0o700 });
  const documents = join(root, "catalog");
  await mkdir(documents, { mode: 0o700 });
  const document = await open(
    join(documents, "catalog.json"),
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await document.writeFile(JSON.stringify(plan, null, 2));
    await document.sync();
  } finally {
    await document.close();
  }
  const index = indexSummary(await owner.indexCatalog(documents, `google-catalog:${plan.job.label}`));
  const result = crawl ? await owner.crawl(crawlArgs) : null;
  let crawlSummary: { complete: boolean; attempts: number; pages: number; written: number } | null = null;
  if (crawl) {
    if (!result || typeof result !== "object" || !("complete" in result) || result.complete !== true)
      throw new Error("native crawl is incomplete; protected job state was preserved");
    const record = result as Record<string, unknown>;
    for (const field of ["attempts", "pages", "written"])
      if (!Number.isSafeInteger(record[field]) || Number(record[field]) < 0)
        throw new Error("invalid native crawl counters");
    crawlSummary = {
      complete: true,
      attempts: Number(record.attempts),
      pages: Number(record.pages),
      written: Number(record.written),
    };
  }
  return {
    schemaVersion: 1,
    catalogSha256: sha256(JSON.stringify(plan, null, 2)),
    counts: plan.counts,
    index,
    crawl: crawlSummary,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      repository: { type: "string", default: resolve(import.meta.dir, "../..") },
      label: { type: "string", default: "google-public" },
      "max-requests": { type: "string", default: "25" },
      apply: { type: "boolean" },
      "index-catalog": { type: "boolean" },
      root: { type: "string" },
      "native-binary": { type: "string", default: "/home/ubuntu/.local/bin/aphrody" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "google-crawl --repository ABS --label SLUG --max-requests 1..5000 [--apply|--index-catalog --root ABS --native-binary ABS]",
    );
  } else {
    const plan = await loadGoogleCrawlPlan(values.repository!, values.label, Number(values["max-requests"]));
    if (!values.apply && !values["index-catalog"]) {
      const { catalog: _catalog, ...summary } = plan;
      console.log(JSON.stringify(summary));
    } else {
      if (values.apply && values["index-catalog"]) throw new Error("choose apply or index-catalog");
      if (!values.root || !isAbsolute(values["native-binary"]!))
        throw new Error("root and native binary must be explicit absolute paths");
      const binary = values["native-binary"]!;
      const runText = async (args: readonly string[]) => {
        const env = { ...process.env };
        for (const key of Object.keys(env)) if (/^(?:https?|all|no)_proxy$/i.test(key)) delete env[key];
        delete env.OBSCURA_ALLOW_PRIVATE_NETWORK;
        const child = Bun.spawn([binary, ...args], {
          env,
          stdout: "pipe",
          stderr: "ignore",
          timeout: 1_820_000,
          killSignal: "SIGKILL",
          maxBuffer: 1_000_000,
        });
        const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
        if (code !== 0 || stdout.length > 1_000_000) throw new Error("native owner command failed");
        return stdout;
      };
      const run = async (args: readonly string[]) => JSON.parse(await runText(args)) as unknown;
      const result = await executeGoogleCrawlPlan(
        plan,
        values.root,
        {
          async capabilities() {
            return (await runText(["web", "capabilities"])).trim().split(/\r?\n/);
          },
          indexCatalog: (directory, label) =>
            run(["home", "index", directory, "--profile", "aphrody", "--label", label]),
          crawl: args => run(args),
        },
        !!values.apply,
      );
      console.log(JSON.stringify(result));
    }
  }
}
