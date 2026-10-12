#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const VENDOR = join(ROOT, "vendor");

async function git(args: string[]) {
  const proc = Bun.spawn(["git", "-C", ROOT, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  return stdout;
}

async function references(name: string): Promise<number> {
  const patterns = [`vendor/${name}`, `vendor\\${name}`];
  const output = await git([
    "grep",
    "-l",
    "-I",
    ...patterns.flatMap(pattern => ["-e", pattern]),
    "--",
    ".",
    ":!vendor/**",
  ]).catch(() => "");
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(path => !path.startsWith("vendor/")).length;
}

async function main() {
  const entries = [];
  for (const entry of new Bun.Glob("*").scanSync({ cwd: VENDOR, onlyFiles: false })) {
    const path = join(VENDOR, entry);
    if (!existsSync(path)) continue;
    let files = 0;
    let bytes = 0;
    for (const file of new Bun.Glob("**/*").scanSync({ cwd: path, onlyFiles: true })) {
      const stat = await Bun.file(join(path, file)).stat();
      files++;
      bytes += stat.size;
    }
    const receipt = join(path, ".bun-vendor.json");
    const refFile = join(path, ".ref");
    const buildDefinition = join(ROOT, "scripts", "build", "deps", `${entry}.ts`);
    const linkedEntries = readdirSync(path, { withFileTypes: true }).filter(entry => entry.isSymbolicLink()).length;
    const tracked = (await git(["ls-files", "--", `vendor/${entry}`])).split(/\r?\n/).filter(Boolean).length;
    entries.push({
      name: entry,
      bytes,
      files,
      tracked,
      gitCheckout: existsSync(join(path, ".git")),
      receipt: existsSync(receipt),
      ref: existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : null,
      buildDefinition: existsSync(buildDefinition),
      state:
        files === 0
          ? linkedEntries > 0
            ? "linked"
            : "empty"
          : existsSync(buildDefinition) || existsSync(receipt) || existsSync(refFile)
            ? "managed"
            : "manual",
      references: await references(entry),
    });
  }
  entries.sort((a, b) => b.bytes - a.bytes);
  console.log(
    JSON.stringify({ schema: 1, root: ROOT, generatedAt: new Date().toISOString(), vendors: entries }, null, 2),
  );
}

if (import.meta.main)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
