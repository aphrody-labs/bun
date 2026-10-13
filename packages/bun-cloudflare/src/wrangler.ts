// Runs the bin of any catalog package (wrangler, workerd, create-cloudflare, opennextjs-cloudflare, vinext)
// with the Bun runtime that launched this module.
import { dirname, join } from "node:path";
import { catalog } from "./catalog.ts";

/** Absolute path of a bin installed by a catalog package. */
export function resolveBin(bin: string, from: string = import.meta.dir): string {
  const entry = catalog.find(e => e.bins?.includes(bin));
  if (!entry) throw new Error(`unknown Cloudflare bin: ${bin}`);
  const manifestPath = Bun.resolveSync(`${entry.name}/package.json`, from);
  const manifest = require(manifestPath);
  const target = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
  if (!target) throw new Error(`${entry.name} does not declare bin ${bin}`);
  return join(dirname(manifestPath), target);
}

export type ExecOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio?: "inherit" | "pipe";
  input?: string;
};

/** Spawns a catalog bin with the current Bun (every catalog bin is a JS entry point, workerd included). */
export function exec(bin: string, args: string[], options: ExecOptions = {}) {
  const cmd = [process.execPath, resolveBin(bin), ...args];
  const stdio = options.stdio ?? "inherit";
  const child = Bun.spawn({
    cmd,
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: options.input === undefined ? (stdio === "inherit" ? "inherit" : "ignore") : "pipe",
    stdout: stdio,
    stderr: stdio,
  });
  if (options.input !== undefined) {
    if (!child.stdin || typeof child.stdin === "number") throw new Error("Cloudflare command stdin unavailable");
    child.stdin.write(options.input);
    child.stdin.end();
  }
  return child;
}

/** `wrangler <args>` under Bun. */
export function wrangler(args: string[], options?: ExecOptions) {
  return exec("wrangler", args, options);
}
