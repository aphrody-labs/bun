// Disk hygiene for the deploy hosts (system timer on the prod host, also run after each activation).
//   bun clean.ts --host-role prod|build [--root R] [--home H] [--state S] [--config apps.json] [--dry-run]
// Prints one JSON report: what was removed and the space freed. Hard guards: nothing under docker volumes, postgres paths,
// ~/src (the one checkout per repository), ~/apps/*/data|shared, ~/archive or tmux sockets is ever removed; prod keeps
// >= 15 GB free or exits non-zero.
import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, posix, resolve, sep } from "node:path";
import {
  EXIT,
  GB,
  QueueState,
  dirSize,
  ensureFlock,
  freeBytes,
  readJson,
  readLink,
  run,
  selectReleasesToKeep,
  stateDir,
  validateApp,
  type Run,
} from "./lib.ts";

export interface CleanContext {
  role: "prod" | "build";
  home: string;
  root?: string;
  stateBase?: string;
  app?: { name: string; clean?: { cacheDirs?: string[]; cacheDays?: number }; remote?: { keep?: number } };
  dryRun: boolean;
  now?: number;
  free?: (p: string) => number;
  exec?: Run;
  tmpDir?: string;
  minFreeBytes?: number;
}

export interface CleanReport {
  role: string;
  dryRun: boolean;
  removed: { path: string; bytes: number; why: string }[];
  commands: { cmd: string; code: number | null }[];
  skipped: { path: string; why: string }[];
  freeBeforeBytes: number;
  freeAfterBytes: number;
  freedBytes: number;
  aggressive: boolean;
  ok: boolean;
}

const norm = (p: string) => (p.startsWith("/") ? posix.resolve(p) : resolve(p).split(sep).join("/")).toLowerCase();

/** Returns the reason a path must never be removed, or null when removal is allowed. */
export function protectedReason(path: string, home: string): string | null {
  const p = norm(path);
  const h = norm(home);
  if (p === "/" || /^[a-z]:\/?$/.test(p)) return "filesystem root";
  if (p === h) return "home directory";
  if (p.includes("postgres")) return "postgres path";
  if (p === "/var/lib/docker/volumes" || p.startsWith("/var/lib/docker/volumes/")) return "docker volumes";
  if (p === "/var/lib/docker" || p === "/var/lib" || p === "/var") return "system path";
  if (p === `${h}/src` || p.startsWith(`${h}/src/`)) return "source checkout";
  if (p === `${h}/archive` || p.startsWith(`${h}/archive/`)) return "archive";
  const app = p.startsWith(`${h}/apps/`) ? p.slice(`${h}/apps/`.length).split("/") : null;
  if (p === `${h}/apps` || (app && (app.length === 1 || app[1] === "data" || app[1] === "shared"))) return "app data";
  if (/(^|\/)tmux[-_.]/.test(p) || /\/(yolo|vps-cargo|aphrody)\.(sock|session)$/.test(p)) return "tmux";
  return null;
}

export function olderThan(mtimeMs: number, days: number, now = Date.now()) {
  return now - mtimeMs > days * 86_400_000;
}

