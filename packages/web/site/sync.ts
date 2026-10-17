import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { regenerate } from "../../../scripts/aphrody/release-surfaces";
import { readProtected, releaseSite } from "../cloudflare/scripts/site-release";
import { publicRuntimeHomeFact } from "./runtime-facts";
import { publishSiteSnapshotFromFile } from "./site-neon-publish";

export type SiteSyncConfig = {
  checkout: string;
  runtimeFactFiles: string[];
  buildRoot: string;
  ownerConnectionFile: string;
  readerConnectionFile: string;
  credentialFile: string;
  sourceRemote?: string;
  /** Explicit documentation-only publication; empty runtime evidence stays visibly unqualified. */
  allowUnqualifiedRuntime?: boolean;
};
const hash = (bytes: Uint8Array | string) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

export function validateSiteSyncConfig(value: SiteSyncConfig): void {
  if (value.allowUnqualifiedRuntime !== undefined && typeof value.allowUnqualifiedRuntime !== "boolean")
    throw new TypeError("Site synchronization modes must be booleans");
  if (
    value.sourceRemote !== undefined &&
    (typeof value.sourceRemote !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value.sourceRemote))
  )
    throw new TypeError("Site source remote reference is invalid");
  for (const field of [
    "checkout",
    "buildRoot",
    "ownerConnectionFile",
    "readerConnectionFile",
    "credentialFile",
  ] as const)
    if (typeof value[field] !== "string" || !isAbsolute(value[field]))
      throw new TypeError("Site sync requires absolute references");
  if (
    !Array.isArray(value.runtimeFactFiles) ||
    (value.runtimeFactFiles.length < 1 && value.allowUnqualifiedRuntime !== true) ||
    value.runtimeFactFiles.length > 8 ||
    value.runtimeFactFiles.some(path => typeof path !== "string" || !isAbsolute(path)) ||
    new Set(value.runtimeFactFiles).size !== value.runtimeFactFiles.length
  )
    throw new TypeError("Site sync requires one to eight distinct measured runtime receipts");
}

/** Public input identity includes actual receipt bytes, without exposing local references. */
export async function siteSyncInputs(config: SiteSyncConfig) {
  validateSiteSyncConfig(config);
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
  const inputs = {
    runtime,
    ...(config.allowUnqualifiedRuntime ? { runtimeQualification: "explicitly-pending" } : {}),
  };
  return { ...inputs, sha256: hash(JSON.stringify(inputs)) };
}

function git(checkout: string, args: string[]) {
  const child = Bun.spawnSync(["git", "-C", checkout, ...args], { stdout: "pipe", stderr: "pipe", timeout: 30000 });
  if (child.exitCode !== 0) throw new Error("Site source synchronization failed");
  return child.stdout.toString().trim();
}

const publicRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

async function freshnessJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status !== 200 || Number(response.headers.get("content-length")) > 1024 * 1024) {
    await response.body?.cancel();
    throw Error("Unqualified public freshness response");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Missing freshness response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1024 * 1024) throw Error("Freshness response exceeds its bound");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const value = publicRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (!value) throw Error("Invalid freshness response");
  return value;
}

/** A saved source receipt alone cannot qualify the current database and public routes. */
export async function siteSyncFreshness(
  config: Pick<SiteSyncConfig, "buildRoot">,
  source: string,
  evidence: string,
  origin = "https://aphrody.app",
): Promise<{ fresh: boolean }> {
  try {
    const file = Bun.file(join(config.buildRoot, "last-sync.json"));
    if (file.size < 1 || file.size > 1024 * 1024) return { fresh: false };
    const previous = publicRecord(await file.json());
    const snapshot = publicRecord(previous?.snapshot);
    if (
      !/^[a-f0-9]{40}$/.test(source) ||
      !/^[a-f0-9]{64}$/.test(evidence) ||
      previous?.schema !== 1 ||
      previous.commit !== source ||
      previous.evidence !== evidence ||
      snapshot?.source !== source ||
      typeof snapshot.id !== "string" ||
      !/^[a-f0-9]{64}$/.test(snapshot.id)
    )
      return { fresh: false };
    const signal = AbortSignal.timeout(60000);
    const read = async (path: string) =>
      freshnessJson(
        await fetch(new URL(path, origin), {
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        }),
      );
    const [publication, database] = await Promise.all([read("/publish.json"), read("/api/site/snapshot")]);
    if (
      publication.commit !== source ||
      publication.evidence !== evidence ||
      database.source !== source ||
      database.id !== snapshot.id ||
      database.profile !== "bun" ||
      database.repository !== "aphrody-labs/bun"
    )
      return { fresh: false };
    return { fresh: true };
  } catch {
    // Missing receipts, refused reads or invalid routes must take the regeneration path.
    return { fresh: false };
  }
}

export async function syncSite(
  config: SiteSyncConfig,
  options: { dryRun?: boolean; force?: boolean; offline?: boolean; source?: string } = {},
) {
  const inputs = await siteSyncInputs(config);
  const remote = config.sourceRemote ?? "origin";
  git(config.checkout, ["fetch", "--quiet", remote, `refs/heads/main:refs/remotes/${remote}/main`]);
  const source = git(config.checkout, ["rev-parse", `refs/remotes/${remote}/main^{commit}`]);
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Expected an immutable origin/main revision");
  if (options.source !== undefined && options.source !== source)
    throw new Error("Site generator revision differs from synchronized origin/main");
  const stamp = { schema: 1, commit: source, evidence: inputs.sha256 };
  if (!options.force && !options.dryRun) {
    const current = await siteSyncFreshness(config, source, inputs.sha256);
    if (current.fresh) return { changed: false, source };
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
    // Windows may still hold SQLite or archive handles briefly; never mask the publication result or error.
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch {}
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
      source: { type: "string" },
    },
  });
  try {
    const file = values.config ?? join(homedir(), ".aphrody", "config", "bun-site-sync.json");
    const config = JSON.parse(await readProtected(file)) as SiteSyncConfig;
    console.log(
      JSON.stringify(
        await syncSite(config, {
          dryRun: values["dry-run"],
          force: values.force,
          offline: values.offline,
          source: values.source,
        }),
      ),
    );
  } catch {
    console.error(
      "Bun site synchronization failed; protected values are omitted. Inspect the sanitized deployment log.",
    );
    process.exitCode = 1;
  }
}
