#!/usr/bin/env bun
// Crash dump -> symbolized backtrace for a Windows bun build.
//
//   bun scripts/aphrody/win-crash.ts run [--exe build/release/bun-profile.exe] [--out C:/CrashDumps/bun] -- <bun args>
//   bun scripts/aphrody/win-crash.ts analyze <dump.dmp> [--pdb build/release] [--full]
//
// `run` launches the exe under procdump (first-chance access violation, full dump) because bun's libuv sets
// SEM_NOGPFAULTERRORBOX (vendor/libuv/src/win/core.c) which disables WER LocalDumps for bun processes.
// `analyze` opens the dump in cdb with the PDB directory + the Microsoft symbol server and prints the
// faulting frame and the stack. Needs procdump and cdb (installed shims in ~/.local/bin).
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const cmd = args.shift();

function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args.splice(i, 2)[1];
}
function bool(name: string): boolean {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

const symbolPath = (pdbDir: string) => `${pdbDir};srv*C:\\symbols*https://msdl.microsoft.com/download/symbols`;

async function analyze(dump: string, pdbDir: string, full: boolean) {
  const script = [".ecxr", "kn 40", ".lastevent", full ? "!analyze -v" : "", "q"].filter(Boolean).join("; ");
  const p = Bun.spawn(["cdb", "-z", dump, "-y", symbolPath(pdbDir), "-lines", "-c", script], {
    stdout: "inherit",
    stderr: "inherit",
  });
  return await p.exited;
}

if (cmd === "run") {
  const exe = resolve(root, flag("--exe", "build/release/bun-profile.exe")!);
  const out = flag("--out", "C:/CrashDumps/bun")!;
  const sep = args.indexOf("--");
  const rest = sep >= 0 ? args.slice(sep + 1) : args;
  mkdirSync(out, { recursive: true });
  const before = new Set(readdirSync(out));
  const p = Bun.spawn(["procdump", "-accepteula", "-ma", "-e", "1", "-f", "C0000005", "-x", out, exe, ...rest], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await p.exited;
  const fresh = readdirSync(out)
    .filter(f => f.endsWith(".dmp") && !before.has(f))
    .map(f => join(out, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!fresh) {
    console.error("no dump produced (no access violation)");
    process.exit(1);
  }
  console.log(`\ndump: ${fresh}`);
  process.exit(await analyze(fresh, resolve(exe, ".."), bool("--full")));
} else if (cmd === "analyze") {
  const full = bool("--full");
  const pdb = resolve(root, flag("--pdb", "build/release")!);
  const dump = args[0];
  if (!dump || !existsSync(dump)) {
    console.error("usage: win-crash.ts analyze <dump.dmp> [--pdb dir] [--full]");
    process.exit(2);
  }
  process.exit(await analyze(dump, pdb, full));
} else {
  console.error("usage: win-crash.ts run [--exe e] [--out dir] -- <bun args> | analyze <dump> [--pdb dir] [--full]");
  process.exit(2);
}
