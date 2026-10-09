// Shared pieces of the auto-deploy pipeline (queue.ts on the build host, activate.ts / clean.ts on the prod host).
// Pure functions are exported so test/internal/aphrody-deploy.test.ts can drive them with simulated state.
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface Source {
  name: string;
  repo: string;
  branch?: string;
  /** "release" resolves the latest GitHub release tag starting with `tagPrefix` instead of a branch head. */
  kind?: "git" | "release";
  /** Local clone used to build from; only fetched, never reset. Sources without one only contribute their id. */
  checkout?: string;
  /** Overrides https://github.com/<repo>.git (local bare repositories in tests). */
  url?: string;
  tagPrefix?: string;
}

export interface App {
  name: string;
  sources: Source[];
  build: { cwd: string; cmd: string[]; artifact: string; env?: Record<string, string> };
  host: string;
  ssh?: { target?: string; identity?: string; port?: number };
  remote: { root: string; unit: string; health: string; keep?: number; bun?: string; libDir?: string };
  clean?: { cacheDirs?: string[]; cacheDays?: number };
}

export interface ResolvedSource {
  name: string;
  sha?: string;
  tag?: string;
}
export interface Resolved {
  id: string;
  sources: ResolvedSource[];
}

export type RunResult = { code: number; stdout: string; stderr: string };
export type Run = (
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string | undefined>; input?: string },
) => Promise<RunResult>;

