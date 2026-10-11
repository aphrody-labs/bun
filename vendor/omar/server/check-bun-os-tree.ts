import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";

const repo = "C:/bun";
const run = (args: string[]) => {
  const result = Bun.spawnSync({ cmd: ["git", "-C", repo, ...args], stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout);
};
const entries = run(["ls-tree", "-rz", "bun-os/main"]).split("\0").filter(Boolean);
const blobs = new Map<string, { oid: string; mode: string }>();
for (const entry of entries) {
  const tab = entry.indexOf("\t");
  const [mode, , oid] = entry.slice(0, tab).split(" ");
  blobs.set(entry.slice(tab + 1).replaceAll("\\", "/"), { oid, mode });
}
const status = run(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean);
const mismatches: string[] = [];
let lineEndingOnly = 0;
const checked = new Set<string>();
for (const record of status) {
  const path = record.slice(3).replaceAll("\\", "/");
  if (!path || checked.has(path)) continue;
  checked.add(path);
  const target = blobs.get(path);
  const absolute = resolve(repo, path);
  const exists = existsSync(absolute);
  if (!target) {
    if (exists) mismatches.push(`unexpected: ${path}`);
    continue;
  }
  if (!exists) {
    mismatches.push(`missing: ${path}`);
    continue;
  }
  const bytes = target.mode === "120000" ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
  const actual = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
  if (actual !== target.oid) {
    const expected = Bun.spawnSync({ cmd: ["git", "-C", repo, "cat-file", "blob", `bun-os/main:${path}`], stdout: "pipe" }).stdout;
    const normalize = (value: Buffer) => value.toString("utf8").replace(/\r\n/gu, "\n");
    if (normalize(bytes) === normalize(expected)) lineEndingOnly++;
    else mismatches.push(`different: ${path}`);
  }
}
console.log(JSON.stringify({ changedPaths: status.length, checkedPaths: checked.size, lineEndingOnly, mismatches: mismatches.length, examples: mismatches.slice(0, 30) }));
