import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { regenerate } from "../../../scripts/aphrody/release-surfaces";
import { readProtected, releaseSite } from "../cloudflare/scripts/site-release";
import { publicRuntimeHomeFact } from "./upstream-home";
import { publishSiteSnapshotFromFile } from "./site-neon-publish";

export type SiteSyncConfig = {
  checkout: string;
  captureRoot: string;
  runtimeFactFiles: string[];
  buildRoot: string;
  ownerConnectionFile: string;
  readerConnectionFile: string;
  credentialFile: string;
};
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

export function validateSiteSyncConfig(value: SiteSyncConfig): void {
  for (const field of [
    "checkout",
    "captureRoot",
    "buildRoot",
    "ownerConnectionFile",
    "readerConnectionFile",
    "credentialFile",
  ] as const)
    if (typeof value[field] !== "string" || !isAbsolute(value[field]))
      throw new TypeError("Site sync requires absolute references");
  if (
    !Array.isArray(value.runtimeFactFiles) ||
    value.runtimeFactFiles.length < 1 ||
    value.runtimeFactFiles.length > 8 ||
    value.runtimeFactFiles.some(path => typeof path !== "string" || !isAbsolute(path)) ||
    new Set(value.runtimeFactFiles).size !== value.runtimeFactFiles.length
  )
    throw new TypeError("Site sync requires one to eight distinct measured runtime receipts");
}

/** Public input identity includes actual receipt bytes, without exposing local references. */
export async function siteSyncInputs(config: SiteSyncConfig) {
  validateSiteSyncConfig(config);
  const capture = await Bun.file(join(config.captureRoot, "manifest.json")).bytes();
  const runtime: { target: string; source: string; sha256: string }[] = [];
  for (const path of config.runtimeFactFiles) {
    const file = Bun.file(path);
    if (file.size < 1 || file.size > 1024 * 1024) throw new Error("Runtime receipt exceeds its bound");
    const bytes = await file.bytes();
    const fact = publicRuntimeHomeFact(JSON.parse(new TextDecoder().decode(bytes)));
    if (runtime.some(previous => previous.target === fact.target))
      throw new Error("Runtime target has duplicate evidence");
    runtime.push({ target: fact.target, source: fact.source, sha256: hash(bytes) });
  }
  runtime.sort((a, b) => a.target.localeCompare(b.target));
  const inputs = { captureSHA256: hash(capture), runtime };
  return { ...inputs, sha256: hash(JSON.stringify(inputs)) };
}

function git(checkout: string, args: string[]) {
  const child = Bun.spawnSync(["git", "-C", checkout, ...args], { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  if (child.exitCode !== 0) throw new Error("Site source synchronization failed");
  return child.stdout.toString().trim();
}

export async function syncSite(
  config: SiteSyncConfig,
  options: { dryRun?: boolean; force?: boolean; offline?: boolean } = {},
) {
  const inputs = await siteSyncInputs(config);
  git(config.checkout, ["fetch", "--quiet", "origin", "main"]);
  const source = git(config.checkout, ["rev-parse", "origin/main^{commit}"]);
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Expected an immutable origin/main revision");
  const stamp = { schema: 1, commit: source, evidence: inputs.sha256 };
  if (!options.force && !options.dryRun) {
    try {
      const response = await fetch("https://aphrody.app/publish.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const current = (await response.json()) as { commit?: string; evidence?: string };
        if (current.commit === source && current.evidence === inputs.sha256) return { changed: false, source };
      }
    } catch {
      /* A failed public read does not establish freshness. */
    }
  }
  mkdirSync(config.buildRoot, { recursive: true });
  const work = mkdtempSync(join(config.buildRoot, "site-"));
  const output = join(work, "release");
  const parent = resolve(config.buildRoot),
    target = resolve(work);
  if (!target.startsWith(parent + (process.platform === "win32" ? "\\" : "/")))
    throw new Error("Unexpected site work directory");
  try {
    const result = await regenerate(config.checkout, source, output, "aphrody-labs/bun", !!options.offline, false, {
      captureRoot: config.captureRoot,
      runtimeFactFiles: config.runtimeFactFiles,
    });
    const assets = join(output, "site");
    const publication = JSON.stringify(stamp) + "\n";
    await Bun.write(join(assets, "publish.json"), publication);
    const manifest = {
      ...result.manifest,
      artifacts: { ...result.manifest.artifacts, "site/publish.json": hash(publication) },
    };
    await Bun.write(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    let snapshot: { id: string; source: string } | undefined;
    if (!options.dryRun) {
      const manifestBytes = await Bun.file(join(output, "manifest.json")).bytes();
      snapshot = await publishSiteSnapshotFromFile(output, hash(manifestBytes), config.ownerConnectionFile);
      if (snapshot.source !== result.manifest.source) throw new Error("Neon and static site source revisions differ");
    }
    const deployment = await releaseSite({
      assets,
      output: join(config.buildRoot, "last-deployment"),
      dryRun: options.dryRun,
      connectionFile: config.readerConnectionFile,
      credentialFile: config.credentialFile,
    });
    if (!options.dryRun) {
      const response = await fetch("https://aphrody.app/api/site/snapshot", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const actual = response.ok
        ? ((await response.json()) as { source?: string; snapshot?: { source?: string } })
        : null;
      if ((actual?.snapshot?.source ?? actual?.source) !== source)
        throw new Error("Public Neon API did not confirm the deployed source");
    }
    const receipt = { ...stamp, changed: true, inputs, snapshot, deployment };
    await Bun.write(join(config.buildRoot, "last-sync.json"), JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      config: { type: "string" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      offline: { type: "boolean" },
    },
  });
  try {
    const file = values.config ?? join(homedir(), ".aphrody", "config", "bun-site-sync.json");
    const config = JSON.parse(await readProtected(file)) as SiteSyncConfig;
    console.log(
      JSON.stringify(
        await syncSite(config, { dryRun: values["dry-run"], force: values.force, offline: values.offline }),
      ),
    );
  } catch {
    console.error(
      "Bun site synchronization failed; protected values are omitted. Inspect the sanitized deployment log.",
    );
    process.exitCode = 1;
  }
}