export const run: Run = async (cmd, opts = {}) => {
  const proc = Bun.spawn({
    cmd,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env } as Record<string, string>,
    stdin: opts.input === undefined ? "ignore" : new Blob([opts.input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { code, stdout, stderr };
};

export function expandHome(p: string, home = homedir()): string {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

export function shq(s: string): string {
  return "'" + s.replaceAll("'", "'\\''") + "'";
}

/** One JSON line per event. Callers never pass tokens. */
export function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
  out: (line: string) => void = l => console.log(l),
) {
  out(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

// ---------- configuration ----------

export function validateApp(raw: any): App {
  const need = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(`apps.json: ${msg}`);
  };
  need(raw && typeof raw === "object", "an object is expected");
  need(/^[a-z0-9][a-z0-9._-]*$/i.test(raw.name ?? ""), "name is missing or unsafe");
  need(Array.isArray(raw.sources) && raw.sources.length > 0, "sources is empty");
  const names = new Set<string>();
  for (const s of raw.sources) {
    need(/^[A-Za-z0-9_-]+$/.test(s.name ?? ""), `source name ${s.name}`);
    need(!names.has(s.name), `duplicate source ${s.name}`);
    names.add(s.name);
    need(typeof s.repo === "string" && s.repo, `source ${s.name}: repo`);
  }
  need(Array.isArray(raw.build?.cmd) && raw.build.cmd.length > 0, "build.cmd");
  need(typeof raw.build?.artifact === "string", "build.artifact");
  need(typeof raw.build?.cwd === "string", "build.cwd");
  need(typeof raw.host === "string" && raw.host, "host");
  need(typeof raw.remote?.root === "string" && raw.remote.root.startsWith("/"), "remote.root must be absolute");
  need(/^[A-Za-z0-9@._:-]+$/.test(raw.remote?.unit ?? ""), "remote.unit");
  need(typeof raw.remote?.health === "string", "remote.health");
  return raw as App;
}

export function stateDir(
  app: string,
  base = process.env.APHRODY_DEPLOY_STATE ?? join(homedir(), ".local/state/aphrody-deploy"),
) {
  return join(base, app);
}

// ---------- release id ----------

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

/** `<sha7>-<sha7>-<tag>` in source order; git sources contribute sha7, release sources their tag. */
export function computeReleaseId(sources: ResolvedSource[]): string {
  return sources.map(s => (s.sha ? s.sha.slice(0, 7) : sanitize(s.tag ?? "none"))).join("-");
}

/** Token goes through the environment only (git config env), never argv. */
export function gitEnv(token = process.env.GH_TOKEN): Record<string, string> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0" };
  if (token) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  }
  return env;
}

export const sourceUrl = (s: Source) => s.url ?? `https://github.com/${s.repo}.git`;

export async function resolveSource(
  s: Source,
  io: { run?: Run; releases?: (repo: string) => Promise<{ tag_name: string; draft?: boolean }[]> } = {},
): Promise<ResolvedSource> {
  const exec = io.run ?? run;
  if (s.kind === "release") {
    const releases = await (io.releases ?? ghReleases)(s.repo);
    const prefix = s.tagPrefix ?? "aphrody-v";
    const hit = releases.find(r => !r.draft && r.tag_name.startsWith(prefix));
    if (!hit) throw new Error(`${s.name}: no release tag starting with ${prefix}`);
    return { name: s.name, tag: hit.tag_name };
  }
  const branch = s.branch ?? "main";
  const r = await exec(["git", "ls-remote", sourceUrl(s), `refs/heads/${branch}`], { env: gitEnv() });
  const sha = r.stdout.split(/\s+/)[0];
  if (r.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`${s.name}: ls-remote ${branch} failed: ${r.stderr.trim()}`);
  }
  return { name: s.name, sha };
}

async function ghReleases(repo: string) {
  const r = await run(["gh", "api", `repos/${repo}/releases?per_page=30`]);
  if (r.code !== 0) throw new Error(`gh api releases ${repo}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

export async function resolveAll(app: App, io: Parameters<typeof resolveSource>[1] = {}): Promise<Resolved> {
  const sources = await Promise.all(app.sources.map(s => resolveSource(s, io)));
  return { id: computeReleaseId(sources), sources };
}

// ---------- queue state ----------

export class QueueState {
  constructor(readonly dir: string) {}
  private pendingPath = () => join(this.dir, "pending.json");
  readPending(): { id: string; observedAt: string } | null {
    return readJson(this.pendingPath());
  }
  /** Coalescing: only the latest observed id is kept. */
  writePending(id: string, observedAt = new Date().toISOString()) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.pendingPath(), JSON.stringify({ id, observedAt }) + "\n");
  }
  isBad(id: string) {
    return existsSync(join(this.dir, "bad", id));
  }
  markBad(id: string, reason: string) {
    mkdirSync(join(this.dir, "bad"), { recursive: true });
    writeFileSync(join(this.dir, "bad", id), JSON.stringify({ reason, at: new Date().toISOString() }) + "\n");
  }
  badIds() {
    try {
      return readdirSync(join(this.dir, "bad"));
    } catch {
      return [];
    }
  }
}

export type Decision =
  | { action: "build"; id: string }
  | { action: "noop"; reason: "deployed" | "known-bad"; id: string };

export function decide(id: string, deployed: string | null, state: Pick<QueueState, "isBad">): Decision {
  if (id === deployed) return { action: "noop", reason: "deployed", id };
  if (state.isBad(id)) return { action: "noop", reason: "known-bad", id };
  return { action: "build", id };
}

export interface QueueDeps {
  resolve(): Promise<Resolved>;
  deployedId(): Promise<string | null>;
  build(r: Resolved): Promise<string>;
  transfer(r: Resolved, dir: string): Promise<void>;
  activate(r: Resolved): Promise<{ ok: boolean; detail?: string }>;
  log(event: string, fields?: Record<string, unknown>): void;
}

export const EXIT = { ok: 0, build: 1, transfer: 2, activate: 3, config: 4, busy: 75 } as const;

/**
 * One queue pass. Resolves the heads, skips what is deployed or known bad, builds one release at a time and, when a
 * newer head arrived during the build, drops the stale build and builds only the latest (`maxBuilds` bounds starvation).
 */
export async function runQueue(
  state: QueueState,
  deps: QueueDeps,
  opts: { dryRun?: boolean; maxBuilds?: number } = {},
): Promise<number> {
  const maxBuilds = opts.maxBuilds ?? 3;
  let r = await deps.resolve();
  if (!opts.dryRun) state.writePending(r.id);
  for (let n = 1; ; n++) {
    const deployed = await deps.deployedId();
    const d = decide(r.id, deployed, state);
    if (d.action === "noop") {
      deps.log("noop", { id: d.id, reason: d.reason });
      return EXIT.ok;
    }
    if (opts.dryRun) {
      deps.log("dry-run", { id: r.id, deployed, sources: r.sources });
      return EXIT.ok;
    }
    deps.log("build-start", { id: r.id, sources: r.sources });
    let dir: string;
    try {
      dir = await deps.build(r);
    } catch (e) {
      state.markBad(r.id, `build: ${(e as Error).message}`);
      deps.log("build-failed", { id: r.id, error: (e as Error).message });
      return EXIT.build;
    }
    if (n < maxBuilds) {
      const latest = await deps.resolve();
      if (latest.id !== r.id) {
        deps.log("superseded", { built: r.id, latest: latest.id });
        state.writePending(latest.id);
        r = latest;
        continue;
      }
    }
    try {
      await deps.transfer(r, dir);
    } catch (e) {
      deps.log("transfer-failed", { id: r.id, error: (e as Error).message });
      return EXIT.transfer;
    }
    const a = await deps.activate(r);
    if (!a.ok) {
      state.markBad(r.id, `activate: ${a.detail ?? "failed"}`);
      deps.log("activate-failed", { id: r.id, detail: a.detail });
      return EXIT.activate;
    }
    deps.log("deployed", { id: r.id });
    if (n >= maxBuilds) return EXIT.ok;
    r = await deps.resolve();
    state.writePending(r.id);
  }
}

// ---------- artifacts ----------

export const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

export function listReleaseFiles(dir: string) {
  return readdirSync(dir)
    .filter(f => f !== "SHA256SUMS" && f !== "bad" && statSync(join(dir, f)).isFile())
    .sort();
}

export function writeSums(dir: string): string[] {
  const files = listReleaseFiles(dir);
  writeFileSync(join(dir, "SHA256SUMS"), files.map(f => `${sha256File(join(dir, f))}  ${f}`).join("\n") + "\n");
  return files;
}

/** Returns the names that are missing or whose digest differs; an empty array means the directory is intact. */
export function verifySums(dir: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(dir, "SHA256SUMS"), "utf8");
  } catch {
    return ["SHA256SUMS"];
  }
  const lines = text.split("\n").filter(Boolean);
  if (lines.length === 0) return ["SHA256SUMS"];
  const bad: string[] = [];
  for (const line of lines) {
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!m || m[2].includes("/") || m[2].includes("..")) {
      bad.push(line);
      continue;
    }
    const p = join(dir, m[2]);
    if (!existsSync(p) || sha256File(p) !== m[1]) bad.push(m[2]);
  }
  return bad;
}

// ---------- releases on disk ----------

/** Pinned names (current) are always kept; then the newest others until `keep` entries are kept. */
export function selectReleasesToKeep(
  releases: { name: string; mtimeMs: number }[],
  pinned: (string | null | undefined)[],
  keep: number,
): { keep: string[]; remove: string[] } {
  const pins = new Set(pinned.filter((x): x is string => !!x));
  const kept = new Set(pins);
  for (const r of [...releases].sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    if (kept.size >= Math.max(keep, pins.size)) break;
    kept.add(r.name);
  }
  return {
    keep: releases.filter(r => kept.has(r.name)).map(r => r.name),
    remove: releases.filter(r => !kept.has(r.name)).map(r => r.name),
  };
}

export function swapLink(link: string, target: string) {
  const tmp = `${link}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  symlinkSync(target, tmp, "dir");
  try {
    renameSync(tmp, link);
  } catch (e) {
    if (process.platform !== "win32") throw e;
    rmSync(link, { force: true, recursive: true });
    renameSync(tmp, link);
  }
}

export function readLink(link: string): string | null {
  try {
    return lstatSync(link).isSymbolicLink() ? resolve(dirname(link), readlinkSync(link)) : null;
  } catch {
    return null;
  }
}

export function readJson<T = any>(p: string): T | null {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function copyExecutable(from: string, to: string) {
  copyFileSync(from, to);
  chmodSync(to, 0o755);
}

export function dirSize(p: string): number {
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of readdirSync(p)) total += dirSize(join(p, e));
  return total;
}

export function freeBytes(path: string): number {
  const s = statfsSync(path);
  return Number(s.bavail) * Number(s.bsize);
}

export const GB = 1024 ** 3;

// ---------- file lock ----------

/** Re-executes the current script under `flock -n` once (exit 75 when another run holds the lock). */
export async function ensureFlock(lockPath: string, argv = process.argv.slice(1)): Promise<void> {
  if (process.env.APHRODY_DEPLOY_FLOCKED) return;
  mkdirSync(dirname(lockPath), { recursive: true });
  const proc = Bun.spawn({
    cmd: ["flock", "-n", "-E", String(EXIT.busy), lockPath, process.execPath, ...argv],
    env: { ...process.env, APHRODY_DEPLOY_FLOCKED: "1" } as Record<string, string>,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code === EXIT.busy) logEvent("busy", { lock: basename(lockPath) });
  process.exit(code);
}

export function appendLine(path: string, line: string) {
  try {
    appendFileSync(path, line + "\n");
  } catch {}
}
