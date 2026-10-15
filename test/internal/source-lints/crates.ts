// Crates compiled into the Bun binary: the normal dependencies (optional ones included) reachable from
// `bun_runtime` through path and workspace dependencies. Dev and build dependencies are not linked.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");

function parse(file: string): Record<string, any> {
  return Bun.TOML.parse(readFileSync(file, "utf8")) as Record<string, any>;
}

function normalDeps(manifest: Record<string, any>): Record<string, any>[] {
  const tables = [manifest.dependencies ?? {}];
  for (const target of Object.values<any>(manifest.target ?? {})) tables.push(target.dependencies ?? {});
  return tables;
}

let cached: string[] | undefined;
let cachedSet: Set<string> | undefined;

/** Repository-relative crate directories, `/`-separated, without a trailing slash. */
export function linkedCrateDirs(): string[] {
  if (cached) return cached;
  const workspace = parse(path.join(repoRoot, "Cargo.toml")).workspace ?? {};
  const shared: Record<string, any> = workspace.dependencies ?? {};
  const seen = new Set<string>();
  const queue = ["src/runtime"];
  while (queue.length) {
    const dir = queue.pop()!;
    if (seen.has(dir)) continue;
    const file = path.join(repoRoot, dir, "Cargo.toml");
    if (!existsSync(file)) continue;
    seen.add(dir);
    for (const table of normalDeps(parse(file))) {
      for (const [name, spec] of Object.entries<any>(table)) {
        let depPath: string | undefined;
        if (spec && typeof spec === "object" && spec.workspace) {
          const entry = shared[spec.package ?? name] ?? shared[name];
          if (entry && typeof entry === "object" && entry.path) depPath = entry.path;
        } else if (spec && typeof spec === "object" && spec.path) {
          depPath = path.posix.join(dir, spec.path);
        }
        if (depPath) queue.push(path.posix.normalize(depPath).replace(/\/$/, ""));
      }
    }
  }
  return (cached = [...seen].sort());
}

/** The directory of the nearest `Cargo.toml` above a repository-relative source file. */
export function crateDirOf(rel: string): string | undefined {
  for (let dir = path.posix.dirname(rel); dir !== "." && dir !== ""; dir = path.posix.dirname(dir)) {
    if (existsSync(path.join(repoRoot, dir, "Cargo.toml"))) return dir;
  }
}

/** Whether a repository-relative source file belongs to a crate linked into Bun. */
export function isInLinkedCrate(rel: string): boolean {
  const dir = crateDirOf(rel);
  cachedSet ??= new Set(linkedCrateDirs());
  return dir !== undefined && cachedSet.has(dir);
}

const lintsCache = new Map<string, boolean>();
/** Whether a source file's crate opts into `[workspace.lints]` (`[lints] workspace = true`). */
export function usesWorkspaceLints(rel: string): boolean {
  const dir = crateDirOf(rel);
  if (dir === undefined) return false;
  let uses = lintsCache.get(dir);
  if (uses === undefined) {
    uses = /^\[lints\]\r?\nworkspace = true$/m.test(readFileSync(path.join(repoRoot, dir, "Cargo.toml"), "utf8"));
    lintsCache.set(dir, uses);
  }
  return uses;
}
