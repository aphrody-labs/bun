// SPDX-License-Identifier: Apache-2.0
/**
 * Processes of the host: /proc on Linux, `bun:windows` processes.list() on Windows (`tasklist` through
 * `Bun.spawn` when this Bun has no bun:windows) and `ps` elsewhere.
 */
import { readdir } from "node:fs/promises";
import { loadOsModule } from "./modules";

export interface ProcessRow {
  pid: number;
  ppid: number | null;
  name: string;
  rssBytes: number | null;
  /** Started by this WebOS server (its own pid, or one of its children). */
  owned: boolean;
}

const PAGE = 4096;

async function linuxProcesses(): Promise<Omit<ProcessRow, "owned">[]> {
  const pids = (await readdir("/proc")).filter(name => /^\d+$/.test(name));
  const rows = await Promise.all(
    pids.map(async pid => {
      const stat = await Bun.file(`/proc/${pid}/stat`)
        .text()
        .catch(() => null);
      if (stat === null) return null;
      // pid (comm) state ppid ... ; comm may hold spaces and parentheses.
      const open = stat.indexOf("(");
      const close = stat.lastIndexOf(")");
      const fields = stat.slice(close + 2).split(" ");
      return {
        pid: Number(pid),
        ppid: Number(fields[1]),
        name: stat.slice(open + 1, close),
        rssBytes: Number(fields[21]) * PAGE,
      };
    }),
  );
  return rows.filter(row => row !== null);
}

/** `tasklist /fo csv /nh`: "name","pid","session","#","12,345 K". */
export function parseTasklist(csv: string): Omit<ProcessRow, "owned">[] {
  const rows: Omit<ProcessRow, "owned">[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"([^"]*)"/g)].map(m => m[1]);
    if (cells.length < 5 || !/^\d+$/.test(cells[1])) continue;
    const kb = Number(cells[4].replace(/[^\d]/g, ""));
    rows.push({ pid: Number(cells[1]), ppid: null, name: cells[0], rssBytes: Number.isFinite(kb) ? kb * 1024 : null });
  }
  return rows;
}

/** `ps -axo pid=,ppid=,rss=,comm=`. */
export function parsePs(text: string): Omit<ProcessRow, "owned">[] {
  const rows: Omit<ProcessRow, "owned">[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), name: m[4].trim(), rssBytes: Number(m[3]) * 1024 });
  }
  return rows;
}

async function run(cmd: string[]): Promise<string> {
  await using proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited with ${code}: ${err.trim()}`);
  return out;
}

export async function listProcesses(owned: ReadonlySet<number>): Promise<{ source: string; processes: ProcessRow[] }> {
  let source: string;
  let rows: Omit<ProcessRow, "owned">[];
  if (process.platform === "linux") {
    source = "/proc";
    rows = await linuxProcesses();
  } else if (process.platform === "win32") {
    const windows = await loadOsModule("bun:windows");
    if (windows?.isSupported) {
      source = "bun:windows processes.list()";
      rows = (windows.processes.list() as { pid: number; ppid: number; name: string }[]).map(p => ({
        pid: p.pid,
        ppid: p.ppid,
        name: p.name,
        rssBytes: null,
      }));
    } else {
      source = "tasklist";
      rows = parseTasklist(await run(["tasklist", "/fo", "csv", "/nh"]));
    }
  } else {
    source = "ps";
    rows = parsePs(await run(["ps", "-axo", "pid=,ppid=,rss=,comm="]));
  }
  const processes = rows
    .map(row => ({ ...row, owned: row.pid === process.pid || owned.has(row.pid) || row.ppid === process.pid }))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || (b.rssBytes ?? 0) - (a.rssBytes ?? 0));
  return { source, processes };
}
