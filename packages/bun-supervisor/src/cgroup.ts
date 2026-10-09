import { readFileSync } from "node:fs";

export interface Psi {
  avg10: number;
  avg60: number;
  total: number;
}

export interface CgroupStats {
  /** Absolute directory of the cgroup, or null when unknown. */
  dir: string | null;
  current: number | null;
  high: number | null;
  max: number | null;
  swapMax: number | null;
  events: { high: number | null; max: number | null; oom: number | null; oom_kill: number | null };
  psi: { some: Psi | null; full: Psi | null };
}

export interface ReadCgroupOptions {
  /** Returns the text of a file of the cgroup (`memory.current`, ...) or undefined. */
  read?: (file: string) => string | undefined;
}

const ROOT = "/sys/fs/cgroup";
let cachedDir: string | null | undefined;

/** Directory of this process's cgroup v2, from `/proc/self/cgroup`. */
export function cgroupDir(): string | null {
  if (cachedDir !== undefined) return cachedDir;
  cachedDir = null;
  try {
    for (const line of readFileSync("/proc/self/cgroup", "utf8").split("\n")) {
      if (line.startsWith("0::")) {
        cachedDir = ROOT + line.slice(3).replace(/\/+$/, "");
        break;
      }
    }
  } catch {}
  return cachedDir;
}

function limit(text: string | undefined): number | null {
  if (text === undefined) return null;
  const t = text.trim();
  if (t === "max") return Infinity;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function keyed(text: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of (text ?? "").split("\n")) {
    const [k, v] = line.trim().split(/\s+/);
    if (k && v !== undefined && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out;
}

export function parsePsi(text: string | undefined): { some: Psi | null; full: Psi | null } {
  const out: { some: Psi | null; full: Psi | null } = { some: null, full: null };
  for (const line of (text ?? "").split("\n")) {
    const [kind, ...fields] = line.trim().split(/\s+/);
    if (kind !== "some" && kind !== "full") continue;
    const kv = Object.fromEntries(fields.map((f) => f.split("=") as [string, string]));
    out[kind] = {
      avg10: Number(kv.avg10 ?? 0),
      avg60: Number(kv.avg60 ?? 0),
      total: Number(kv.total ?? 0),
    };
  }
  return out;
}

/** Reads memory accounting of the process cgroup. Missing files give null fields. */
export function readCgroup(opts: ReadCgroupOptions = {}): CgroupStats {
  const dir = opts.read ? null : cgroupDir();
  const read =
    opts.read ??
    ((file: string) => {
      if (!dir) return undefined;
      try {
        return readFileSync(`${dir}/${file}`, "utf8");
      } catch {
        return undefined;
      }
    });
  const ev = keyed(read("memory.events"));
  return {
    dir,
    current: limit(read("memory.current")),
    high: limit(read("memory.high")),
    max: limit(read("memory.max")),
    swapMax: limit(read("memory.swap.max")),
    events: {
      high: ev.high ?? null,
      max: ev.max ?? null,
      oom: ev.oom ?? null,
      oom_kill: ev.oom_kill ?? null,
    },
    psi: parsePsi(read("memory.pressure")),
  };
}
