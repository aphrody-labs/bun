import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const project = resolve(process.env.BENCH_PROJECT);
if (readFileSync(join(project, ".benchmark-owned"), "utf8").trim() !== "bun-products-benchmark-v1")
  throw new Error("Refuse non-benchmark project");
const variant = process.env.BENCH_VARIANT;
if (process.env.BENCH_CACHE === "cold") rmSync(join(project, ".next"), { recursive: true, force: true });
const require = createRequire(join(project, "package.json"));
const next = require.resolve("next/dist/bin/next");
const args =
  variant === "node" ? [next, "build"] : [process.env.BENCH_ROOT + "/packages/bun-next/bin/next-bun.js", "build"];
const command = variant === "node" ? process.env.BENCH_NODE : process.env.BENCH_BUN;
const start = performance.now();
const built = spawnSync(command, args, {
  cwd: project,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_SKIP_ISOLATED_VALIDATION: "1" },
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (built.status !== 0) throw new Error(built.stdout + "\n" + built.stderr);
const workMs = performance.now() - start;
const html = readFileSync(join(project, ".next", "server", "pages", "index.html"), "utf8");
const main = html
  .match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1]
  ?.replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\s+/g, " ")
  .trim();
if (!main?.includes("benchmark-42") || !main.includes("item-99")) throw new Error("Incomplete page output");
if (!existsSync(join(project, ".next", "build-manifest.json"))) throw new Error("Missing build manifest");
console.log("BENCH_RESULT " + JSON.stringify({ workMs, value: createHash("sha256").update(main).digest("hex") }));
