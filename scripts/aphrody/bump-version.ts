// Sets one version across the root, every first-party package.json and every
// first-party Cargo manifest whose version is the current or previous release
// line. Packages with their own scheme (bun-runtime-sdk, bun-video) keep it.
//
//   bun scripts/aphrody/bump-version.ts <x.y.z> [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const target = process.argv[2];
const dry = process.argv.includes("--dry-run");
if (!target || !/^\d+\.\d+\.\d+$/.test(target)) throw new Error("usage: bump-version.ts <x.y.z> [--dry-run]");

const own = new Set(["packages/bun-runtime-sdk/package.json", "packages/bun-video/package.json"]);
const files = Bun.spawnSync(["git", "ls-files", "*package.json", "*Cargo.toml"], { cwd: ROOT })
  .stdout.toString()
  .split("\n")
  .filter(f => f && !f.startsWith("vendor/") && !f.startsWith("test/") && !f.includes("node_modules") && !own.has(f));

const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version as string;
const lines = new Set([root, "1.4.4", "1.4.5"]);
let changed = 0;
for (const f of files) {
  const text = readFileSync(join(ROOT, f), "utf8");
  let next = text;
  if (f.endsWith("package.json")) {
    next = text.replace(/^(\s{2}"version":\s*")([^"]+)(")/m, (m, a, v, b) => (lines.has(v) ? a + target + b : m));
  } else {
    let section = "";
    next = text
      .split("\n")
      .map(l => {
        const h = /^\[([^\]]+)\]/.exec(l);
        if (h) section = h[1]!;
        const m = /^(version\s*=\s*")([^"]+)(")/.exec(l);
        if (m && (section === "package" || section === "workspace.package") && lines.has(m[2]!)) {
          return l.replace(m[0], m[1] + target + m[3]);
        }
        // An exact requirement on a workspace crate of the release line (`version = "=1.4.6"`) moves with it.
        if (m && section.startsWith("dependencies.") && m[2]!.startsWith("=") && lines.has(m[2]!.slice(1))) {
          return l.replace(m[0], m[1] + "=" + target + m[3]);
        }
        return l;
      })
      .join("\n");
  }
  if (next !== text) {
    changed++;
    console.log(f);
    if (!dry) writeFileSync(join(ROOT, f), next);
  }
}
console.log(`${changed} manifests -> ${target}${dry ? " (dry run)" : ""}`);
