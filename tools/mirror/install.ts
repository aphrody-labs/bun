// Inventory of the Bun installation that is running this code: the binary, its install directory,
// the package cache, global packages, and whether the repository's lockfile matches its manifests.
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sha256 } from "./config.ts";

export interface Installation {
  version: string;
  revision: string;
  execPath: string;
  binary: { bytes: number; sha256: string };
  platform: string;
  arch: string;
  installDir: string;
  bin: string[];
  cache: { dir: string; packages: number };
  globals: Record<string, string>;
  onPath: string | null;
  latest: string | null;
  /** How the running version compares with the repository's LATEST file: -1 older, 0 same, 1 newer. */
  versusLatest: number | null;
  lockfile: { path: string; workspaces: number; packages: number; missingWorkspaces: string[] } | null;
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

async function readJsonc(path: string): Promise<Record<string, any> | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? (Bun.JSONC.parse(await file.text()) as Record<string, any>) : null;
}

/** Checks that every workspace package the manifests declare is present in bun.lock. */
async function lockState(repo: string): Promise<Installation["lockfile"]> {
  const lockPath = join(repo, "bun.lock");
  const lock = await readJsonc(lockPath);
  const manifest = await readJsonc(join(repo, "package.json"));
  if (!lock || !manifest) return null;
  const patterns: string[] = Array.isArray(manifest.workspaces) ? manifest.workspaces : (manifest.workspaces?.packages ?? []);
  const declared = new Set<string>();
  for (const pattern of patterns) {
    const glob = new Bun.Glob(`${pattern.replace(/^\.\//, "")}/package.json`);
    for (const path of glob.scanSync({ cwd: repo })) declared.add(dirname(path).replaceAll("\\", "/"));
  }
  const locked = new Set(Object.keys(lock.workspaces ?? {}));
  return {
    path: lockPath,
    workspaces: locked.size,
    packages: Object.keys(lock.packages ?? {}).length,
    missingWorkspaces: [...declared].filter((w) => !locked.has(w)).sort(),
  };
}

export async function inspectInstallation(repo: string, env: Record<string, string | undefined> = Bun.env): Promise<Installation> {
  const execPath = process.execPath;
  const binary = Bun.file(execPath);
  // BUN_INSTALL when set; otherwise the binary's own layout (<dir>/bin/bun), then the default.
  const installDir = env.BUN_INSTALL ?? (dirname(execPath).endsWith("bin") ? dirname(dirname(execPath)) : join(homedir(), ".bun"));
  const cacheDir = env.BUN_INSTALL_CACHE_DIR ?? join(installDir, "install", "cache");
  const globalManifest = await readJsonc(join(installDir, "install", "global", "package.json"));
  const latestFile = Bun.file(join(repo, "LATEST"));
  const latest = (await latestFile.exists()) ? (await latestFile.text()).trim() : null;
  const version = Bun.version.split("-")[0]!;
  return {
    version: Bun.version,
    revision: Bun.revision,
    execPath,
    binary: { bytes: statSync(execPath).size, sha256: sha256(await binary.arrayBuffer()) },
    platform: process.platform,
    arch: process.arch,
    installDir,
    bin: list(join(installDir, "bin")),
    cache: { dir: cacheDir, packages: list(cacheDir).filter((name) => !name.startsWith(".")).length },
    globals: { ...globalManifest?.dependencies },
    onPath: Bun.which("bun"),
    latest,
    versusLatest: latest && Bun.semver.satisfies(latest, "*") ? Bun.semver.order(version, latest) : null,
    lockfile: await lockState(repo),
  };
}
