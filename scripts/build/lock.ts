/**
 * Several local builds of one build directory at once (parallel agents, a
 * build next to a `bun bd test` still running the old binary) corrupt ninja's
 * state and, on Windows, fail the link: the running bun-debug.exe cannot be
 * overwritten. A build takes the directory's lock, waits its turn, and moves a
 * binary that is still running out of the linker's way.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Blocks until this process holds `<buildDir>/.build.lock`; returns its release (also run at exit). A dead holder's lock is taken over. */
export function lockBuildDir(buildDir: string, log: (line: string) => void): () => void {
  mkdirSync(buildDir, { recursive: true });
  const path = join(buildDir, ".build.lock");
  let announced = 0;
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, `${process.pid}\n${process.argv.slice(1).join(" ")}\n`);
      closeSync(fd);
      const release = () => {
        try {
          if (readFileSync(path, "utf8").startsWith(`${process.pid}\n`)) rmSync(path, { force: true });
        } catch {}
      };
      process.on("exit", release);
      return release;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    let holder = "";
    try {
      holder = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const pid = Number.parseInt(holder, 10);
    if (!Number.isFinite(pid) || !alive(pid)) {
      rmSync(path, { force: true });
      continue;
    }
    if (pid !== announced) {
      log(`waiting for ${buildDir} (built by pid ${holder.trim().replace("\n", ": ")})`);
      announced = pid;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
}

/**
 * Windows refuses to overwrite a running executable but lets it be renamed.
 * The running image moves to `<exe>.<n>.old` and an identical copy (same
 * mtime: CopyFileW keeps it, so ninja sees nothing new) takes its place; the linker may then
 * replace that copy. Old images no longer running are deleted.
 */
export function unlockRunningExe(exe: string): void {
  if (process.platform !== "win32") return;
  const dir = dirname(exe);
  const base = basename(exe);
  for (const f of readdirSync(dir)) {
    if (f.startsWith(`${base}.`) && f.endsWith(".old")) {
      try {
        rmSync(join(dir, f));
      } catch {}
    }
  }
  if (!existsSync(exe)) return;
  try {
    closeSync(openSync(exe, "r+"));
    return;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") throw e;
  }
  const old = `${exe}.${Date.now()}.old`;
  renameSync(exe, old);
  copyFileSync(old, exe);
}