export async function runClean(ctx: CleanContext): Promise<CleanReport> {
  const exec = ctx.exec ?? run;
  const free = ctx.free ?? freeBytes;
  const now = ctx.now ?? Date.now();
  const minFree = ctx.minFreeBytes ?? 15 * GB;
  const probe = ctx.root && existsSync(ctx.root) ? ctx.root : ctx.home;
  const report: CleanReport = {
    role: ctx.role,
    dryRun: ctx.dryRun,
    removed: [],
    commands: [],
    skipped: [],
    freeBeforeBytes: free(probe),
    freeAfterBytes: 0,
    freedBytes: 0,
    aggressive: false,
    ok: true,
  };

  const remove = (path: string, why: string) => {
    const reason = protectedReason(path, ctx.home);
    if (reason) {
      report.skipped.push({ path, why: `protected: ${reason}` });
      return;
    }
    const bytes = dirSize(path);
    if (!ctx.dryRun) rmSync(path, { recursive: true, force: true });
    report.removed.push({ path, bytes, why });
  };
  const command = async (...cmd: string[]) => {
    if (ctx.dryRun) {
      report.commands.push({ cmd: cmd.join(" "), code: null });
      return null;
    }
    let r;
    try {
      r = await exec(cmd);
    } catch {
      r = { code: 127, stdout: "", stderr: "" };
    }
    report.commands.push({ cmd: cmd.join(" "), code: r.code });
    return r;
  };
  const entries = (dir: string) => {
    try {
      return readdirSync(dir).map(name => ({ name, path: join(dir, name), st: lstatSync(join(dir, name)) }));
    } catch {
      return [];
    }
  };
  const nextCaches = (base: string, depth: number): string[] => {
    const found: string[] = [];
    const walk = (dir: string, d: number) => {
      for (const e of entries(dir)) {
        if (!e.st.isDirectory() || e.name === "node_modules" || e.name === ".git") continue;
        if (e.name === ".next" && existsSync(join(e.path, "cache"))) found.push(join(e.path, "cache"));
        else if (d < depth) walk(e.path, d + 1);
      }
    };
    walk(base, 0);
    return found;
  };

  const cacheSweep = (aggressive: boolean) => {
    const cacheDays = ctx.app?.clean?.cacheDays ?? 14;
    for (const dir of ctx.app?.clean?.cacheDirs ?? []) {
      const st = existsSync(dir) ? lstatSync(dir) : null;
      if (st && (aggressive || olderThan(st.mtimeMs, cacheDays, now))) remove(dir, "stale cache");
    }
    const scan = ctx.root ? [ctx.root] : [];
    if (ctx.stateBase) scan.push(ctx.stateBase);
    for (const base of scan)
      for (const c of nextCaches(base, 4)) {
        if (aggressive || olderThan(lstatSync(c).mtimeMs, ctx.role === "prod" ? 7 : cacheDays, now))
          remove(c, ".next/cache");
      }
  };

  if (ctx.role === "prod") {
    if (ctx.root) {
      const releasesDir = join(ctx.root, "releases");
      const pins = [readLink(join(ctx.root, "current")), readLink(join(ctx.root, "previous"))].map(p =>
        p ? basename(p) : null,
      );
      const all = entries(releasesDir);
      for (const e of all.filter(e => e.name.endsWith(".partial") && olderThan(e.st.mtimeMs, 1 / 24, now))) {
        remove(e.path, "stale partial transfer");
      }
      const rel = all.filter(e => e.st.isDirectory() && !e.name.endsWith(".partial"));
      const { remove: drop } = selectReleasesToKeep(
        rel.map(e => ({ name: e.name, mtimeMs: e.st.mtimeMs })),
        pins,
        0,
      );
      for (const name of drop) remove(join(releasesDir, name), "release not current/previous");
    }
    await command("docker", "image", "prune", "-f");
    await command("docker", "builder", "prune", "-f");
    await removeUnusedShenronImages(command, ctx, exec, report);
    await command("journalctl", "--vacuum-size=200M");
    sweepTmp(ctx, entries, remove, 3, now);
    remove(join(ctx.home, ".bun/install/cache"), "bun install cache");
    cacheSweep(false);
  } else {
    if (ctx.app) {
      const base = stateDir(ctx.app.name, ctx.stateBase);
      for (const e of entries(join(base, "work"))) {
        if (olderThan(e.st.mtimeMs, 2 / 24, now)) remove(e.path, "orphan worktree");
      }
      const relDir = join(base, "releases");
      const rel = entries(relDir).filter(e => e.st.isDirectory());
      const pendingId = new QueueState(base).readPending()?.id;
      const pending = rel.some(e => e.name === pendingId) ? pendingId : null;
      const { remove: drop } = selectReleasesToKeep(
        rel.map(e => ({ name: e.name, mtimeMs: e.st.mtimeMs })),
        [pending],
        2,
      );
      for (const name of drop) remove(join(relDir, name), "build artifact older than 2 versions");
    }
    cacheSweep(false);
    await command("docker", "builder", "prune", "-f", "--filter", "until=168h");
  }

  report.freeAfterBytes = ctx.dryRun ? report.freeBeforeBytes : free(probe);
  if (ctx.role === "prod" && report.freeAfterBytes < minFree && !ctx.dryRun) {
    report.aggressive = true;
    cacheSweep(true);
    sweepTmp(ctx, entries, remove, 1, now);
    await command("docker", "builder", "prune", "-af");
    await command("journalctl", "--vacuum-size=50M");
    report.freeAfterBytes = free(probe);
    report.ok = report.freeAfterBytes >= minFree;
  }
  report.freedBytes = ctx.dryRun
    ? report.removed.reduce((s, r) => s + r.bytes, 0)
    : Math.max(0, report.freeAfterBytes - report.freeBeforeBytes);
  return report;
}

function sweepTmp(
  ctx: CleanContext,
  entries: (d: string) => { name: string; path: string; st: ReturnType<typeof lstatSync> }[],
  remove: (p: string, why: string) => void,
  days: number,
  now: number,
) {
  for (const e of entries(ctx.tmpDir ?? "/tmp")) {
    if (e.st.isSocket() || e.name.startsWith("tmux-") || e.name.startsWith(".")) continue;
    if (olderThan(e.st.mtimeMs, days, now)) remove(e.path, `/tmp older than ${days}d`);
  }
}

async function removeUnusedShenronImages(
  command: (...cmd: string[]) => Promise<{ code: number; stdout: string } | null>,
  ctx: CleanContext,
  exec: Run,
  report: CleanReport,
) {
  if (ctx.dryRun) return;
  const images = await exec(["docker", "images", "--format", "{{.Repository}}:{{.Tag}} {{.ID}}"]).catch(() => null);
  const used = await exec(["docker", "ps", "-a", "--format", "{{.Image}}"]).catch(() => null);
  if (!images || !used || images.code !== 0 || used.code !== 0) return;
  const inUse = new Set(used.stdout.split("\n").filter(Boolean));
  for (const line of images.stdout.split("\n").filter(Boolean)) {
    const [ref, id] = line.split(" ");
    if (!ref.startsWith("shenron-") || /postgres|redis|chat/i.test(ref)) continue;
    if (inUse.has(ref) || inUse.has(id) || [...inUse].some(u => id.startsWith(u) || u.startsWith(id))) continue;
    await command("docker", "image", "rm", id);
  }
  void report;
}

function arg(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const role = arg(args, "--host-role") ?? "prod";
  if (role !== "prod" && role !== "build") {
    console.error("--host-role must be prod or build");
    process.exit(EXIT.config);
  }
  const dryRun = args.includes("--dry-run");
  if (!dryRun) await ensureFlock(join(process.env.XDG_RUNTIME_DIR ?? "/tmp", "aphrody-deploy-clean.lock"));
  const home = arg(args, "--home") ?? (process.env.SUDO_USER ? `/home/${process.env.SUDO_USER}` : homedir());
  const configPath = arg(args, "--config");
  const app = configPath ? validateApp(readJson(configPath)) : undefined;
  const report = await runClean({
    role,
    home,
    root: arg(args, "--root"),
    stateBase: arg(args, "--state"),
    app,
    dryRun,
  });
  console.log(JSON.stringify(report));
  process.exit(report.ok ? 0 : 3);
}
