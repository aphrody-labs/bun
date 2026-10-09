// SPDX-License-Identifier: Apache-2.0
/**
 * System packages of the host, read where the package manager keeps them: `bun pm apk ls --json`
 * when this Bun has it (src/install/system), else the apk database (/lib/apk/db/installed), the
 * dpkg status file, or the packages Bun itself installed from system sources (.bun-system).
 * Installing goes through `bun pm` only; the WebOS never reimplements a package manager.
 */
import { join } from "node:path";

export interface SystemPackage {
  name: string;
  version: string;
  description: string;
  sizeBytes: number | null;
  origin: string | null;
}

export interface PackageListing {
  source: string;
  packages: SystemPackage[];
  /** Why no source could be read; packages is then empty. */
  unavailable: string[];
}

/** /lib/apk/db/installed: blank-line separated records of `X:value` lines. */
export function parseApkInstalled(text: string): SystemPackage[] {
  const out: SystemPackage[] = [];
  for (const record of text.split(/\n\n+/)) {
    const field = (key: string) => record.match(new RegExp(`^${key}:(.*)$`, "m"))?.[1] ?? null;
    const name = field("P");
    if (!name) continue;
    const size = field("I");
    out.push({
      name,
      version: field("V") ?? "",
      description: field("T") ?? "",
      sizeBytes: size === null ? null : Number(size),
      origin: field("o"),
    });
  }
  return out;
}

/** /var/lib/dpkg/status: installed packages only. */
export function parseDpkgStatus(text: string): SystemPackage[] {
  const out: SystemPackage[] = [];
  for (const record of text.split(/\n\n+/)) {
    const field = (key: string) => record.match(new RegExp(`^${key}: (.*)$`, "m"))?.[1] ?? null;
    const name = field("Package");
    if (!name || !/install ok installed/.test(field("Status") ?? "")) continue;
    const size = field("Installed-Size");
    out.push({
      name,
      version: field("Version") ?? "",
      description: field("Description") ?? "",
      sizeBytes: size === null ? null : Number(size) * 1024,
      origin: field("Source"),
    });
  }
  return out;
}

function bunPm(args: string[], cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "pm", ...args],
    cwd,
    env: { ...process.env, BUN_BE_BUN: "1", NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  return { ok: proc.exitCode === 0, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

export async function listSystemPackages(cwd: string): Promise<PackageListing> {
  const unavailable: string[] = [];

  const pm = bunPm(["apk", "ls", "--json"], cwd);
  if (pm.ok) {
    try {
      return { source: "bun pm apk", packages: JSON.parse(pm.stdout) as SystemPackage[], unavailable };
    } catch (error) {
      unavailable.push(`bun pm apk ls --json: unreadable output (${(error as Error).message})`);
    }
  } else {
    unavailable.push(`bun pm apk ls: ${pm.stderr.trim().split("\n")[0] || "not available in this Bun"}`);
  }

  for (const [source, path, parse] of [
    ["apk", "/lib/apk/db/installed", parseApkInstalled],
    ["dpkg", "/var/lib/dpkg/status", parseDpkgStatus],
  ] as const) {
    const file = Bun.file(path);
    if (await file.exists()) return { source, packages: parse(await file.text()), unavailable };
    unavailable.push(`${source}: ${path} not found`);
  }

  // Packages `bun install` took from system sources (`systemDependencies`), see src/install/system/db.rs.
  const db = Bun.file(join(cwd, ".bun-system", "installed.json"));
  if (await db.exists()) {
    // Keyed by `<source>:<id>` (InstalledDb::save).
    const data = (await db.json()) as { packages?: Record<string, { version?: string; files?: string[] }> };
    const packages = Object.entries(data.packages ?? {}).map(([key, p]) => {
      const colon = key.indexOf(":");
      return {
        name: key.slice(colon + 1),
        version: p.version ?? "",
        description: `${p.files?.length ?? 0} files`,
        sizeBytes: null,
        origin: colon > 0 ? key.slice(0, colon) : null,
      };
    });
    return { source: ".bun-system/installed.json", packages, unavailable };
  }
  unavailable.push(`.bun-system/installed.json not found in ${cwd}`);
  return { source: "none", packages: [], unavailable };
}

/** `bun pm apk add <name>`; reports Bun's own error when this Bun has no apk source yet. */
export function installSystemPackage(name: string): { ok: boolean; output: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(name)) return { ok: false, output: `invalid package name: ${name}` };
  const result = bunPm(["apk", "add", name]);
  return { ok: result.ok, output: (result.stdout + result.stderr).trim() };
}
